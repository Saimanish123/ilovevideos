/**
 * Reversed video with WebCodecs, in the engine worker. The picture is decoded window by window from
 * the end (./math `reverseWindows`); each window's frames are copied out of the decoder as raw
 * pixels (so the decoder's own frame pool is never held), then encoded last first as H.264. The
 * sound, when kept, is decoded whole, reversed sample by sample and encoded once to AAC. Boomerang
 * reuses both halves: the clip forwards, then backwards. No network access.
 */
import {
  AudioSample,
  AudioSampleSink,
  AudioSampleSource,
  EncodedPacketSink,
  type InputAudioTrack,
  type InputVideoTrack,
  Output,
  Quality,
  VideoSample,
  type VideoSampleInit,
  VideoSampleSink,
  VideoSampleSource,
} from "mediabunny";
import { formatDuration } from "@/lib/format";
import { classifyError, EngineError } from "../errors";
import { addOpusTail } from "../mediabunny/opus-delay";
import { type OutputStore, openOutputStore } from "../mediabunny/output-store";
import { soundTrackEnd } from "../mediabunny/pre-roll";
import { addAacLead, withEncoderDelaySignalled } from "../mediabunny/priming";
import { type ContainerId, containers, openInput } from "../mediabunny/shared";
import { soundEncoders, writtenSoundCodec } from "../sound-codec";
import type { EngineContext } from "../types";
import { framePlanForTrack, prepareFrame } from "../video-filter/frame-prep";
import { encodedBytes, maxReversedSound, reverseWindows, windowFrames } from "./math";

const EPS = 1e-6;
/** Bitrate of the reversed sound (AAC, or Opus in WebM; ../video-filter/plan `soundCodec`). */
export const REVERSED_SOUND_BITRATE = 128_000;

interface Timeline {
  /** Presentation times of every frame, ascending, and their durations. */
  frames: number[];
  durations: number[];
  keys: number[];
  end: number;
}

async function readTimeline(track: InputVideoTrack, signal: AbortSignal): Promise<Timeline> {
  const sink = new EncodedPacketSink(track);
  const list: { t: number; d: number }[] = [];
  const keys: number[] = [];
  for await (const p of sink.packets(undefined, undefined, { metadataOnly: true })) {
    if (signal.aborted) throw new EngineError("cancelled", "Cancelled.");
    list.push({ t: p.timestamp, d: p.duration });
    if (p.type === "key") keys.push(p.timestamp);
  }
  list.sort((a, b) => a.t - b.t);
  const frames = list.map((x) => x.t);
  // Durations from the gap to the next frame (containers often list 0 or the average).
  const durations = list.map((x, i) => {
    const next = list[i + 1];
    return next
      ? Math.max(EPS, next.t - x.t)
      : x.d > 0
        ? x.d
        : list[i - 1]
          ? x.t - (list[i - 1]?.t ?? 0)
          : 1 / 30;
  });
  const last = list.at(-1);
  return { frames, durations, keys, end: last ? last.t + (durations.at(-1) ?? 0) : 0 };
}

interface HeldFrame {
  data: Uint8Array;
  init: SetRequired<VideoSampleInit, "format" | "codedWidth" | "codedHeight">;
}
type SetRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] };

/** Copies a decoded frame into plain memory and releases the decoder's frame. */
async function hold(sample: VideoSample): Promise<HeldFrame> {
  const rgba = sample.format === null;
  const opts = rgba ? ({ format: "RGBA" } as VideoFrameCopyToOptions) : undefined;
  const data = new Uint8Array(sample.allocationSize(opts));
  const layout = await sample.copyTo(data, opts);
  const init = {
    format: sample.format ?? "RGBA",
    codedWidth: sample.visibleRect.width,
    codedHeight: sample.visibleRect.height,
    layout,
    colorSpace: sample.colorSpace.toJSON(),
  } as HeldFrame["init"];
  sample.close();
  return { data, init };
}

/** Frames of the whole clip from the end to the start, as samples the caller closes. */
async function* backwards(
  track: InputVideoTrack,
  timeline: Timeline,
  signal: AbortSignal,
): AsyncGenerator<VideoSample> {
  const sink = new VideoSampleSink(track);
  const w = await track.getDisplayWidth();
  const h = await track.getDisplayHeight();
  const windows = reverseWindows(timeline.frames, timeline.keys, windowFrames(w, h));
  for (const win of windows) {
    const held: { frame: HeldFrame; t: number }[] = [];
    for await (const s of sink.samples(win.first - EPS, win.last + EPS)) {
      if (signal.aborted) {
        s.close();
        throw new EngineError("cancelled", "Cancelled.");
      }
      if (s.timestamp < win.first - EPS || s.timestamp > win.last + EPS) {
        s.close();
        continue;
      }
      const t = s.timestamp;
      held.push({ frame: await hold(s), t });
    }
    for (let i = held.length - 1; i >= 0; i--) {
      const x = held[i];
      if (!x) continue;
      held[i] = undefined as never;
      yield new VideoSample(x.frame.data, { ...x.frame.init, timestamp: x.t });
    }
  }
}

/** Frames of the whole clip from the start, as the decoder gives them. */
async function* forwards(track: InputVideoTrack, signal: AbortSignal): AsyncGenerator<VideoSample> {
  for await (const s of new VideoSampleSink(track).samples()) {
    if (signal.aborted) {
      s.close();
      throw new EngineError("cancelled", "Cancelled.");
    }
    yield s;
  }
}

/**
 * The whole sound, decoded to one float array per channel from time 0 to `end` (where the sound
 * really ends: an Opus source's padding is not sound, ../mediabunny/opus-source).
 */
async function decodeSound(track: InputAudioTrack, end: number, signal: AbortSignal) {
  const rate = track.sampleRate;
  const channels = track.numberOfChannels;
  let capacity = rate * 10;
  let planes = Array.from({ length: channels }, () => new Float32Array(capacity));
  let length = 0;
  for await (const s0 of new AudioSampleSink(track).samples()) {
    if (signal.aborted) {
      s0.close();
      throw new EngineError("cancelled", "Cancelled.");
    }
    let s = s0;
    // Priming (before zero) is not heard; drop it.
    if (s.timestamp < 0) {
      const skip = Math.round(-s.timestamp * rate);
      if (skip >= s.numberOfFrames) {
        s.close();
        continue;
      }
      s = s.trim(skip);
      s0.close();
    }
    const at = Math.round(s.timestamp * rate);
    const need = at + s.numberOfFrames;
    if (need > capacity) {
      capacity = Math.max(need, capacity * 2);
      const grown = capacity;
      planes = planes.map((p) => {
        const q = new Float32Array(grown);
        q.set(p.subarray(0, length));
        return q;
      });
    }
    const tmp = new Float32Array(s.numberOfFrames);
    planes.forEach((plane, c) => {
      s.copyTo(tmp, { planeIndex: Math.min(c, s.numberOfChannels - 1), format: "f32-planar" });
      plane.set(tmp, at);
    });
    length = Math.max(length, need);
    s.close();
  }
  length = Math.min(length, Math.max(0, Math.round(end * rate)));
  return { planes: planes.map((p) => p.subarray(0, length)), rate, channels, length };
}

export interface SequenceJob {
  file: File;
  to: ContainerId;
  /** Picture bitrate. */
  bitrate: number;
  /** Which way(s) to play: the reversed clip, or forwards then backwards (boomerang). */
  order: "reverse" | "bounce";
  /** Reverse the sound too (reverse order only). */
  sound: boolean;
  ctx: EngineContext;
}

export interface SequenceResult {
  blob: Blob;
  frames: number;
  /** Seconds of reversed sound written (0 when none). */
  soundSec: number;
}

/**
 * Encodes the frames in the asked order into one file. Progress is frames written out of the frames
 * the output will have.
 */
export async function encodeSequence(job: SequenceJob): Promise<SequenceResult> {
  const { ctx } = job;
  const input = openInput(job.file);
  let store: OutputStore | undefined;
  let finished = false;
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track)
      throw new EngineError(
        "unsupported-input",
        "This file has no video track.",
        "Choose a video file.",
      );
    if (!(await track.canDecode()))
      throw new EngineError(
        "unsupported-input",
        "This file uses a video codec your browser cannot decode.",
        "Convert it to MP4 first, or try desktop Chrome.",
      );
    ctx.onProgress({ phase: "analyzing", ratio: 0, detail: "Reading the frame list" });
    const timeline = await readTimeline(track, ctx.signal);
    // Frames go to the encoder as coded (the track carries the rotation), so the plan is unturned.
    // The plan also sets the track to decode with the colour space the output declares.
    const frames = await framePlanForTrack(track, "avc", -(await track.getRotation()));
    const count = timeline.frames.length;
    // A bounce plays every frame forwards, then back without repeating the turning frame.
    const total = job.order === "bounce" ? count * 2 - 1 : count;
    const { format, mime } = containers[job.to];
    // Large results stream to disk (../mediabunny/output-store); the estimate has 10% headroom for
    // the encoder's variable rate.
    const seconds = job.order === "bounce" ? timeline.end * 2 : timeline.end;
    store = await openOutputStore(
      encodedBytes(job.bitrate, seconds, job.sound ? REVERSED_SOUND_BITRATE : 0) * 1.1,
    );
    const output = new Output({
      format: format({ streamed: store.streamed }),
      target: store.target,
    });
    // The encoder is told the real frame rate. Without it Chromium's H.264 encoder assumes 30 and
    // spends bitrate / 30 per frame: a 60 fps source came out at twice the asked bitrate (41.3 Mbps
    // asked, 82.1 Mbps written, 8 s of 4K60; 41.2 Mbps with the rate given).
    const fps = timeline.end > 0 ? count / timeline.end : undefined;
    const video = new VideoSampleSource({
      codec: "avc",
      quality: new Quality({ bitrate: job.bitrate, bitrateMode: "variable" }),
      keyFrameInterval: 2,
      onEncoderConfig: (config) => {
        if (fps && Number.isFinite(fps)) config.framerate = fps;
      },
    });
    output.addVideoTrack(video, { rotation: track.rotation });

    const audioTrack =
      job.sound && job.order === "reverse" ? await input.getPrimaryAudioTrack() : null;
    // AAC (Opus in WebM), or Opus (16-bit PCM in MOV) where there is no AAC encoder (../sound-codec).
    const soundCodecOut = writtenSoundCodec(job.to, await soundEncoders());
    let soundSec = 0;
    let audio: AudioSampleSource | null = null;
    let sound: Awaited<ReturnType<typeof decodeSound>> | null = null;
    if (audioTrack) {
      const limit = maxReversedSound(audioTrack.sampleRate, audioTrack.numberOfChannels);
      const length = (await audioTrack.computeDuration()) ?? 0;
      if (length > limit) {
        throw new EngineError(
          "resource",
          `Reversing the sound holds all of it in memory; this tool stops at ${formatDuration(limit)} of sound and this clip has ${formatDuration(length)}.`,
          "Choose Remove the sound, or trim the video first.",
        );
      }
      ctx.onProgress({ phase: "analyzing", ratio: 0, detail: "Decoding the sound" });
      sound = await decodeSound(audioTrack, await soundTrackEnd(audioTrack, job.file), ctx.signal);
      audio = new AudioSampleSource({
        codec: soundCodecOut,
        quality: new Quality({ bitrate: REVERSED_SOUND_BITRATE }),
      });
      output.addAudioTrack(audio);
    }

    await output.start();
    let written = 0;
    let at = 0;
    const started = performance.now();
    const report = () => {
      const ratio = total > 0 ? written / total : 0;
      const elapsed = (performance.now() - started) / 1000;
      const left = ratio > 0.03 && elapsed >= 2 ? (elapsed / ratio) * (1 - ratio) : undefined;
      ctx.onProgress({
        phase: "processing",
        ratio,
        detail: `Frame ${written.toLocaleString("en")} of ${total.toLocaleString("en")}${left !== undefined ? ` · about ${formatDuration(Math.max(1, left))} left` : ""}`,
      });
    };
    const durationOf = (t: number) => {
      // Binary search the frame list for this frame's duration.
      let lo = 0;
      let hi = timeline.frames.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if ((timeline.frames[mid] ?? 0) <= t + EPS) lo = mid;
        else hi = mid - 1;
      }
      return timeline.durations[lo] ?? 1 / 30;
    };
    const put = async (sample: VideoSample) => {
      const d = durationOf(sample.timestamp);
      // The track carries the rotation; the frames go to the encoder as they were coded.
      sample.setRotation(0);
      let s = sample;
      try {
        // Even edges for H.264 and the source's colour tags (../video-filter/frame-prep).
        s = await prepareFrame(sample, frames);
        s.setTimestamp(at);
        s.setDuration(d);
        await video.add(s);
      } finally {
        // Closed on every path, a failed add or a cancel included (a closed sample may close again).
        s.close();
        sample.close();
      }
      at += d;
      written++;
      if (written % 4 === 0 || written === total) report();
    };

    const pumpVideo = async () => {
      if (job.order === "bounce") {
        const lastFrame = timeline.frames.at(-1) ?? 0;
        for await (const s of forwards(track, ctx.signal)) await put(s);
        for await (const s of backwards(track, timeline, ctx.signal)) {
          // The last frame was just shown going forwards: skip it at the turn.
          if (Math.abs(s.timestamp - lastFrame) < EPS) {
            s.close();
            continue;
          }
          await put(s);
        }
      } else {
        for await (const s of backwards(track, timeline, ctx.signal)) await put(s);
      }
      video.close();
    };
    const pumpAudio = async () => {
      if (!audio || !sound) return;
      const { planes, rate, channels, length } = sound;
      const codec = soundCodecOut;
      // Silence first for an AAC encoder that swallows its first frame (WebKit's); the sound follows.
      const lead = await addAacLead(audio, codec, rate, channels);
      const chunk = 4096;
      for (let start = 0; start < length; start += chunk) {
        if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
        const n = Math.min(chunk, length - start);
        const data = new Float32Array(n * channels);
        for (let c = 0; c < channels; c++) {
          const src = planes[c] as Float32Array;
          for (let i = 0; i < n; i++) data[c * n + i] = src[length - 1 - (start + i)] ?? 0;
        }
        const sample = new AudioSample({
          data,
          format: "f32-planar",
          numberOfChannels: channels,
          sampleRate: rate,
          timestamp: lead + start / rate,
        });
        try {
          await audio.add(sample);
        } finally {
          sample.close();
        }
      }
      soundSec = length / rate;
      await addOpusTail(audio, codec, rate, channels, lead + soundSec);
      audio.close();
    };

    try {
      await Promise.all([pumpVideo(), pumpAudio()]);
      ctx.onProgress({ phase: "finishing", ratio: 1, detail: "Writing the file" });
      await output.finalize();
    } catch (e) {
      await output.cancel().catch(() => undefined);
      throw e;
    }
    const data = await store.finish();
    finished = true;
    const parts = audio
      ? await withEncoderDelaySignalled(
          output,
          data,
          job.to,
          soundSec > 0 ? soundSec : undefined,
          0,
          true,
        )
      : null;
    return { blob: new Blob(parts ?? [data], { type: mime }), frames: written, soundSec };
  } catch (e) {
    // A cancel or failure removes the partial file or frees its memory at once.
    if (store && !finished) await store.discard().catch(() => undefined);
    if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
    throw classifyError(e);
  } finally {
    input.dispose();
  }
}
