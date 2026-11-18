/**
 * Lossless join: copies every encoded packet of every clip into one output, shifting timestamps so
 * each clip starts where the previous one ended. Nothing is decoded. The equivalent of ffmpeg's
 * concat demuxer with `-c copy`. Runs in the engine worker; no network access.
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
  type InputVideoTrack,
  MP4,
  Output,
  QTFF,
} from "mediabunny";
import { formatDuration } from "@/lib/format";
import { classifyError, EngineError } from "../errors";
import { applyPrimingEdits, editTrailingMoov } from "../mediabunny/edit-list";
import { fileOfInput } from "../mediabunny/input-files";
import { openOutputStore } from "../mediabunny/output-store";
import { type ContainerId, containers, openInput } from "../mediabunny/shared";
import type { EngineContext } from "../types";

export interface OpenClip {
  name: string;
  input: Input;
  video: InputVideoTrack | null;
  audio: InputAudioTrack | null;
  videoConfig: VideoDecoderConfig | null;
  audioConfig: AudioDecoderConfig | null;
  /** First presentation time and end of the clip, in the clip's own timeline. */
  start: number;
  end: number;
}

export async function openClip(file: File): Promise<OpenClip> {
  const input = openInput(file);
  const video = await input.getPrimaryVideoTrack();
  const audio = await input.getPrimaryAudioTrack();
  const [videoConfig, audioConfig] = await Promise.all([
    video?.getDecoderConfig() ?? null,
    audio?.getDecoderConfig() ?? null,
  ]);
  const edges = async (track: InputVideoTrack | InputAudioTrack | null) => {
    if (!track) return undefined;
    const sink = new EncodedPacketSink(track);
    const first = await sink.getFirstPacket({ metadataOnly: true });
    const last = await sink.getPacket(Number.POSITIVE_INFINITY, { metadataOnly: true });
    if (!first || !last) return undefined;
    return { start: first.timestamp, end: last.timestamp + last.duration };
  };
  const [v, a] = await Promise.all([edges(video), edges(audio)]);
  // The picture sets the clip's start; the clip ends when its longest track ends.
  const start = v?.start ?? a?.start ?? 0;
  const end = Math.max(v?.end ?? 0, a?.end ?? 0, start);
  return { name: file.name, input, video, audio, videoConfig, audioConfig, start, end };
}

const sameBytes = (a?: AllowSharedBufferSource, b?: AllowSharedBufferSource) => {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const x = ArrayBuffer.isView(a)
    ? new Uint8Array(a.buffer, a.byteOffset, a.byteLength)
    : new Uint8Array(a);
  const y = ArrayBuffer.isView(b)
    ? new Uint8Array(b.buffer, b.byteOffset, b.byteLength)
    : new Uint8Array(b);
  if (x.byteLength !== y.byteLength) return false;
  for (let i = 0; i < x.byteLength; i++) if (x[i] !== y[i]) return false;
  return true;
};

/**
 * The check the page cannot make: identical codec configuration records (H.264 SPS/PPS, AAC
 * AudioSpecificConfig). One output track has one configuration, so every clip must share it.
 * Returns the reason when they differ, undefined when a copy is safe.
 */
export function configMismatch(clips: OpenClip[], to: ContainerId): string | undefined {
  const [first, ...rest] = clips;
  if (!first) return "No clips.";
  const supported = containers[to].format().getSupportedCodecs() as string[];
  if (first.video && !supported.includes(first.video.codec ?? ""))
    return `The ${to.toUpperCase()} container cannot hold this video codec.`;
  if (first.audio && !supported.includes(first.audio.codec ?? ""))
    return `The ${to.toUpperCase()} container cannot hold this audio codec.`;
  for (const [i, c] of rest.entries()) {
    const n = `Clip ${i + 2}`;
    if (!!c.video !== !!first.video || !!c.audio !== !!first.audio)
      return `${n} has different tracks from clip 1.`;
    const v = c.videoConfig;
    const v0 = first.videoConfig;
    if (v && v0) {
      if (
        v.codec !== v0.codec ||
        v.codedWidth !== v0.codedWidth ||
        v.codedHeight !== v0.codedHeight ||
        !sameBytes(v.description, v0.description) ||
        c.video?.rotation !== first.video?.rotation
      )
        return `${n} was encoded with other video settings than clip 1.`;
    }
    const a = c.audioConfig;
    const a0 = first.audioConfig;
    if (a && a0) {
      if (
        a.codec !== a0.codec ||
        a.sampleRate !== a0.sampleRate ||
        a.numberOfChannels !== a0.numberOfChannels ||
        !sameBytes(a.description, a0.description)
      )
        return `${n} was encoded with other audio settings than clip 1.`;
    }
  }
  return undefined;
}

export async function concatCopy(
  clips: OpenClip[],
  to: ContainerId,
  ctx: EngineContext,
): Promise<Blob> {
  const [first] = clips;
  if (!first) throw new EngineError("internal", "No clips to merge.");
  const { mime } = containers[to];
  // A join is as large as its clips together; large ones stream to disk (../mediabunny/output-store).
  const store = await openOutputStore(
    clips.reduce((n, c) => n + (fileOfInput(c.input)?.size ?? 0), 0),
  );
  const output = new Output({
    format: containers[to].format({ streamed: store.streamed }),
    target: store.target,
  });
  const videoSource =
    first.video?.codec && first.videoConfig
      ? new EncodedVideoPacketSource(first.video.codec)
      : null;
  const audioSource =
    first.audio?.codec && first.audioConfig
      ? new EncodedAudioPacketSource(first.audio.codec)
      : null;
  if (videoSource) output.addVideoTrack(videoSource, { rotation: first.video?.rotation });
  if (audioSource) output.addAudioTrack(audioSource);

  const total = clips.reduce((s, c) => s + (c.end - c.start), 0);
  const iso = to === "mp4" || to === "mov";
  let offset = 0;
  let videoEnd = 0;
  let firstVideo = true;
  let firstAudio = true;
  // Sound is written as one unbroken run of packets: `written` is the next packet's timestamp.
  // In MP4/MOV the first clip's AAC priming packet is kept as decoder pre-roll and an edit list
  // skips it (`lead`); presentation time is `written - lead`.
  let written = 0;
  let lead = 0;
  const check = () => {
    if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
  };

  const copyVideo = async (clip: OpenClip, i: number, shift: number) => {
    if (!clip.video || !videoSource) return;
    for await (const packet of new EncodedPacketSink(clip.video).packets()) {
      check();
      const out: EncodedPacket = packet.clone({
        timestamp: Math.max(0, packet.timestamp + shift),
      });
      await videoSource.add(
        out,
        firstVideo && first.videoConfig ? { decoderConfig: first.videoConfig } : undefined,
      );
      firstVideo = false;
      videoEnd = Math.max(videoEnd, out.timestamp + out.duration);
      const done = offset + (packet.timestamp - clip.start);
      ctx.onProgress({
        phase: "processing",
        ratio: total > 0 ? Math.min(1, done / total) : 0,
        detail: `Clip ${i + 1} of ${clips.length} · ${formatDuration(done)} of ${formatDuration(total)} copied`,
        item: { index: i, count: clips.length },
      });
    }
  };

  /**
   * One clip's sound, appended to the unbroken run. Players decode AAC packet after packet, so a
   * clip's sound starts wherever the previous clip's sound ended. To keep it with the picture, the
   * last packet of a clip is left out when more than half of it would play past the clip's end (it
   * is mostly encoder padding, which the source's edit list hid): each join is then off by at most
   * half a packet (11.6 ms at 44.1 kHz) and the error never adds up. Before, the whole last packet
   * was kept and every later clip was pushed behind it (+18.6 ms per join for ffmpeg's AAC).
   */
  const copyAudio = async (clip: OpenClip, i: number, clipStart: number, clipEnd: number) => {
    if (!clip.audio || !audioSource) return;
    const last = i === clips.length - 1;
    let started = false;
    // What one packet decodes to. A container may list the last packet shorter (ffmpeg's `stts`
    // gives it only the samples that are heard), but the decoder still plays the whole frame.
    let frame = 0;
    for await (const packet of new EncodedPacketSink(clip.audio).packets()) {
      check();
      frame = Math.max(frame, packet.duration);
      const rel = packet.timestamp - clip.start;
      if (rel + packet.duration <= 1e-6) {
        // Priming before the clip's first frame: kept once, at the very start, in MP4/MOV only.
        if (!(i === 0 && iso && written - lead < 1e-6)) continue;
        lead += frame;
      } else {
        const at = written - lead;
        if (!started) {
          // A clip whose sound starts later than its picture keeps that gap (timestamps).
          const expected = clipStart + Math.max(0, rel);
          if (expected - at > frame / 2) written = expected + lead;
          started = true;
        }
        const now = written - lead;
        if (!last && now >= clipEnd - frame / 2) break;
        if (last && rel >= clipEnd - clipStart) break;
      }
      await audioSource.add(
        packet.clone({ timestamp: written, duration: frame }),
        firstAudio && first.audioConfig ? { decoderConfig: first.audioConfig } : undefined,
      );
      firstAudio = false;
      written += frame;
    }
  };

  try {
    await output.start();
    for (const [i, clip] of clips.entries()) {
      check();
      const span = clip.end - clip.start;
      // Both tracks advance together so the muxer can interleave them.
      await Promise.all([
        copyVideo(clip, i, offset - clip.start),
        copyAudio(clip, i, offset, offset + span),
      ]);
      offset += span;
      offset = Math.max(offset, videoEnd);
    }
    ctx.onProgress({ phase: "finishing", ratio: 1, detail: "Writing the file" });
    await output.finalize();
  } catch (e) {
    await output.cancel().catch(() => undefined);
    await store.discard();
    if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
    throw classifyError(e);
  }
  const data = await store.finish();
  // MP4/MOV: an edit list skips the kept priming and ends the sound with the last clip.
  let parts: BlobPart[] = [data];
  if (iso && lead > 1e-6) {
    const back = new Input({
      source: data instanceof ArrayBuffer ? new BufferSource(data) : new BlobSource(data),
      formats: [MP4, QTFF],
    });
    try {
      const track = await back.getPrimaryAudioTrack();
      const edits = track ? [{ trackId: track.id, primingSec: lead, endSec: total }] : [];
      if (track)
        parts =
          (data instanceof ArrayBuffer
            ? applyPrimingEdits(new Uint8Array(data), edits)
            : await editTrailingMoov(data, (moov) => applyPrimingEdits(moov, edits, false))) ??
          parts;
    } finally {
      back.dispose();
    }
  }
  return new Blob(parts, { type: mime });
}
