/**
 * Waveform reader. Decodes the first audio track with mediabunny (WebCodecs) and reduces it to
 * `buckets` peak values (0–1, the largest absolute sample in each slice of time, across channels).
 * Files up to 30 minutes are decoded in full and reported in steps so the picture fills in as it
 * is read; longer files are sampled at one packet per bucket, which is quick but can miss short
 * peaks between samples. Runs in its own worker so the engine worker stays free for the real job.
 * No network access (README.md#privacy-and-processing §2).
 */
import { ALL_FORMATS, type AudioSample, AudioSampleSink, BlobSource, Input } from "mediabunny";
import { flacSource, looksFlac } from "@/tools/engines/mediabunny/flac-tail";
import { announceReady } from "./ready";

export type ToWaveform = { type: "read"; id: number; file: File; buckets: number };
export type FromWaveform =
  | { type: "peaks"; id: number; peaks: Float32Array; ratio: number; done: boolean }
  | { type: "none"; id: number; reason: "no-audio" | "unreadable" };

const FULL_DECODE_LIMIT_SEC = 30 * 60;
const REPORT_EVERY_MS = 120;

const post = (msg: FromWaveform) =>
  (self as unknown as { postMessage: (m: FromWaveform) => void }).postMessage(msg);

let current = 0;

/** Largest absolute value per channel plane of one decoded sample, folded into `peaks`. */
function fold(sample: AudioSample, peaks: Float32Array, duration: number, scratch: Float32Array[]) {
  const frames = sample.numberOfFrames;
  const rate = sample.sampleRate;
  const buckets = peaks.length;
  for (let c = 0; c < sample.numberOfChannels; c++) {
    let plane = scratch[c];
    if (!plane || plane.length < frames) {
      plane = new Float32Array(frames);
      scratch[c] = plane;
    }
    sample.copyTo(plane, { planeIndex: c, format: "f32-planar" });
    for (let i = 0; i < frames; i++) {
      const b = Math.min(
        buckets - 1,
        Math.floor(((sample.timestamp + i / rate) / duration) * buckets),
      );
      if (b < 0) continue;
      const v = Math.abs(plane[i] ?? 0);
      if (v > (peaks[b] ?? 0)) peaks[b] = v;
    }
  }
}

self.onmessage = async (event: MessageEvent<ToWaveform>) => {
  const msg = event.data;
  if (msg.type !== "read") return;
  const id = msg.id;
  current = id;
  const stale = () => current !== id;
  let input: Input | undefined;
  try {
    // FLAC through its own source so a tiny last frame is drawn too (engines/mediabunny/flac-tail).
    const source = looksFlac(msg.file) ? flacSource(msg.file) : new BlobSource(msg.file);
    input = new Input({ source, formats: ALL_FORMATS });
    const track = await input.getPrimaryAudioTrack();
    if (!track) {
      post({ type: "none", id, reason: "no-audio" });
      return;
    }
    if (!(await track.canDecode())) {
      post({ type: "none", id, reason: "unreadable" });
      return;
    }
    const duration = (await input.getDurationFromMetadata()) ?? (await input.computeDuration());
    if (!(duration > 0)) {
      post({ type: "none", id, reason: "unreadable" });
      return;
    }
    const peaks = new Float32Array(msg.buckets);
    const sink = new AudioSampleSink(track);
    const scratch: Float32Array[] = [];
    let last = performance.now();
    const report = (ratio: number, done: boolean) =>
      post({
        type: "peaks",
        id,
        peaks: peaks.slice(),
        ratio: Number.isFinite(ratio) ? ratio : 0,
        done,
      });

    if (duration <= FULL_DECODE_LIMIT_SEC) {
      for await (const sample of sink.samples()) {
        if (stale()) {
          sample.close();
          return;
        }
        fold(sample, peaks, duration, scratch);
        const end = sample.timestamp + sample.duration;
        sample.close();
        const now = performance.now();
        if (now - last > REPORT_EVERY_MS) {
          last = now;
          report(Math.min(1, end / duration), false);
        }
      }
    } else {
      const times = Array.from(
        { length: msg.buckets },
        (_, i) => ((i + 0.5) / msg.buckets) * duration,
      );
      let i = 0;
      for await (const sample of sink.samplesAtTimestamps(times)) {
        if (stale()) {
          sample?.close();
          return;
        }
        if (sample) {
          fold(sample, peaks, duration, scratch);
          sample.close();
        }
        i++;
        const now = performance.now();
        if (now - last > REPORT_EVERY_MS) {
          last = now;
          report(i / msg.buckets, false);
        }
      }
    }
    if (!stale()) report(1, true);
  } catch {
    if (!stale()) post({ type: "none", id, reason: "unreadable" });
  } finally {
    input?.dispose();
  }
};

announceReady();
