/**
 * Shared mediabunny plumbing for WebCodecs-backed engines: inspection, conversion runner with
 * real progress, cancellation and failure classification. Runs inside the engine worker.
 * No network access here (README.md#privacy-and-processing §2).
 */
import {
  ALL_FORMATS,
  BlobSource,
  BufferSource,
  Conversion,
  type ConversionAudioOptions,
  ConversionCanceledError,
  type ConversionOptions,
  type ConversionVideoOptions,
  canEncodeVideo,
  type DiscardedTrack,
  EncodedPacketSink,
  FlacOutputFormat,
  Input,
  type InputTrack,
  type InputVideoTrack,
  type MetadataTags,
  MkvOutputFormat,
  MovOutputFormat,
  Mp3OutputFormat,
  Mp4OutputFormat,
  NullTarget,
  OggOutputFormat,
  Output,
  type OutputFormat,
  WavOutputFormat,
  WebMOutputFormat,
} from "mediabunny";
import { formatDuration } from "@/lib/format";
import { codecName } from "../convert-video/plan";
import { classifyError, EngineError, isEngineError } from "../errors";
import { containerVideoCodec } from "../inspect/codec-id";
import { unreadableFileError } from "../inspect/unreadable";
import { readTagValues } from "../strip-metadata/tags";
import type { EngineContext, EngineResult, MediaInfo } from "../types";
import { annexBSps, parseAvcSps } from "./avc-sps";
import { avcEncoderTrouble, noteSupportFailure } from "./encoder-probe";
import { flacSource, looksFlac } from "./flac-tail";
import { rememberFile } from "./input-files";
import { looksMatroska, matroskaSource } from "./matroska-repair";
import { readMovieHeaderTime } from "./movie-header";
import { opusEndGate } from "./opus-delay";
import { clearTimesIn, openOutputStore } from "./output-store";
import { copyTracks, remux } from "./packet-copy";
import { aacEncoderStart, withEncoderDelaySignalled } from "./priming";
import { soundSpan } from "./sound-span";
import { copiesDelayedSound, planSoundSplit, type SoundSplit } from "./sound-split";
import { looksTransportStream, transportStreamSource } from "./ts-stream-types";

export type ContainerId = "mp4" | "mov" | "webm" | "mkv";
/** Audio-only outputs (video → audio engine). MP3 is listed for stream copies only: WebCodecs has no MP3 encoder. */
export type AudioContainerId = "m4a" | "wav" | "ogg" | "flac" | "mp3";
export type OutputId = ContainerId | AudioContainerId;

/**
 * Each output container: its muxer and MIME type. `streamed` is set when the output streams to disk
 * (./output-store): MP4 and MOV then write their index last instead of assembling the whole file in
 * memory to put it first.
 */
export const containers: Record<
  OutputId,
  { format: (o?: { streamed?: boolean }) => OutputFormat; mime: string }
> = {
  mp4: {
    format: (o) => new Mp4OutputFormat({ fastStart: o?.streamed ? false : "in-memory" }),
    mime: "video/mp4",
  },
  mov: {
    format: (o) => new MovOutputFormat({ fastStart: o?.streamed ? false : "in-memory" }),
    mime: "video/quicktime",
  },
  webm: { format: () => new WebMOutputFormat(), mime: "video/webm" },
  mkv: { format: () => new MkvOutputFormat(), mime: "video/x-matroska" },
  m4a: {
    format: (o) => new Mp4OutputFormat({ fastStart: o?.streamed ? false : "in-memory" }),
    mime: "audio/mp4",
  },
  wav: { format: () => new WavOutputFormat(), mime: "audio/wav" },
  ogg: { format: () => new OggOutputFormat(), mime: "audio/ogg" },
  flac: { format: () => new FlacOutputFormat(), mime: "audio/flac" },
  mp3: { format: () => new Mp3OutputFormat(), mime: "audio/mpeg" },
};

/** Video codecs each container can hold without re-encoding. */
const containable: Record<ContainerId, readonly string[]> = {
  mp4: ["avc", "hevc", "av1", "vp9"],
  mov: ["avc", "hevc", "av1", "prores"],
  webm: ["vp8", "vp9", "av1"],
  mkv: ["avc", "hevc", "av1", "vp8", "vp9"],
};

export function canCopyVideo(codec: string | undefined, to: ContainerId): boolean {
  return !!codec && containable[to].includes(codec);
}

/**
 * The Input every engine reads a file through. FLAC files go through `flacSource` so a tiny last
 * frame is not dropped (./flac-tail), Matroska and WebM through `matroskaSource` so a file cut short
 * still reads up to its cut (./matroska-repair); everything else is a plain BlobSource.
 */
export function openInput(file: File): Input {
  const source = looksFlac(file)
    ? flacSource(file)
    : looksMatroska(file)
      ? matroskaSource(file)
      : // MPEG-TS sound filed as private data (192-byte M2TS) gets its real stream type.
        looksTransportStream(file)
        ? transportStreamSource(file)
        : new BlobSource(file);
  const input = new Input({ source, formats: ALL_FORMATS });
  rememberFile(input, file);
  return input;
}

export async function inspect(file: File): Promise<MediaInfo> {
  const input = openInput(file);
  let format: Awaited<ReturnType<Input["getFormat"]>>;
  try {
    format = await input.getFormat();
  } catch {
    // What is wrong (an image renamed .mp4, a text file, damaged data) and every format pages read.
    throw await unreadableFileError(file, "unrecognised");
  }
  const video = await input.getPrimaryVideoTrack();
  const audioTracks = await input.getAudioTracks();
  // A codec mediabunny cannot name (H.263, MPEG-4 Part 2, FFV1) or a stream it does not list (Theora).
  const named = video?.codec ? undefined : await containerVideoCodec(file, format.name);
  if (!video && audioTracks.length === 0 && typeof named !== "object") {
    // An MP4 or MOV whose index (moov) was never written, or one cut off part-way (../inspect/unreadable).
    throw await unreadableFileError(file, "no-tracks");
  }
  // An audio file lasts as long as its sound (./sound-span): an MP3's LAME window, an Opus file's
  // end trimming, an MP3 without a Xing frame by its packets (its header guess read 4.05 s as 7 s).
  const firstAudio = audioTracks[0];
  // Where the file starts: an MPEG-TS starts at 1.4 s or more, an MP4 may carry an offset. Times on
  // the page are from that start; mediabunny reports the end, so the length is end − start.
  const start = video
    ? Math.max(
        0,
        Math.min(
          await video.getFirstTimestamp(),
          ...(await Promise.all(audioTracks.map((a) => a.getFirstTimestamp()))),
        ),
      )
    : 0;
  const duration =
    !video && firstAudio
      ? await soundSpan(file, input, firstAudio).then((s) => s.end - s.start)
      : ((await input.getDurationFromMetadata()) ?? (await input.computeDuration())) - start;

  // Bitrates are facts, so every packet counts where that is cheap: MP4/MOV/M4A list each packet's
  // size in their index, and an audio file is small. (60 packets of AAC read 111 kbps for a track
  // that averages 90.1.) Other video containers would be read end to end, so they take a sample.
  const exact = /mp4|quicktime|mov|m4a|3gp/i.test(format.name) || !video;
  const statsPackets = (sample: number) => (exact ? undefined : sample);
  // Codec parameter string and language are extra facts for the inspector; neither may fail the probe.
  const codecString = async (t: { getCodecParameterString(): Promise<string | null> }) => {
    try {
      return (await t.getCodecParameterString()) ?? undefined;
    } catch {
      return undefined;
    }
  };
  const language = (code: string | undefined) => (code && code !== "und" ? code : undefined);

  let v: MediaInfo["video"];
  if (video) {
    const stats = await video.computePacketStats(statsPackets(120));
    const size = await interlacedFrameSize(video);
    v = {
      codec: video.codec ?? (typeof named === "string" ? named : undefined) ?? "unknown",
      width: size?.width ?? video.displayWidth,
      height: size?.height ?? video.displayHeight,
      fps: stats.averagePacketRate,
      bitrate: stats.averageBitrate,
      rotation: video.rotation,
      codecString: await codecString(video),
      language: language(video.languageCode),
      decodable: await decodable(video),
    };
  }
  // Theora in Ogg: mediabunny lists no track, the identification header gives size and rate.
  if (!video && named && typeof named === "object")
    v = { codec: named.codec, width: named.width, height: named.height, fps: named.fps };
  const audio = await Promise.all(
    audioTracks.map(async (a) => {
      const s = await a.computePacketStats(statsPackets(60));
      return {
        codec: a.codec ?? "unknown",
        channels: a.numberOfChannels,
        sampleRate: a.sampleRate,
        bitrate: s.averageBitrate,
        codecString: await codecString(a),
        language: language(a.languageCode),
        // Name and default flag: extra facts for choosing tracks; neither may fail the probe.
        name: (await a.getName().catch(() => null)) ?? undefined,
        default: await a
          .getDisposition()
          .then((d) => d.default)
          .catch(() => undefined),
        decodable: await decodable(a),
      };
    }),
  );
  // Elsewhere the picture's rate is the file's average less its sound (a sample of the first 120
  // packets read 11.6 Mbps for a 10.0 Mbps file), container overhead included (about 1 %).
  if (v && !exact && duration > 0) {
    const sound = audio.reduce((n, a) => n + (a.bitrate ?? 0), 0);
    const average = (file.size * 8) / duration - sound;
    if (average > 0) v.bitrate = average;
  }
  let tags: MediaInfo["tags"];
  try {
    const t = await input.getMetadataTags();
    const rawKeys = Object.keys(t.raw ?? {});
    if (
      t.title ||
      t.artist ||
      t.album ||
      t.description ||
      t.comment ||
      t.genre ||
      t.date ||
      rawKeys.length > 0
    ) {
      tags = {
        title: t.title,
        artist: t.artist,
        album: t.album,
        description: t.description,
        comment: t.comment,
        genre: t.genre,
        date:
          t.date instanceof Date && !Number.isNaN(t.date.getTime())
            ? t.date.toISOString()
            : undefined,
        rawKeys,
        // Values of the identifying tags, so remove-metadata can show what it removes.
        ...readTagValues(t.raw ?? {}),
      };
    }
  } catch {
    // tags are a convenience; a file without readable tags is still fine
  }
  // The capture time lives in the MP4/MOV movie header, which the tag reader does not surface.
  const recordedAt = await readMovieHeaderTime(file);
  if (recordedAt) tags = { ...tags, recordedAt };
  return {
    container: format.name,
    durationSec: Math.max(0, duration),
    startSec: start > 0 ? start : undefined,
    sizeBytes: file.size,
    video: v,
    audio,
    tags,
  };
}

/**
 * Whether this browser decodes the track, asked with the track's own decoder configuration (mediabunny
 * `canDecode`, which calls WebCodecs `isConfigSupported`). Undefined without WebCodecs (tests in Node)
 * or when the question cannot be asked; never assumed from the codec name.
 */
async function decodable(track: InputTrack): Promise<boolean | undefined> {
  const api = track.isVideoTrack() ? "VideoDecoder" : "AudioDecoder";
  if (!(api in globalThis)) return undefined;
  try {
    return await track.canDecode();
  } catch {
    return undefined;
  }
}

/**
 * The real frame size of field-coded (interlaced) H.264 read from MPEG-TS, where mediabunny reports
 * the height of one field (720×576 as 720×288). Read from the stream's own SPS; undefined when the
 * reported size is already right (every other container carries the size in its headers).
 */
async function interlacedFrameSize(
  video: InputVideoTrack,
): Promise<{ width: number; height: number } | undefined> {
  if (video.codec !== "avc") return undefined;
  try {
    if ((await video.getDecoderConfig())?.description) return undefined;
    const key = await new EncodedPacketSink(video).getFirstKeyPacket();
    const sps = key ? annexBSps(key.data)[0] : undefined;
    const frame = sps ? parseAvcSps(sps) : undefined;
    if (!frame || frame.frameMbsOnly || frame.height <= video.codedHeight) return undefined;
    const turned = video.rotation === 90 || video.rotation === 270;
    return turned
      ? { width: frame.height, height: frame.width }
      : { width: frame.width, height: frame.height };
  } catch {
    return undefined;
  }
}

/**
 * False when this browser cannot decode the picture (`MediaInfo.video.decodable`, probed at
 * inspection: ProRes and, without platform support, HEVC in Chrome), with the reason noted for the
 * run's message. A native run would otherwise drop the picture and keep only the sound.
 */
export function pictureDecodes(...infos: (MediaInfo | undefined)[]): boolean {
  const bad = infos.find((i) => i?.video?.decodable === false);
  if (!bad?.video) return true;
  const name = codecName(bad.video.codec) ?? bad.video.codec;
  noteSupportFailure(
    new EngineError(
      "unsupported-input",
      `This browser cannot decode the ${name} video in this file, so it cannot be processed here.`,
      "Convert it to MP4 with the video converter first (it can use the ffmpeg engine), or try desktop Safari.",
    ),
  );
  return false;
}

/**
 * Whether this browser can encode H.264 at this size: the configuration check, then a real encode of
 * a few small frames (./encoder-probe), because an encoder can accept a configuration and never
 * return a frame. When the probe fails, the reason is noted for the run's error message.
 */
export async function canEncodeAvc(width = 1920, height = 1080): Promise<boolean> {
  if (!(await canEncodeVideo("avc", { width, height }))) return false;
  const trouble = await avcEncoderTrouble();
  noteSupportFailure(trouble);
  return trouble === null;
}

/** Seconds without a single sample handed on before a run counts as stalled (./encoder-probe). */
export const STALL_MS = 15_000;

export interface ConvertJob {
  file: File;
  to: OutputId;
  outputName: string;
  video?: ConversionVideoOptions;
  audio?: ConversionAudioOptions;
  trim?: { start?: number; end?: number };
  /** Tags written to the output. Omit to carry the input's tags over; `() => ({})` writes none. */
  tags?: ConversionOptions["tags"];
  /** Set the MP4/MOV header times (stamped with the writing time) to "not set": remove metadata. */
  clearTimes?: boolean;
  /**
   * The colour space the source's picture is decoded as, when its file does not say (an untagged SD
   * file is BT.601): every decoder configuration of the primary video track carries it. Measured on
   * an odd-sized untagged SD source through the canvas path: 39.2 dB RGB against 25.1 dB without.
   */
  decodeColorSpace?: VideoColorSpaceInit;
  /**
   * Seconds of sound the output holds, when `trim` includes decoder pre-roll that an `audio.process`
   * step drops (./audio-window). Otherwise worked out from `trim`.
   */
  soundEnd?: number;
  ffmpegCommand: string;
  ctx: EngineContext;
}

/**
 * What a job asks for when it only copies: whether sound is kept and any rotation written as
 * metadata. Undefined when anything is re-encoded, trimmed or reshaped.
 */
function copyOnly(job: ConvertJob): { audio: boolean; rotate: number } | undefined {
  if (job.trim) return undefined;
  const v = job.video as Record<string, unknown> | undefined;
  const a = job.audio as Record<string, unknown> | undefined;
  const vKeys = Object.keys(v ?? {}).filter((k) => v?.[k] !== undefined);
  const aKeys = Object.keys(a ?? {}).filter((k) => a?.[k] !== undefined);
  const rotate = typeof v?.rotate === "number" ? v.rotate : 0;
  const videoCopies =
    vKeys.length === 0 ||
    (vKeys.every((k) => k === "rotate" || k === "allowRotationMetadata") &&
      v?.allowRotationMetadata === true);
  // Rotation metadata lives in the MP4/MOV track header; elsewhere a rotation re-encodes.
  if (!videoCopies || (rotate !== 0 && job.to !== "mp4" && job.to !== "mov")) return undefined;
  if (aKeys.length === 0) return { audio: true, rotate };
  if (aKeys.length === 1 && a?.discard === true) return { audio: false, rotate };
  return undefined;
}

/**
 * Runs one mediabunny Conversion with honest progress and cancellation. A job that only copies goes
 * through the packet copy instead (./packet-copy): Conversion re-encodes AAC whose priming packet
 * sits before zero, which is most AAC from ffmpeg, phones and cameras.
 */
export async function convert(job: ConvertJob): Promise<EngineResult> {
  const { ctx } = job;
  if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
  const copy = copyOnly(job);
  if (copy) {
    const copied = await remux({
      file: job.file,
      to: job.to,
      outputName: job.outputName,
      audio: copy.audio,
      rotate: copy.rotate,
      tags: job.tags,
      clearTimes: job.clearTimes,
      ffmpegCommand: job.ffmpegCommand,
      ctx,
    });
    if (copied) return copied;
  }
  ctx.onProgress({ phase: "analyzing", ratio: 0, detail: "Reading the file" });

  const input = openInput(job.file);
  const { mime } = containers[job.to];
  if (job.decodeColorSpace) {
    // Instance-level: mediabunny reads the track's decoder configuration through this method.
    const video = await input.getPrimaryVideoTrack();
    if (video) {
      const own = video.getDecoderConfig.bind(video);
      const colorSpace = job.decodeColorSpace;
      video.getDecoderConfig = async () => {
        const config = await own();
        return config ? { ...config, colorSpace } : config;
      };
    }
  }
  // Large outputs stream to disk (./output-store): an output held in memory stops at 2 GiB.
  const store = await openOutputStore(job.file.size);
  const format = () => containers[job.to].format({ streamed: store.streamed });
  const output = new Output({ format: format(), target: store.target });

  // Sound re-encoded next to a picture decodes with pre-roll in a Conversion of its own (./sound-split).
  let split: SoundSplit | null = null;
  const conversions: Conversion[] = [];
  let soundEnd: number | undefined;
  /** True when an AAC encode was fed the encoder's silenced start first (./priming `addAacLead`). */
  let aacLead = false;
  try {
    // Sound that is only copied, from a source whose start delay mediabunny cannot see, is copied
    // by the packet copy next to the picture encoded alone (./sound-split `copiesDelayedSound`).
    if (
      (job.to === "mp4" || job.to === "mov" || job.to === "mkv" || job.to === "webm") &&
      (await copiesDelayedSound(input, format, job))
    ) {
      input.dispose();
      return await pictureThenSound(job);
    }
    split = await planSoundSplit(input, format, job);
    if (split) {
      output.setMetadataTags(await outputTags(input, output, job.tags));
      conversions.push(
        await Conversion.init({
          input,
          output,
          video: job.video,
          audio: split.pictureAudio,
          trim: { start: split.origin, end: job.trim?.end },
          composable: true,
          showWarnings: false,
        }),
        await Conversion.init({
          input,
          output,
          video: { discard: true },
          audio: split.soundAudio,
          trim: { start: split.decodeFrom, end: split.soundTrimEnd },
          composable: true,
          showWarnings: false,
        }),
      );
      soundEnd = split.soundEnd;
      const dropped = await promisedButDropped(
        input,
        conversions.flatMap((c) => c.discardedTracks),
        job.to,
      );
      if (output.tracks.length === 0 || !output.hasEnoughTracks() || dropped.length > 0)
        throw fromDiscarded(
          dropped.length > 0 ? dropped : conversions.flatMap((c) => c.discardedTracks),
        );
    } else {
      const sourceEnd = (await input.getDurationFromMetadata()) ?? Number.POSITIVE_INFINITY;
      soundEnd =
        job.soundEnd ?? Math.min(job.trim?.end ?? sourceEnd, sourceEnd) - (job.trim?.start ?? 0);
      // An Opus or AAC encode of sound alone ends exactly where the sound does, with the encoder's
      // flush silence after it (./opus-delay). With a picture kept and no split, the sound is copied
      // and must stay so.
      const soundOnly =
        !!(job.video as { discard?: boolean } | undefined)?.discard ||
        !(await input.getPrimaryVideoTrack());
      const gated =
        soundOnly &&
        (job.audio?.codec === "opus" || job.audio?.codec === "aac") &&
        !job.audio.discard &&
        Number.isFinite(soundEnd);
      let lead = 0;
      if (gated && job.audio?.codec === "aac") {
        const track = await input.getPrimaryAudioTrack();
        lead = (
          await aacEncoderStart(
            job.audio.sampleRate ?? track?.sampleRate ?? 48_000,
            job.audio.numberOfChannels ?? track?.numberOfChannels ?? 2,
          )
        ).lost;
        aacLead = true;
      }
      const conversion = await Conversion.init({
        input,
        output,
        video: job.video,
        audio:
          gated && job.audio
            ? {
                ...job.audio,
                process: opusEndGate(soundEnd, job.audio.process, job.audio.codec, lead),
              }
            : job.audio,
        trim: job.trim,
        tags: job.tags,
        showWarnings: false,
      });
      if (!conversion.isValid) throw fromDiscarded(conversion.discardedTracks);
      const dropped = await promisedButDropped(input, conversion.discardedTracks, job.to);
      if (dropped.length > 0) throw fromDiscarded(dropped);
      conversions.push(conversion);
    }
  } catch (e) {
    throw classifyError(e);
  }
  // The encoder's frame rate: Conversion passes none unless the rate changes, and Chromium's H.264
  // encoder then budgets bitrate ÷ 30 per frame, so a 60 fps picture came out at twice the asked
  // bitrate (1.47 Mb/s for 730 kb/s). MP4 and MOV ignore it otherwise; in Matroska it would also
  // round the timestamps to that rate, so there only a steady source's rate is given.
  await tellEncoderFrameRate(input, output, job);

  const total =
    job.trim?.end !== undefined && job.trim.start !== undefined
      ? job.trim.end - job.trim.start
      : ((await input.getDurationFromMetadata()) ?? 0);

  let cancelled = false;
  const onAbort = () => {
    if (cancelled) return;
    cancelled = true;
    for (const c of conversions) void c.cancel();
  };
  ctx.signal.addEventListener("abort", onAbort, { once: true });
  // With a split, the slower of the two Conversions (nearly always the picture) is the progress.
  const done = conversions.map(() => ({ ratio: 0, time: 0 }));
  let shown = -1;
  // Stall watchdog, tied to output, not to time: every sample a Conversion hands on reports here,
  // so a slow device keeps it quiet, while an encoder that stops returning frames (Playwright WebKit's
  // H.264, ./encoder-probe) stops the reports. Once every sample is in, flushing and writing the
  // file are not watched.
  let lastActivity = performance.now();
  let allIn = false;
  for (const [i, c] of conversions.entries()) {
    c.onProgress = (ratio, processedTime) => {
      lastActivity = performance.now();
      done[i] = { ratio, time: processedTime };
      if (total > 0 && Math.min(...done.map((d) => d.time)) >= total - 0.05) allIn = true;
      const r = Math.min(...done.map((d) => d.ratio));
      const t = Math.min(...done.map((d) => d.time));
      // The faster Conversion's steps do not move the slower one's figure: send only changes.
      if (r === shown) return;
      shown = r;
      ctx.onProgress({
        phase: "processing",
        ratio: r,
        detail:
          total > 0
            ? `${formatDuration(t)} of ${formatDuration(total)} processed`
            : `${formatDuration(t)} processed`,
      });
    };
  }

  const work = async () => {
    if (split) {
      await output.start();
      const runs = conversions.map((c) => c.execute());
      // One failing stops the other, so neither keeps encoding into a dead output.
      await Promise.all(runs).catch(async (e) => {
        onAbort();
        await Promise.allSettled(runs);
        throw e;
      });
      await output.finalize();
    } else {
      await conversions[0]?.execute();
    }
  };
  let watchdog: ReturnType<typeof setInterval> | undefined;
  const stalled = new Promise<never>((_, reject) => {
    watchdog = setInterval(() => {
      if (allIn || performance.now() - lastActivity < STALL_MS) return;
      clearInterval(watchdog);
      const at = Math.min(...done.map((d) => d.time));
      reject(
        new EngineError(
          "unsupported-output",
          `The browser's encoder stopped returning frames at ${formatDuration(at)}${total > 0 ? ` of ${formatDuration(total)}` : ""}, so the run was stopped after ${STALL_MS / 1000} seconds without progress.`,
          "Try again, or try desktop Chrome or Edge.",
        ),
      );
    }, 1000);
  });
  const running = work();
  // Settled either way; a stalled run is abandoned, not awaited.
  running.catch(() => undefined);
  try {
    await Promise.race([running, stalled]);
  } catch (e) {
    onAbort();
    if (split) await output.cancel().catch(() => undefined);
    await store.discard();
    if (isEngineError(e)) throw e;
    if (e instanceof ConversionCanceledError || ctx.signal.aborted) {
      throw new EngineError("cancelled", "Cancelled.");
    }
    throw classifyError(e);
  } finally {
    clearInterval(watchdog);
    ctx.signal.removeEventListener("abort", onAbort);
  }

  ctx.onProgress({ phase: "finishing", ratio: 1, detail: "Writing the file" });
  let data: ArrayBuffer | Blob = await store.finish();
  const keptVideo =
    !(job.video as { discard?: boolean } | undefined)?.discard &&
    containers[job.to].format().getSupportedVideoCodecs().length > 0;
  try {
    await assertOutputComplete(data, (await input.getVideoTracks()).length > 0, keptVideo);
  } catch (e) {
    await store.discard();
    throw e;
  }
  if (job.clearTimes) data = await clearTimesIn(data);
  // Encoded sound starts with the encoder's delay and ends with its padding: an edit list (AAC and
  // Opus in MP4), the Ogg end granule or Matroska CodecDelay and DiscardPadding say where the sound
  // fed in starts and stops (./priming). Copied sound is left alone.
  const parts = await withEncoderDelaySignalled(
    output,
    data,
    job.to,
    soundEnd !== undefined && Number.isFinite(soundEnd) && soundEnd > 0 ? soundEnd : undefined,
    // Where the sound was fed from: the output's zero, or later when the sound starts after the picture.
    split?.soundStart ?? 0,
    aacLead || !!split?.aacLeadPadded,
  );
  return {
    blob: new Blob(parts ?? [data], { type: mime }),
    filename: job.outputName,
    ffmpegCommand: job.ffmpegCommand,
  };
}

/** Sets the output picture track's frame rate (read by mediabunny when it configures the encoder). */
async function tellEncoderFrameRate(input: Input, output: Output, job: ConvertJob) {
  const track = output.tracks.find((t) => t.type === "video");
  const source = await input.getPrimaryVideoTrack();
  if (!track || !source) return;
  const meta = track.metadata as { frameRate?: number };
  if (meta.frameRate !== undefined) return;
  const asked = (job.video as { frameRate?: number } | undefined)?.frameRate;
  const stats = await source.computePacketStats(240).catch(() => null);
  const fps = asked ?? stats?.averagePacketRate;
  if (!fps || !Number.isFinite(fps) || fps <= 0) return;
  const iso = job.to === "mp4" || job.to === "mov";
  if (!iso) {
    // Only a steady rate: whole frames of the same length (within 1 %) over the sample.
    const sink = new EncodedPacketSink(source);
    const times: number[] = [];
    for await (const p of sink.packets(undefined, undefined, { metadataOnly: true })) {
      times.push(p.timestamp);
      if (times.length >= 240) break;
    }
    times.sort((a, b) => a - b);
    const steps = times.slice(1).map((t, i) => t - (times[i] ?? t));
    const step = 1 / fps;
    // (Matroska times are whole milliseconds, so up to 1 ms off counts as steady.)
    if (steps.some((d) => Math.abs(d - step) > Math.max(step * 0.01, 0.0011))) return;
  }
  meta.frameRate = fps;
}

/**
 * The picture encoded alone, then the source's sound copied beside it by the packet copy, which
 * applies the source's start delay and writes it as an edit list or CodecDelay (./packet-copy). The
 * picture is held twice briefly (encoded, then joined), as in video-filter/picture.
 */
async function pictureThenSound(job: ConvertJob): Promise<EngineResult> {
  const { ctx } = job;
  const picture = await convert({
    ...job,
    audio: { discard: true },
    ctx: {
      signal: ctx.signal,
      onProgress: (p) =>
        ctx.onProgress(p.phase === "processing" ? { ...p, ratio: p.ratio * 0.98 } : p),
    },
  });
  if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
  ctx.onProgress({ phase: "finishing", ratio: 0.98, detail: "Copying the sound" });
  const source = openInput(job.file);
  const encoded = new Input({ source: new BlobSource(picture.blob), formats: ALL_FORMATS });
  try {
    const v = await encoded.getPrimaryVideoTrack();
    if (!v) throw new EngineError("internal", "The encoder produced no picture.", "Try again.");
    const supported = containers[job.to].format().getSupportedAudioCodecs() as string[];
    const sounds = (await source.getAudioTracks()).filter(
      (a) => !!a.codec && supported.includes(a.codec),
    );
    const output = new Output({ format: containers[job.to].format(), target: new NullTarget() });
    const tags = await outputTags(source, output, job.tags).catch(() => undefined);
    const parts = await copyTracks({
      input: source,
      tracks: [v, ...sounds],
      to: job.to,
      tags,
      ctx,
    });
    ctx.onProgress({ phase: "finishing", ratio: 1, detail: "Writing the file" });
    return {
      blob: new Blob(parts, { type: containers[job.to].mime }),
      filename: job.outputName,
      ffmpegCommand: job.ffmpegCommand,
    };
  } catch (e) {
    if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
    throw classifyError(e);
  } finally {
    encoded.dispose();
    source.dispose();
  }
}

/**
 * Tracks a Conversion dropped that the output was meant to have: any picture, and the main sound.
 * mediabunny keeps going without them (an HEVC file in a browser without HEVC decode came out as
 * sound alone, reported as a success); here that is an error. Tracks the job discarded, and further
 * sound tracks the container cannot take, are not counted.
 */
async function promisedButDropped(input: Input, discarded: DiscardedTrack[], to: OutputId) {
  const main = await input.getPrimaryAudioTrack();
  const holdsVideo = containers[to].format().getSupportedVideoCodecs().length > 0;
  return discarded.filter(
    (d) =>
      d.reason !== "discarded_by_user" &&
      d.reason !== "max_track_count_reached" &&
      d.reason !== "max_track_count_of_type_reached" &&
      ((d.track.type === "video" && holdsVideo) || d.track === main),
  );
}

/**
 * Reads a finished output back: every track it has must hold packets, and a picture the input had and
 * the job kept must be there. Throws when not; an empty or picture-less file is never a success.
 */
async function assertOutputComplete(
  data: ArrayBuffer | Blob,
  inputHadVideo: boolean,
  keptVideo: boolean,
) {
  const back = new Input({
    source: data instanceof Blob ? new BlobSource(data) : new BufferSource(data),
    formats: ALL_FORMATS,
  });
  try {
    const tracks = await back.getTracks().catch(() => []);
    let filled = 0;
    let video = false;
    for (const t of tracks) {
      if (!t.isVideoTrack() && !t.isAudioTrack()) continue;
      const first = await new EncodedPacketSink(t).getFirstPacket({ metadataOnly: true });
      if (first) {
        filled++;
        if (t.isVideoTrack()) video = true;
      }
    }
    if (filled === 0)
      throw new EngineError(
        "unsupported-input",
        "No video or sound could be read from this file, so nothing was written.",
        "The file may be damaged or cut short. Try the original, or a copy that plays in a media player.",
      );
    if (inputHadVideo && keptVideo && !video)
      throw new EngineError(
        "internal",
        "The result came out without its picture, so it was not kept.",
        "Try the video converter, which can use the ffmpeg engine.",
      );
  } finally {
    back.dispose();
  }
}

/**
 * The tags a Conversion would write (the job's, or the input's), for an Output the runner owns: a
 * composable Conversion leaves tags to the owner. Raw tags only carry over between like formats.
 */
async function outputTags(
  input: Input,
  output: Output,
  tags: ConvertJob["tags"],
): Promise<MetadataTags> {
  const inputTags = await input.getMetadataTags();
  const chosen = tags ? (typeof tags === "function" ? await tags(inputTags) : tags) : inputTags;
  const sameFormat = (await input.getFormat()).mimeType === output.format.mimeType;
  if (inputTags.raw && chosen.raw === inputTags.raw && !sameFormat) {
    const { raw: _raw, ...rest } = chosen;
    return rest;
  }
  return chosen;
}

function fromDiscarded(discarded: DiscardedTrack[]): EngineError {
  const reasons = new Set(discarded.map((d) => d.reason));
  if (reasons.has("undecodable_source_codec") || reasons.has("unknown_source_codec")) {
    const lost = discarded.find(
      (d) => d.reason === "undecodable_source_codec" || d.reason === "unknown_source_codec",
    );
    const name = lost?.track.codec ? codecName(lost.track.codec) : undefined;
    const kind = lost?.track.type === "audio" ? "sound" : "video";
    return new EngineError(
      "unsupported-input",
      name
        ? `This browser cannot decode the ${name} ${kind} in this file.`
        : "This file uses a codec your browser cannot decode.",
      "Convert it with the video converter, which can use the ffmpeg engine, or try desktop Safari or Edge.",
    );
  }
  if (reasons.has("no_encodable_target_codec")) {
    const audioOnly = discarded
      .filter((d) => d.reason === "no_encodable_target_codec")
      .every((d) => d.track.type === "audio");
    return new EngineError(
      "unsupported-output",
      `Your browser cannot encode ${audioOnly ? "audio" : "video"} in the format this tool needs.`,
      audioOnly
        ? "Choose MP3, WAV or FLAC, or try desktop Chrome, Edge or Safari 17.4 or newer."
        : "Try desktop Chrome, Edge or Safari 17.4 or newer.",
    );
  }
  return new EngineError(
    "internal",
    "The file has no track this tool can work with.",
    "Check that the file contains video or audio.",
  );
}
