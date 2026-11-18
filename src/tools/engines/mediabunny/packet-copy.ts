/**
 * Lossless copy: moves encoded packets into a new file without decoding them. The one packet-copy
 * implementation, shared by remux (convert, remove metadata, rotate by metadata, remove audio), trim,
 * split and extract audio. The equivalent of ffmpeg's `-c copy`.
 *
 * Why not mediabunny's Conversion: it re-encodes any track whose first timestamp is before its start
 * (conversion.js, `firstTimestamp < this._startTimestamp` for video, `needsTrimming` for audio).
 * AAC from ffmpeg, phones and cameras opens with a priming packet at a negative time (-0.023 s),
 * so every "copy" of such a file re-encoded its sound, and any cut later than 0 s re-encoded all.
 *
 * How the start is handled (mediabunny cannot write negative timestamps, nor an edit list with a
 * media time, nor a Matroska CodecDelay; those are written afterwards):
 * - MP4, MOV, M4A: sound packets before the start (the source's priming, or one packet of decoder
 *   pre-roll before a cut) are kept, and an edit list tells players to skip them and to stop where
 *   the range ends, exactly as the source signalled it (./edit-list).
 * - Matroska and WebM: the same packets are kept and the track's CodecDelay says how much to skip;
 *   the last block's DiscardPadding says where the sound ends (./matroska-timing). Before this the
 *   whole file was shifted, so copied AAC played its priming: 23 ms late, 3.04 s for 3.00 s.
 * - Other audio-only containers: a whole file is shifted as one, priming included (what ffmpeg does
 *   with `-avoid_negative_ts make_non_negative`); a cut takes the packets whose middle falls inside
 *   it. Opus in Ogg gets its end granule (./ogg-opus).
 * A Matroska source's own CodecDelay (or Opus pre-skip), which mediabunny does not read, is applied
 * to its packet times first, so MKV → MP4 keeps the priming behind the edit list too.
 * Video in a range starts on the key frame at or before the start, which becomes the output's zero.
 * Runs in the engine worker; no network access (README.md#privacy-and-processing §2).
 */
import {
  BlobSource,
  BufferSource,
  EncodedAudioPacketSource,
  type EncodedPacket,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Input,
  type InputAudioTrack,
  type InputTrack,
  type InputVideoTrack,
  type MetadataTags,
  MP4,
  Output,
  QTFF,
} from "mediabunny";
import { containerById } from "@/content/formats/containers";
import { formatDuration } from "@/lib/format";
import { codecName } from "../convert-video/plan";
import { classifyError, EngineError } from "../errors";
import type { OpenClip } from "../merge/concat";
import type { EngineContext, EngineResult } from "../types";
import { applyPrimingEdits, editTrailingMoov, type PrimingEdit } from "./edit-list";
import { flacVariableBlocks, renumberFlacFrame } from "./flac-tail";
import { fileOfInput } from "./input-files";
import { type MatroskaTrackPlan, opusEnd, rewriteMatroska, sourceDelay } from "./matroska-timing";
import { MP3_DECODER_DELAY, readMp3Gapless, withMp3Gapless } from "./mp3-gapless";
import { fixOggOpus } from "./ogg-opus";
import { opusPacketSamples } from "./opus-delay";
import { discardPaddingOf, opusSourceEnd } from "./opus-source";
import { clearTimesIn, openOutputStore, bytesOf as wholeBytes } from "./output-store";
import { soundTrackEnd } from "./pre-roll";
import { type ContainerId, containers, type OutputId, openInput } from "./shared";

const EPS = 1e-6;
/** Packets past the end kept waiting for a later B-frame that needs them; more than this and we stop. */
const MAX_PENDING = 32;

type MediaTrack = InputVideoTrack | InputAudioTrack;

interface CoreJob {
  input: Input;
  /** Video and audio tracks to copy, in output order. Their codecs must fit `to`. */
  tracks: MediaTrack[];
  to: OutputId;
  /** Source times; omit for the whole file. `end` omitted runs to the end of the file. */
  range?: { start: number; end?: number };
  /** Degrees added to each video track's rotation (rotation written as metadata). */
  rotate?: number;
  /** Written to the output; omit for none. */
  tags?: MetadataTags;
  /** Clear the MP4/MOV header times mediabunny stamps with the writing time (remove metadata). */
  clearTimes?: boolean;
  /**
   * The sound track players should pick (select audio tracks): it is marked default and the other
   * sound tracks are not. Omit to keep every track's own disposition.
   */
  defaultAudio?: MediaTrack;
  ctx: EngineContext;
  onProgress: (ratio: number) => void;
}

interface CoreResult {
  parts: BlobPart[];
  /** Source time of the output's zero. */
  start: number;
  /** Source time the copied picture (or, without video, sound) ends. */
  end: number;
}

/**
 * An audio-only MP3 source's gapless window (./mp3-gapless): its packet times run that far ahead of
 * its sound (LAME delay and the decoder's 529 samples), which mediabunny does not apply.
 */
async function mp3Gapless(t: InputAudioTrack) {
  const file = fileOfInput(t.input);
  if (t.codec !== "mp3" || !file || !/mp3/i.test((await t.input.getFormat()).name))
    return undefined;
  return readMp3Gapless(new Uint8Array(await file.slice(0, 65_536).arrayBuffer()));
}

/** AAC-LC (1024-sample frames), from the AudioSpecificConfig's object type. */
function aacLc(config: AudioDecoderConfig | null): boolean {
  const d = config?.description;
  if (!d) return false;
  const b = ArrayBuffer.isView(d)
    ? new Uint8Array(d.buffer, d.byteOffset, d.byteLength)
    : new Uint8Array(d);
  return b.length > 0 && (b[0] ?? 0) >> 3 === 2;
}

const isoBmff = (to: OutputId) => to === "mp4" || to === "mov" || to === "m4a";
const matroska = (to: OutputId) => to === "mkv" || to === "webm";
/** SeekPreRoll the Matroska Opus mapping asks for, in nanoseconds. */
const OPUS_SEEK_PRE_ROLL_NS = 80_000_000;

/** Thrown when a file cannot be copied faithfully; remux callers fall back to a Conversion. */
class NotCopyable extends Error {}

async function copyCore(job: CoreJob): Promise<CoreResult> {
  const { ctx, range } = job;
  const check = () => {
    if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
  };
  const iso = isoBmff(job.to);
  const mkv = matroska(job.to);
  // Containers that can say "skip this much at the start": an edit list, or CodecDelay.
  // An MP3 says it too, in the LAME tag of its Info frame (./mp3-gapless `withMp3Gapless`).
  const mp3Out = job.to === "mp3";
  const signals = iso || mkv || mp3Out;
  const videos = job.tracks.filter((t): t is InputVideoTrack => t.isVideoTrack());
  const audios = job.tracks.filter((t): t is InputAudioTrack => t.isAudioTrack());
  const firsts = new Map<MediaTrack, EncodedPacket>();
  const delays = new Map<MediaTrack, number>();
  /** An MP3 source's gapless end, in its packet times (./mp3-gapless). */
  const gaplessEnds = new Map<MediaTrack, number | undefined>();
  for (const t of job.tracks) {
    const p = await new EncodedPacketSink(t).getFirstPacket();
    if (p) firsts.set(t, p);
    if (t.isAudioTrack()) {
      const g = await mp3Gapless(t);
      if (g) gaplessEnds.set(t, g.endSec);
      delays.set(t, (await sourceDelay(t)) + (g?.skipSec ?? 0));
    }
  }
  // Sound tracks read from a Matroska file (whole-millisecond block times).
  const matroskaSource = new Map<MediaTrack, boolean>();
  for (const t of job.tracks)
    if (t.isAudioTrack())
      matroskaSource.set(t, /matroska|webm/i.test((await t.input.getFormat()).name));
  /** A packet's presentation time: its time less the source's start delay. */
  const at = (t: MediaTrack, p: EncodedPacket) => p.timestamp - (delays.get(t) ?? 0);
  // Where each video track starts: its key frame at or before the range start, or its first packet.
  const keys = new Map<InputVideoTrack, EncodedPacket>();
  for (const v of videos) {
    const sink = new EncodedPacketSink(v);
    const key = range
      ? ((await sink.getKeyPacket(range.start + EPS, { verifyKeyPackets: true })) ??
        (await sink.getFirstKeyPacket({ verifyKeyPackets: true })))
      : firsts.get(v);
    if (key) keys.set(v, key);
  }

  let origin: number;
  if (range) {
    // A start before the first key frame (the file's own start) stays the origin, so sound before
    // the first picture is kept; a listed key frame that turns out not to be one moves it back.
    origin = Math.min(range.start, ...[...keys.values()].map((k) => k.timestamp));
  } else {
    const first = Math.min(...[...firsts.entries()].map(([t, p]) => at(t, p)));
    // MP4/MOV and Matroska keep a negative sound start behind an edit list or CodecDelay; other
    // containers shift everything.
    origin = !Number.isFinite(first) ? 0 : signals ? Math.max(0, first) : first;
    for (const v of videos) {
      const vFirst = await v.getFirstTimestamp();
      if (vFirst >= origin - EPS) continue;
      // Matroska shifts a picture that starts before zero, sound with it; in MP4/MOV an edit list
      // is only written for sound, so a picture before zero needs a Conversion.
      if (mkv) origin = vFirst;
      else throw new NotCopyable();
    }
  }
  const end = range?.end;
  const duration =
    (await job.input.getDurationFromMetadata()) ?? (await job.input.computeDuration());
  const length = Math.max(EPS, Math.min(end ?? duration, duration) - origin);
  const leader: MediaTrack | undefined = videos[0] ?? audios[0];

  // A copy is about as large as what it copies; large ones stream to disk (./output-store).
  const sources = new Set(job.tracks.map((t) => fileOfInput(t.input)));
  const expected = [...sources].reduce((n, f) => n + (f?.size ?? 0), 0);
  const store = await openOutputStore(expected);
  const output = new Output({
    format: containers[job.to].format({ streamed: store.streamed }),
    target: store.target,
  });
  if (job.tags) output.setMetadataTags(job.tags);
  const pumps: (() => Promise<void>)[] = [];
  /** Packets written, all tracks: a copy that wrote none is an error, never a success. */
  let written = 0;
  const edits: { index: number; lead: number; endSec: number }[] = [];
  const mkvPlans: {
    number: number;
    lead: number;
    endSec: number;
    opus: boolean;
    ends: number[];
  }[] = [];
  const oggOpus: { endSec: number }[] = [];
  const mp3Plans: { lead: number; endSec: number; rate: number }[] = [];
  let mp3Frames = 0;
  let lastEnd = origin;
  const extra = job.rotate ?? 0;
  const trackMeta = async (t: MediaTrack) => {
    const disposition = await t.getDisposition();
    return {
      languageCode:
        /^[a-z]{3}$/.test(t.languageCode) && t.languageCode !== "und" ? t.languageCode : undefined,
      name: (await t.getName()) ?? undefined,
      disposition:
        job.defaultAudio && t.isAudioTrack()
          ? { ...disposition, default: t === job.defaultAudio }
          : disposition,
    };
  };

  for (const v of videos) {
    const key = keys.get(v);
    if (!v.codec || !key) continue;
    const source = new EncodedVideoPacketSource(v.codec);
    const rotation = ((((v.rotation + extra) % 360) + 360) % 360) as 0 | 90 | 180 | 270;
    // Only MP4/MOV hold a rotation flag; elsewhere the picture is turned upright by a Conversion.
    if (rotation !== 0 && !iso) throw new NotCopyable();
    output.addVideoTrack(source, { rotation, ...(await trackMeta(v)) });
    const config = await v.getDecoderConfig();
    pumps.push(async () => {
      const sink = new EncodedPacketSink(v);
      let sent = false;
      const send = async (packet: EncodedPacket) => {
        await source.add(
          packet.clone({ timestamp: packet.timestamp - origin }),
          sent ? undefined : { decoderConfig: config ?? undefined },
        );
        sent = true;
        written++;
        if (v === leader) {
          lastEnd = Math.max(lastEnd, packet.timestamp + packet.duration);
          job.onProgress(Math.min(1, (packet.timestamp - origin) / length));
        }
      };
      // Packets past the end are held back: a later B-frame shown before the end may need one of
      // them as a reference, in which case it is kept too. A key frame past the end closes the range.
      const pending: EncodedPacket[] = [];
      for await (const packet of sink.packets(key, undefined, { verifyKeyPackets: true })) {
        check();
        // Leading pictures of an open GOP point back before the start: they cannot be shown.
        if (range && packet.timestamp < key.timestamp - EPS) continue;
        if (end !== undefined && packet.timestamp >= end - EPS) {
          if (packet.type === "key" || pending.length >= MAX_PENDING) break;
          pending.push(packet);
          continue;
        }
        for (const held of pending.splice(0)) await send(held);
        await send(packet);
      }
    });
  }

  for (const [index, a] of audios.entries()) {
    const first = firsts.get(a);
    if (!a.codec || !first) continue;
    const source = new EncodedAudioPacketSource(a.codec);
    output.addAudioTrack(source, await trackMeta(a));
    const number = output.tracks.length;
    const config = await a.getDecoderConfig();
    const sink = new EncodedPacketSink(a);
    const delay = delays.get(a) ?? 0;
    // Where this track's copy begins, and what its timestamps are shifted by.
    let from = first;
    let shift = origin;
    let midRule = false;
    if (range && !signals) {
      // Containers that cannot skip into a packet: the packets whose middle falls inside the range.
      from = (await sink.getPacket(origin + delay)) ?? first;
      midRule = true;
    } else if (range && at(a, first) < origin - EPS) {
      // Decoder pre-roll: the packet before the one holding the start, skipped by the edit list.
      const holding = (await sink.getPacket(origin + delay)) ?? first;
      from = (await sink.getPacket(holding.timestamp - EPS)) ?? holding;
      // MP3 frames borrow bits from the frames before them (the bit reservoir): one more frame, or
      // the first one after the cut decodes as silence (the click at the cut vanished).
      if (a.codec === "mp3") from = (await sink.getPacket(from.timestamp - EPS)) ?? from;
    }
    // Matroska block times are whole milliseconds: a sound of one frame size (MP3, AAC-LC) is put
    // back on its frame grid, counted from its first packet (a cut was 0.33 ms off otherwise).
    const frameDur = matroskaSource.get(a)
      ? a.codec === "mp3"
        ? (a.sampleRate >= 32_000 ? 1152 : 576) / a.sampleRate
        : a.codec === "aac" && aacLc(config)
          ? 1024 / a.sampleRate
          : undefined
      : undefined;
    const grid = (t: number) =>
      frameDur ? at(a, first) + Math.round((t - at(a, first)) / frameDur) * frameDur : t;
    if (signals && grid(at(a, from)) < origin - EPS) shift = grid(at(a, from));
    const lead = origin - shift;
    // An Opus source in Ogg or WebM says where its sound ends (./opus-source); mediabunny does not.
    const file = fileOfInput(a.input);
    const ownEnd = a.codec === "opus" && file ? await opusSourceEnd(file, a) : undefined;
    // A Matroska or MP3 source's own end, in sound time (its raw end less the start delay).
    const rawEnd = gaplessEnds.has(a)
      ? (gaplessEnds.get(a) ?? (await soundTrackEnd(a, file)))
      : delay > 0
        ? await soundTrackEnd(a, file)
        : undefined;
    const delayedEnd = rawEnd !== undefined ? rawEnd - delay : undefined;
    const lastSound = Math.min(
      duration,
      ownEnd ?? Number.POSITIVE_INFINITY,
      a.codec === "opus" ? Number.POSITIVE_INFINITY : (delayedEnd ?? Number.POSITIVE_INFINITY),
    );
    const soundEnd = Math.min(end ?? lastSound, lastSound) - origin;
    // Plans that say where the sound ends; refined after the copy for Matroska sources (below).
    const ending: { endSec: number }[] = [];
    if (iso && lead > EPS) {
      const e = { index, lead, endSec: soundEnd };
      edits.push(e);
      ending.push(e);
    }
    const ends: number[] = [];
    if (mkv) {
      const m = { number, lead, endSec: soundEnd, opus: a.codec === "opus", ends };
      mkvPlans.push(m);
      ending.push(m);
    }
    if (mp3Out && a.codec === "mp3") {
      const m = { lead, endSec: soundEnd, rate: a.sampleRate };
      mp3Plans.push(m);
      ending.push(m);
    }
    // Ogg: the zero is the source's own (its pre-skip puts the first packet before it).
    if (job.to === "ogg" && a.codec === "opus")
      oggOpus.push({ endSec: soundEnd + Math.min(0, origin) });
    pumps.push(async () => {
      let sent = false;
      // mediabunny trims the last packet's duration to the source's edit list; a codec frame is
      // what the decoder outputs, so the longest packet seen stands for it.
      let frame = 0;
      // From Matroska, block times are whole milliseconds (ffmpeg's drift up to 1 ms against the
      // sound). Opus packets say their own length and AAC-LC frames are 1024 samples, so those are
      // timed from their sample counts instead, exact to the sample.
      const samplesOf = matroskaSource.get(a)
        ? a.codec === "opus"
          ? (p: EncodedPacket) => opusPacketSamples(p.data) / 48_000
          : a.codec === "aac" && aacLc(config)
            ? () => 1024 / a.sampleRate
            : a.codec === "mp3"
              ? () => (a.sampleRate >= 32_000 ? 1152 : 576) / a.sampleRate
              : undefined
        : undefined;
      let lastData: Uint8Array | undefined;
      let base: number | undefined;
      let counted = 0;
      let flacFrames = 0;
      for await (const packet of sink.packets(from)) {
        check();
        if (samplesOf && base === undefined) base = grid(at(a, packet));
        const t = samplesOf && base !== undefined ? base + counted : at(a, packet);
        const span = samplesOf?.(packet);
        if (span !== undefined) counted += span;
        const mid = t + packet.duration / 2;
        if (midRule && mid < origin) continue;
        if (end !== undefined && (midRule ? mid >= end : t >= end - EPS)) break;
        // Matroska: a packet wholly after the sound's end is the encoder's padding.
        // (2 ms of slack: Matroska sources time packets in whole milliseconds.)
        if (mkv && sent && t - origin >= soundEnd + 0.002) break;
        // A FLAC file cut out of another is renumbered from 0, as ffmpeg does (./flac-tail).
        const flacData =
          job.to === "flac" && a.codec === "flac"
            ? renumberFlacFrame(
                packet.data,
                flacVariableBlocks(packet.data)
                  ? Math.round(Math.max(0, t - shift) * a.sampleRate)
                  : flacFrames++,
              )
            : undefined;
        await source.add(
          packet.clone({
            ...(flacData ? { data: flacData } : {}),
            timestamp: Math.max(0, t - shift),
            ...(span !== undefined ? { duration: span } : {}),
          }),
          sent ? undefined : { decoderConfig: config ?? undefined },
        );
        sent = true;
        written++;
        lastData = packet.data;
        if (mp3Out) mp3Frames++;
        frame = Math.max(frame, packet.duration);
        ends[0] = t + frame - origin;
        if (a === leader) {
          lastEnd = Math.max(lastEnd, packet.timestamp + packet.duration);
          job.onProgress(Math.min(1, Math.max(0, t - origin) / length));
        }
      }
      // A whole Matroska sound timed by sample count ends where its packets end, less the last
      // block's DiscardPadding, as ffmpeg plays it: exact to the sample (block times and the
      // header's duration are whole milliseconds).
      if (end === undefined && samplesOf && base !== undefined && lastData && file) {
        const tail = new Uint8Array(
          await file.slice(Math.max(0, file.size - (1 << 18))).arrayBuffer(),
        );
        const discardNs = discardPaddingOf(tail, lastData) ?? 0;
        const exact = base + counted - discardNs / 1e9 - origin;
        for (const e of ending) e.endSec = exact;
      }
    });
  }

  try {
    await output.start();
    // All tracks advance together so the muxer can interleave them.
    await Promise.all(pumps.map((p) => p()));
    if (written === 0)
      throw new EngineError(
        "unsupported-input",
        "No video or sound could be read from this file, so nothing was written.",
        "The file may be damaged or cut short. Try the original, or a copy that plays in a media player.",
      );
    await output.finalize();
  } catch (e) {
    await output.cancel().catch(() => undefined);
    await store.discard();
    throw e;
  }
  let data: ArrayBuffer | Blob = await store.finish();
  if (job.clearTimes && iso) data = await clearTimesIn(data);
  job.onProgress(1);
  // Matroska and Ogg rewrites take the whole file; a streamed one too large to read back stays as
  // muxed (its sound timing then as mediabunny wrote it).
  const whole = async () =>
    data instanceof ArrayBuffer ? new Uint8Array(data) : await wholeBytes(data);

  let parts: BlobPart[] = [data];
  if (mkvPlans.length > 0) {
    // CodecDelay for what is kept before the start, DiscardPadding for what runs past the end.
    const plans = new Map<number, MatroskaTrackPlan>();
    for (const m of mkvPlans) {
      const discardNs = Math.round(Math.max(0, (m.ends[0] ?? 0) - m.endSec) * 1e9);
      if (m.lead <= EPS && discardNs <= 0) continue;
      plans.set(m.number, {
        codecDelayNs: m.lead > EPS ? Math.round(m.lead * 1e9) : undefined,
        ...(m.opus && m.lead > EPS
          ? { opusPreSkip: Math.round(m.lead * 48_000), seekPreRollNs: OPUS_SEEK_PRE_ROLL_NS }
          : {}),
        // Opus: counted from the packets themselves, exact to the sample (Matroska times are
        // whole milliseconds).
        end: m.opus
          ? opusEnd(Math.round(m.lead * 48_000), m.endSec)
          : (frames) => ({ keep: frames.length, discardNs, endSec: m.endSec }),
      });
    }
    const bytes = await whole();
    if (bytes) parts = rewriteMatroska(bytes, plans) ?? parts;
  }
  const mp3 = mp3Plans[0];
  if (mp3 && mp3Frames > 0) {
    // The encoder delay is what is kept before the start less the decoder's own 529 samples; the
    // padding is what runs past the sound's end.
    const bytes = await whole();
    const spf = mp3.rate >= 32_000 ? 1152 : 576;
    const delay = Math.max(0, Math.round(mp3.lead * mp3.rate) - MP3_DECODER_DELAY);
    const sound = Number.isFinite(mp3.endSec) ? Math.round(mp3.endSec * mp3.rate) : undefined;
    const padding = sound !== undefined ? mp3Frames * spf - delay - sound : 0;
    const fixed = bytes
      ? withMp3Gapless(bytes, { delay, padding: Math.max(0, padding), frames: mp3Frames })
      : null;
    if (fixed) parts = [fixed];
  }
  if (oggOpus[0] && Number.isFinite(oggOpus[0].endSec)) {
    const bytes = await whole();
    const fixed = bytes ? fixOggOpus(bytes, { endSec: oggOpus[0].endSec }) : null;
    if (fixed) parts = [fixed];
  }
  if (edits.length > 0) {
    // mediabunny writes tracks in the order they were added: the nth sound track read back is ours.
    const back = new Input({
      source: data instanceof ArrayBuffer ? new BufferSource(data) : new BlobSource(data),
      formats: [MP4, QTFF],
    });
    try {
      const written = await back.getAudioTracks();
      const list: PrimingEdit[] = edits.flatMap(({ index, lead, endSec }) => {
        const t = written[index];
        return t ? [{ trackId: t.id, primingSec: lead, endSec }] : [];
      });
      // In memory the index is first and the media moves; streamed, the index is last and edited alone.
      const edited =
        data instanceof ArrayBuffer
          ? applyPrimingEdits(new Uint8Array(data), list)
          : await editTrailingMoov(data, (moov) => applyPrimingEdits(moov, list, false));
      parts = edited ?? parts;
    } finally {
      back.dispose();
    }
  }
  return { parts, start: origin, end: lastEnd };
}

const supportedBy = (to: OutputId) => containers[to].format().getSupportedCodecs() as string[];

/**
 * Whole-file copy of tracks that may come from different inputs: a picture re-encoded on its own
 * next to the source's sound, copied as it is (video-filter/picture). `input` supplies the duration;
 * the sound keeps its priming behind an edit list in MP4/MOV exactly as in a remux. Errors are
 * thrown unclassified; a picture that starts before zero cannot be copied (throws).
 */
export async function copyTracks(job: {
  input: Input;
  tracks: MediaTrack[];
  to: OutputId;
  tags?: MetadataTags;
  /** The sound track to mark default (select audio tracks); the others are marked not default. */
  defaultAudio?: MediaTrack;
  ctx: EngineContext;
  onProgress?: (ratio: number) => void;
}): Promise<BlobPart[]> {
  const r = await copyCore({ ...job, onProgress: job.onProgress ?? (() => undefined) });
  return r.parts;
}

/** Throws when the container cannot hold the clip's video codec as it is. */
export function assertCopyable(clip: OpenClip, to: ContainerId): void {
  if (clip.video && !supportedBy(to).includes(clip.video.codec ?? "")) {
    throw new EngineError(
      "unsupported-output",
      `The ${to.toUpperCase()} container cannot hold this video codec without re-encoding.`,
      "Turn on frame-accurate cuts, or convert the video to MP4 first.",
    );
  }
}

export interface CopyRange {
  /** Source time the output starts at; the video starts on the key frame at or before it. */
  start: number;
  /** Source time to stop before; omit to copy to the end of the file. */
  end?: number;
}

export interface CopyResult {
  blob: Blob;
  /** Source time the output's zero corresponds to. */
  start: number;
  /** Source time the last copied frame (or, without video, sound) ends. */
  end: number;
  /** False when the container could not hold the sound, which is then left out. */
  withAudio: boolean;
}

/**
 * Trim and split: one range of the clip's primary video and sound. `onProgress` gets 0–1 of the
 * range written. The caller owns `clip` (and disposes its input); errors are thrown unclassified.
 */
export async function copyPackets(
  clip: OpenClip,
  range: CopyRange,
  to: ContainerId,
  ctx: EngineContext,
  onProgress: (ratio: number) => void = () => undefined,
): Promise<CopyResult> {
  assertCopyable(clip, to);
  const supported = supportedBy(to);
  // Sound the container cannot hold is left out rather than re-encoded (the caller says so).
  const withAudio = !!clip.audio?.codec && supported.includes(clip.audio.codec);
  const tracks: MediaTrack[] = [];
  if (clip.video) tracks.push(clip.video);
  if (clip.audio && withAudio) tracks.push(clip.audio);
  const tags = await clip.input.getMetadataTags().catch(() => undefined);
  const r = await copyCore({ input: clip.input, tracks, to, range, tags, ctx, onProgress });
  return {
    blob: new Blob(r.parts, { type: containers[to].mime }),
    start: r.start,
    end: r.end,
    withAudio,
  };
}

export interface RemuxJob {
  file: File;
  to: OutputId;
  outputName: string;
  /** False drops every sound track (remove audio). */
  audio?: boolean;
  /** Degrees added to the video rotation, written as metadata (rotate). */
  rotate?: number;
  /** Clear the header times mediabunny stamps with the writing time (remove metadata). */
  clearTimes?: boolean;
  /** Tags for the output: omit to carry the input's over; a function maps them (`() => ({})` for none). */
  tags?: MetadataTags | ((input: MetadataTags) => MetadataTags | Promise<MetadataTags>);
  ffmpegCommand: string;
  ctx: EngineContext;
}

/**
 * Whole-file copy of every video and sound track into `to`. Returns null, having written nothing,
 * when a track's codec does not fit the container or the file cannot be copied faithfully; the
 * caller then runs a Conversion, which re-encodes what it must.
 */
export async function remux(job: RemuxJob): Promise<EngineResult | null> {
  const { ctx } = job;
  if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
  ctx.onProgress({ phase: "analyzing", ratio: 0, detail: "Reading the file" });
  const input = openInput(job.file);
  try {
    const all = (await input.getTracks()).filter(
      (t): t is MediaTrack => t.isVideoTrack() || t.isAudioTrack(),
    ) as MediaTrack[];
    const tracks = all.filter((t: InputTrack) => job.audio !== false || !t.isAudioTrack());
    // The capability table decides what a container holds without re-encoding (one source of
    // truth); mediabunny's muxers accept more than players do (Opus in MOV, FLAC in MP4).
    const supported = supportedBy(job.to);
    const row = containerById.get(job.to);
    const fits = (t: MediaTrack) =>
      !!t.codec &&
      supported.includes(t.codec) &&
      (!row || (t.isVideoTrack() ? row.videoCodecs : row.audioCodecs).includes(t.codec));
    // The picture and the main sound must fit, or a Conversion re-encodes them. A further sound track
    // the container cannot hold (AC-3 beside AAC in an M4V) is left out and the result says so;
    // Conversion would drop it as well (browsers cannot decode AC-3) and re-encode the rest.
    const main = await input.getPrimaryAudioTrack();
    const leftOut = tracks.filter((t) => !fits(t));
    if (tracks.length === 0 || leftOut.some((t) => t.isVideoTrack() || t.id === main?.id))
      return null;
    const kept = tracks.filter(fits);
    let tags: MetadataTags = {};
    try {
      const own = await input.getMetadataTags();
      tags = typeof job.tags === "function" ? await job.tags(own) : (job.tags ?? own);
    } catch {
      // Tags are a convenience; a file whose tags cannot be read still copies.
    }
    const duration = (await input.getDurationFromMetadata()) ?? 0;
    const r = await copyCore({
      input,
      tracks: kept,
      to: job.to,
      rotate: job.rotate,
      tags,
      clearTimes: job.clearTimes,
      ctx,
      onProgress: (ratio) =>
        ctx.onProgress({
          phase: "processing",
          ratio,
          detail:
            duration > 0
              ? `${formatDuration(ratio * duration)} of ${formatDuration(duration)} copied`
              : "Copying",
        }),
    });
    ctx.onProgress({ phase: "finishing", ratio: 1, detail: "Writing the file" });
    const codecs = [
      ...new Set(leftOut.map((t) => codecName(t.codec ?? undefined) ?? "unknown")),
    ].join(", ");
    return {
      blob: new Blob(r.parts, { type: containers[job.to].mime }),
      filename: job.outputName,
      ffmpegCommand: job.ffmpegCommand,
      meta:
        leftOut.length > 0
          ? `streams copied · ${leftOut.length === 1 ? "1 extra sound track" : `${leftOut.length} extra sound tracks`} (${codecs}) left out: ${row?.name ?? job.to.toUpperCase()} cannot hold ${leftOut.length === 1 ? "it" : "them"} as ${leftOut.length === 1 ? "it is" : "they are"}`
          : undefined,
    };
  } catch (e) {
    if (e instanceof NotCopyable) return null;
    if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
    throw classifyError(e);
  } finally {
    input.dispose();
  }
}

export interface AudioCopyJob {
  file: File;
  to: OutputId;
  range?: { start: number; end: number };
  ctx: EngineContext;
}

/** Extract audio: the primary sound track alone, copied into an audio container. */
export async function copyPrimaryAudio(job: AudioCopyJob): Promise<Blob> {
  const { ctx } = job;
  const input = openInput(job.file);
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track?.codec)
      throw new EngineError(
        "unsupported-input",
        "This file has no audio track that can be copied.",
      );
    if (!supportedBy(job.to).includes(track.codec))
      throw new EngineError("internal", `${job.to} cannot hold ${track.codec} as it is.`);
    let tags: MetadataTags | undefined;
    try {
      tags = await input.getMetadataTags();
    } catch {
      // Tags are a convenience; a file whose tags cannot be read still copies.
    }
    const duration = (await input.getDurationFromMetadata()) ?? (await input.computeDuration());
    const origin = job.range?.start ?? 0;
    const total = Math.max(0, Math.min(job.range?.end ?? duration, duration) - origin);
    const r = await copyCore({
      input,
      tracks: [track],
      to: job.to,
      range: job.range,
      tags,
      ctx,
      onProgress: (ratio) =>
        ctx.onProgress({
          phase: "processing",
          ratio,
          detail: `${formatDuration(ratio * total)} of ${formatDuration(total)} copied`,
        }),
    });
    ctx.onProgress({ phase: "finishing", ratio: 1, detail: "Writing the file" });
    return new Blob(r.parts, { type: containers[job.to].mime });
  } catch (e) {
    if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
    throw classifyError(e);
  } finally {
    input.dispose();
  }
}
