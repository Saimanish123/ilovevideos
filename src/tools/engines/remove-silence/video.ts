/**
 * Jump cuts in a video: the pauses are cut from picture and sound together. Every cut edge is first
 * moved onto a frame time (../sound/dsp/silence `snapToFrames`), so the picture and the sound lose
 * exactly the same stretches and never drift apart however many cuts there are. The picture is
 * decoded and re-encoded to H.264 (a cut inside a group of pictures cannot be copied); the sound is
 * read span by span with a 5 ms ramp at each join (../sound/reader) and encoded once to AAC, or
 * Opus where this browser has no AAC encoder (../sound-codec). The output is MP4. Runs in the engine worker. No network access.
 */
import {
  AudioSample,
  AudioSampleSource,
  canEncodeVideo,
  EncodedPacketSink,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  Quality,
  VideoSampleSink,
  VideoSampleSource,
} from "mediabunny";
import { formatDuration } from "@/lib/format";
import { classifyError, EngineError } from "../errors";
import { avcEncoderTrouble } from "../mediabunny/encoder-probe";
import { addOpusTail } from "../mediabunny/opus-delay";
import { type OutputStore, openOutputStore } from "../mediabunny/output-store";
import { addAacLead, withEncoderDelaySignalled } from "../mediabunny/priming";
import { openInput, STALL_MS } from "../mediabunny/shared";
import { LinearResampler } from "../merge/resample";
import { downmix } from "../sound/dsp/downmix";
import { keptSpans, type Span, snapToFrames } from "../sound/dsp/silence";
import { paced } from "../sound/pace";
import { openSound, readSpans } from "../sound/reader";
import { blobReleasing, pickEncoding } from "../sound/render";
import { VIDEO_SOUND_KBPS } from "../sound/target";
import { videoSoundCodecs } from "../sound-codec";
import type { EngineContext } from "../types";

export interface VideoCutResult {
  blob: Blob;
  /** The cuts as made (on frame times). */
  cuts: Span[];
  seconds: number;
  frames: number;
  /** H.264 profile written: High as mediabunny asks, or Baseline where High returns no frames. */
  profile: "high" | "baseline";
  /** The sound's codec (../sound-codec order: AAC, else Opus). */
  soundCodec: string;
}

/** H.264 levels by frame size and macroblock rate (ITU-T H.264 Table A-1): [MaxFS, MaxMBPS, level]. */
const AVC_LEVELS: readonly [number, number, number][] = [
  [1620, 40_500, 30],
  [3600, 108_000, 31],
  [5120, 216_000, 32],
  [8192, 245_760, 40],
  [8704, 522_240, 42],
  [22_080, 589_824, 50],
  [36_864, 983_040, 51],
  [36_864, 2_073_600, 52],
  [139_264, 4_177_920, 60],
  [139_264, 16_711_680, 62],
];

/**
 * Constrained Baseline codec string for a picture size and frame rate, e.g. "avc1.42e01e". Used
 * where the High profile encoder takes frames and never returns any (Playwright WebKit, Safari 26.5
 * engine, measured 2026-10-08: High and Main stall, Baseline encodes; ../mediabunny/encoder-probe).
 */
export function baselineAvc(width: number, height: number, fps: number): string {
  const mbs = Math.ceil(width / 16) * Math.ceil(height / 16);
  const rate = mbs * Math.max(1, fps);
  const level = AVC_LEVELS.find(([fs, mbps]) => mbs <= fs && rate <= mbps)?.[2] ?? 62;
  return `avc1.42e0${level.toString(16).padStart(2, "0")}`;
}

/** Seconds removed before source time `t`, by cuts sorted by start. */
function removedBefore(cuts: readonly Span[], t: number): number {
  let r = 0;
  for (const c of cuts) {
    if (c.start >= t) break;
    r += Math.min(t, c.end) - c.start;
  }
  return r;
}

const inside = (cuts: readonly Span[], t: number) =>
  cuts.some((c) => t >= c.start - 1e-6 && t < c.end - 1e-6);

export async function cutVideo(
  file: File,
  planned: Span[],
  ctx: EngineContext,
  /** Source time of the file's start (MediaInfo.startSec): `planned` and the result are page times. */
  t0 = 0,
): Promise<VideoCutResult> {
  // Set when the stall watchdog gives up, so both pumps stop at their next step.
  let stopped: EngineError | null = null;
  const check = () => {
    if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
    if (stopped) throw stopped;
  };
  const input = openInput(file);
  // Large outputs stream to OPFS (../mediabunny/output-store); the partial file goes on failure.
  let store: OutputStore | undefined;
  let delivered = false;
  try {
    const video = await input.getPrimaryVideoTrack();
    const src = await openSound(input, file);
    if (!video) throw new EngineError("unsupported-input", "The video has no picture.");
    if (!src)
      throw new EngineError("unsupported-input", "The video has no sound to find pauses in.");
    if (!(await video.canDecode()) || !(await src.track.canDecode()))
      throw new EngineError(
        "unsupported-input",
        "This browser cannot decode this video to cut it.",
        "Convert it to MP4 first, or try desktop Chrome.",
      );
    const width = video.displayWidth;
    const height = video.displayHeight;
    const coded = { width: video.codedWidth, height: video.codedHeight };
    if (!(await canEncodeVideo("avc", coded)))
      throw new EngineError(
        "unsupported-output",
        `Your browser cannot encode H.264 at ${width}×${height}.`,
        "Try desktop Chrome, Edge or Safari 17.4 or newer.",
      );

    // Frame times, so every cut starts and ends on a frame.
    ctx.onProgress({ phase: "analyzing", ratio: 0.3, detail: "Lining the cuts up with frames" });
    const times: number[] = [];
    for await (const p of new EncodedPacketSink(video).packets(undefined, undefined, {
      metadataOnly: true,
    }))
      times.push(p.timestamp - t0);
    times.sort((a, b) => a - b);
    // Everything below is in page time, from the file's start (an MPEG-TS starts near 1.4 s).
    const duration = Math.max(times.at(-1) ?? 0, src.end - t0);

    // An encoder that accepts High profile but never returns a frame (../mediabunny/encoder-probe)
    // gets Constrained Baseline, which the same encoder writes; if that is refused too, say so now.
    const fps =
      times.length > 1
        ? (times.length - 1) / Math.max(1e-6, (times.at(-1) ?? 0) - (times[0] ?? 0))
        : 30;
    const highTrouble = await avcEncoderTrouble();
    const fullCodecString = highTrouble ? baselineAvc(coded.width, coded.height, fps) : undefined;
    if (fullCodecString && !(await canEncodeVideo("avc", { ...coded, fullCodecString })))
      throw highTrouble;
    const cuts = snapToFrames(planned, times);
    const kept = keptSpans(cuts, duration);
    const after = kept.reduce((s, k) => s + (k.end - k.start), 0);

    // A re-encode at high quality is rarely larger than the source; the source's size is the guess.
    store = await openOutputStore(file.size);
    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: store.streamed ? false : "in-memory" }),
      target: store.target,
    });
    try {
      output.setMetadataTags(await input.getMetadataTags());
    } catch {
      // Tags are a convenience.
    }
    const videoSource = new VideoSampleSource({
      codec: "avc",
      quality: QUALITY_HIGH,
      sizeChangeBehavior: "passThrough",
      ...(fullCodecString ? { fullCodecString } : {}),
    });
    output.addVideoTrack(videoSource, { rotation: video.rotation });
    const enc = await pickEncoding(
      videoSoundCodecs("mp4"),
      src.sampleRate,
      Math.min(2, src.channels),
      VIDEO_SOUND_KBPS,
    );
    if (!enc)
      throw new EngineError(
        "unsupported-output",
        "Your browser cannot encode sound for this video.",
        "Try desktop Chrome, Edge or Safari 17.4 or newer.",
      );
    const { channels, sampleRate: rate } = enc;
    const audioSource = new AudioSampleSource({
      codec: enc.codec as "aac" | "opus",
      quality: new Quality({ bitrate: VIDEO_SOUND_KBPS * 1000 }),
    });
    output.addAudioTrack(audioSource);

    let pictureDone = 0;
    let soundDone = 0;
    // Stall watchdog, tied to output as in ../mediabunny/shared `convert`: every frame or block the
    // encoders take moves it, so a slow device keeps it quiet, and an encoder that stops returning
    // frames fails the run with what happened instead of leaving "0:00 of 0:05 written" up for ever.
    let lastActivity = performance.now();
    const progress = paced(ctx.onProgress);
    const report = () => {
      lastActivity = performance.now();
      progress({
        phase: "processing",
        ratio: 0.3 + 0.65 * Math.min(1, Math.min(pictureDone, soundDone) / Math.max(1e-6, after)),
        detail: `Cutting · ${formatDuration(Math.min(pictureDone, soundDone))} of ${formatDuration(after)} written`,
      });
    };

    let frames = 0;
    const picture = async () => {
      for await (const sample of new VideoSampleSink(video).samples()) {
        try {
          check();
          const t = sample.timestamp - t0;
          if (inside(cuts, t)) continue;
          const out = Math.max(0, t - removedBefore(cuts, t));
          sample.setTimestamp(out);
          await videoSource.add(sample);
          frames++;
          pictureDone = out;
          report();
        } finally {
          sample.close();
        }
      }
      pictureDone = after;
    };

    let written = 0;
    // Silence first for an AAC encoder that swallows its first frame (WebKit's); later samples follow it.
    let leadSec = 0;
    const sound = async () => {
      leadSec = await addAacLead(audioSource, enc.codec, rate, channels);
      const resampler =
        rate !== src.sampleRate ? new LinearResampler(src.sampleRate, rate, channels) : null;
      // Cut times are the picture's; a Matroska CodecDelay puts the sound's packets that much later.
      const shift = t0 + src.delay;
      const soundKept = shift
        ? kept.map((k) => ({ start: k.start + shift, end: k.end + shift }))
        : kept;
      for await (const block of readSpans(src, soundKept, ctx.signal)) {
        check();
        let planes = downmix(block.planes, channels);
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
        await audioSource.add(s);
        s.close();
        written += n;
        soundDone = written / rate;
        report();
      }
      await addOpusTail(audioSource, enc.codec, rate, channels, leadSec + written / rate);
      soundDone = after;
    };

    let watchdog: ReturnType<typeof setInterval> | undefined;
    const stalled = new Promise<never>((_, reject) => {
      watchdog = setInterval(() => {
        if (performance.now() - lastActivity < STALL_MS) return;
        clearInterval(watchdog);
        const at = Math.min(pictureDone, soundDone);
        stopped = new EngineError(
          "unsupported-output",
          `Writing the ${pictureDone <= soundDone ? "picture" : "sound"} stopped at ${formatDuration(at)} of ${formatDuration(after)}, with no progress for ${STALL_MS / 1000} seconds.`,
          "Try again, or try desktop Chrome or Edge.",
        );
        reject(stopped);
      }, 1000);
    });
    const work = (async () => {
      await output.start();
      await Promise.all([picture(), sound()]);
      ctx.onProgress({ phase: "finishing", ratio: 0.97, detail: "Writing the file" });
      lastActivity = Number.POSITIVE_INFINITY;
      await output.finalize();
    })();
    // Settled either way; a stalled run is abandoned, not awaited.
    work.catch(() => undefined);
    try {
      await Promise.race([work, stalled]);
    } catch (e) {
      await output.cancel().catch(() => undefined);
      throw e;
    } finally {
      clearInterval(watchdog);
    }
    const data = await store.finish();
    const parts = await withEncoderDelaySignalled(output, data, "mp4", written / rate, 0, true);
    delivered = true;
    return {
      blob:
        data instanceof ArrayBuffer
          ? blobReleasing(parts ?? [data], data, "video/mp4")
          : new Blob(parts ?? [data], { type: "video/mp4" }),
      cuts,
      seconds: after,
      frames,
      profile: fullCodecString ? "baseline" : "high",
      soundCodec: enc.codec,
    };
  } catch (e) {
    if (!delivered) await store?.discard();
    if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
    throw classifyError(e);
  } finally {
    input.dispose();
  }
}
