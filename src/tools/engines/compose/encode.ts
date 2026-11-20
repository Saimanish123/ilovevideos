/**
 * The writer shared by the time and layout engines (freeze frame, picture in picture and side by
 * side, clips): a picture made frame by frame by the engine and a sound made block by block by the
 * engine, encoded once to H.264 and AAC (Opus where AAC is missing) in MP4. It is the pattern of
 * ../remove-silence/video with the producers handed in, so every engine here gets the same
 * corrections: Baseline H.264 where the High profile encoder returns nothing
 * (../mediabunny/encoder-probe), the AAC lead WebKit's encoder swallows and the edit list that
 * hides it (../mediabunny/priming), Opus tails, streaming to OPFS for large outputs
 * (../mediabunny/output-store), the encoder told the frame rate (ADR-0060), a stall watchdog, and
 * cancel within one frame. Runs in the engine worker. No network access.
 */
import {
  AudioSample,
  AudioSampleSource,
  canEncodeVideo,
  Mp4OutputFormat,
  Output,
  Quality,
  type VideoSample,
  VideoSampleSource,
} from "mediabunny";
import { formatDimensions, formatDuration } from "@/lib/format";
import { classifyError, EngineError } from "../errors";
import { avcEncoderTrouble } from "../mediabunny/encoder-probe";
import { addOpusTail } from "../mediabunny/opus-delay";
import { type OutputStore, openOutputStore } from "../mediabunny/output-store";
import { addAacLead, withEncoderDelaySignalled } from "../mediabunny/priming";
import { STALL_MS } from "../mediabunny/shared";
import { LinearResampler } from "../merge/resample";
import { baselineAvc } from "../remove-silence/video";
import { downmix } from "../sound/dsp/downmix";
import { paced } from "../sound/pace";
import { blobReleasing, pickEncoding } from "../sound/render";
import { VIDEO_SOUND_KBPS } from "../sound/target";
import type { EngineContext } from "../types";

/** Planar float sound at the producer's own rate and layout; the writer converts it. */
export interface SoundFeed {
  sampleRate: number;
  channels: number;
  /** Blocks in order from the output's zero; the writer counts the frames to place them. */
  blocks: (signal: AbortSignal) => AsyncIterable<Float32Array[]>;
}

export interface ComposeJob {
  /** Even width and height of every frame the picture producer yields. */
  size: { width: number; height: number };
  /** Output frame rate (told to the encoder and the container). */
  fps: number;
  /** Video bitrate, bits per second (../crop/plan `reencodeBitrate`). */
  bitrate: number;
  /** Output length, seconds: the progress and the stall message use it. */
  durationSec: number;
  /**
   * Frames in presentation order, each already stamped with its output time and duration. The
   * writer encodes and closes each one; a producer that needs a frame again yields a clone.
   */
  frames: (signal: AbortSignal) => AsyncIterable<VideoSample>;
  sound?: SoundFeed;
  /** Rotation written into the track, for frames passed through as decoded. */
  rotation?: 0 | 90 | 180 | 270;
  /** Expected output bytes, for choosing memory or disk (../mediabunny/output-store). */
  expectedBytes: number;
  /** Tags copied from the main source. */
  tags?: Parameters<Output["setMetadataTags"]>[0];
  /** The progress line's verb, e.g. "Freezing". */
  label: string;
  /** Share of the run's progress bar this writer fills, default [0, 1]. */
  span?: [number, number];
  ctx: EngineContext;
}

export interface ComposeResult {
  blob: Blob;
  frames: number;
  /** Seconds of sound written (0 without sound). */
  soundSec: number;
  /** H.264 profile written: High, or Baseline where this browser's High encoder returns nothing. */
  profile: "high" | "baseline";
  /** The sound codec written, when there is sound. */
  soundCodec?: "aac" | "opus";
}

/** The profile, or why this browser cannot encode H.264 at this size, before any work. */
export async function avcPlan(
  size: { width: number; height: number },
  fps: number,
): Promise<{ fullCodecString?: string }> {
  if (!(await canEncodeVideo("avc", size)))
    throw new EngineError(
      "unsupported-output",
      `This browser cannot write a ${formatDimensions(size.width, size.height)} H.264 video.`,
      "Choose a smaller output frame, or try desktop Chrome, Edge or Safari.",
    );
  const highTrouble = await avcEncoderTrouble();
  if (!highTrouble) return {};
  const fullCodecString = baselineAvc(size.width, size.height, fps);
  if (!(await canEncodeVideo("avc", { ...size, fullCodecString }))) throw highTrouble;
  return { fullCodecString };
}

export async function encodeComposed(job: ComposeJob): Promise<ComposeResult> {
  const { ctx } = job;
  const [from, to] = job.span ?? [0, 1];
  // Set when the stall watchdog gives up, so both pumps stop at their next step.
  let stopped: EngineError | null = null;
  const inner = new AbortController();
  const abort = () => inner.abort();
  ctx.signal.addEventListener("abort", abort, { once: true });
  const check = () => {
    if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
    if (stopped) throw stopped;
  };
  let store: OutputStore | undefined;
  let delivered = false;
  try {
    const { fullCodecString } = await avcPlan(job.size, job.fps);
    const enc = job.sound
      ? await pickEncoding(
          ["aac", "opus"],
          job.sound.sampleRate,
          Math.min(2, job.sound.channels),
          VIDEO_SOUND_KBPS,
        )
      : undefined;
    if (job.sound && !enc)
      throw new EngineError(
        "unsupported-output",
        "Your browser cannot encode sound for this video.",
        "Try desktop Chrome, Edge or Safari 17.4 or newer.",
      );

    store = await openOutputStore(job.expectedBytes);
    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: store.streamed ? false : "in-memory" }),
      target: store.target,
    });
    if (job.tags) {
      try {
        output.setMetadataTags(job.tags);
      } catch {
        // Tags are a convenience.
      }
    }
    const videoSource = new VideoSampleSource({
      codec: "avc",
      bitrate: new Quality({ bitrate: job.bitrate, bitrateMode: "variable" }),
      sizeChangeBehavior: "passThrough",
      ...(fullCodecString ? { fullCodecString } : {}),
    });
    output.addVideoTrack(videoSource, {
      rotation: job.rotation ?? 0,
      frameRate: job.fps,
    });
    let audioSource: AudioSampleSource | undefined;
    if (enc) {
      audioSource = new AudioSampleSource({
        codec: enc.codec as "aac" | "opus",
        quality: new Quality({ bitrate: VIDEO_SOUND_KBPS * 1000 }),
      });
      output.addAudioTrack(audioSource);
    }

    const total = Math.max(1e-6, job.durationSec);
    let pictureDone = 0;
    let soundDone = enc ? 0 : total;
    let lastActivity = performance.now();
    const progress = paced(ctx.onProgress);
    let frames = 0;
    const report = () => {
      lastActivity = performance.now();
      const done = Math.min(pictureDone, soundDone);
      progress({
        phase: "processing",
        ratio: from + (to - from) * 0.97 * Math.min(1, done / total),
        detail: `${job.label} · ${formatDuration(Math.min(total, done))} of ${formatDuration(total)} written`,
      });
    };

    const picture = async () => {
      for await (const sample of job.frames(inner.signal)) {
        try {
          check();
          await videoSource.add(sample);
          frames++;
          pictureDone = sample.timestamp + sample.duration;
          report();
        } finally {
          sample.close();
        }
      }
      check();
      pictureDone = total;
    };

    let written = 0;
    let leadSec = 0;
    const sound = async () => {
      const feed = job.sound;
      if (!feed || !enc || !audioSource) return;
      const { channels, sampleRate: rate } = enc;
      leadSec = await addAacLead(audioSource, enc.codec, rate, channels);
      const resampler =
        rate !== feed.sampleRate ? new LinearResampler(feed.sampleRate, rate, channels) : null;
      for await (const block of feed.blocks(inner.signal)) {
        check();
        let planes = downmix(block, channels);
        if (resampler) planes = resampler.process(planes);
        const n = planes[0]?.length ?? 0;
        if (n === 0) continue;
        const data = new Float32Array(n * channels);
        for (let c = 0; c < channels; c++)
          data.set(planes[c] ?? planes[0] ?? new Float32Array(n), c * n);
        const s = new AudioSample({
          data,
          format: "f32-planar",
          numberOfChannels: channels,
          sampleRate: rate,
          timestamp: leadSec + written / rate,
        });
        try {
          await audioSource.add(s);
        } finally {
          s.close();
        }
        written += n;
        soundDone = written / rate;
        report();
      }
      check();
      await addOpusTail(audioSource, enc.codec, rate, channels, leadSec + written / rate);
      soundDone = total;
    };

    let watchdog: ReturnType<typeof setInterval> | undefined;
    const stalled = new Promise<never>((_, reject) => {
      watchdog = setInterval(() => {
        if (performance.now() - lastActivity < STALL_MS) return;
        clearInterval(watchdog);
        const at = Math.min(pictureDone, soundDone);
        stopped = new EngineError(
          "unsupported-output",
          `Writing the ${pictureDone <= soundDone ? "picture" : "sound"} stopped at ${formatDuration(at)} of ${formatDuration(total)}, with no progress for ${STALL_MS / 1000} seconds.`,
          "Try again, or try desktop Chrome or Edge.",
        );
        inner.abort();
        reject(stopped);
      }, 1000);
    });
    const work = (async () => {
      await output.start();
      await Promise.all([picture(), sound()]);
      ctx.onProgress({
        phase: "finishing",
        ratio: from + (to - from) * 0.98,
        detail: "Writing the file",
      });
      lastActivity = Number.POSITIVE_INFINITY;
      await output.finalize();
    })();
    work.catch(() => undefined);
    try {
      await Promise.race([work, stalled]);
    } catch (e) {
      inner.abort();
      await output.cancel().catch(() => undefined);
      throw e;
    } finally {
      clearInterval(watchdog);
    }
    const data = await store.finish();
    const rate = enc?.sampleRate ?? 1;
    const parts = enc
      ? await withEncoderDelaySignalled(output, data, "mp4", written / rate, 0, true)
      : null;
    delivered = true;
    return {
      blob:
        data instanceof ArrayBuffer
          ? blobReleasing(parts ?? [data], data, "video/mp4")
          : new Blob(parts ?? [data], { type: "video/mp4" }),
      frames,
      soundSec: enc ? written / rate : 0,
      profile: fullCodecString ? "baseline" : "high",
      ...(enc ? { soundCodec: enc.codec as "aac" | "opus" } : {}),
    };
  } catch (e) {
    inner.abort();
    if (!delivered) await store?.discard();
    if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
    throw classifyError(e);
  } finally {
    ctx.signal.removeEventListener("abort", abort);
  }
}
