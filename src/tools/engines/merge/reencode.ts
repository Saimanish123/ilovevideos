/**
 * Re-encoding join for clips that differ: every frame of every clip is decoded, fitted into the
 * first clip's frame (black bars, or cropped to fill) and fed to one H.264 encoder; every clip's
 * sound is resampled to one rate and layout and fed to one AAC (or Opus) encoder; clips without
 * sound get silence so picture and sound stay together. Runs in the engine worker via WebCodecs.
 */
import {
  AudioSample,
  AudioSampleSink,
  AudioSampleSource,
  CanvasSink,
  canEncodeAudio,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  VideoSample,
  VideoSampleSource,
} from "mediabunny";
import { formatDuration } from "@/lib/format";
import { classifyError, EngineError } from "../errors";
import { fileOfInput } from "../mediabunny/input-files";
import { addOpusTail } from "../mediabunny/opus-delay";
import { openOutputStore } from "../mediabunny/output-store";
import { PRE_ROLL_SEC } from "../mediabunny/pre-roll";
import { addAacLead, withEncoderDelaySignalled } from "../mediabunny/priming";
import type { EngineContext } from "../types";
import type { OpenClip } from "./concat";
import { LinearResampler, mixChannels } from "./resample";

export interface ReencodeTarget {
  width: number;
  height: number;
  fit: "contain" | "cover";
}

export async function pickAudio(
  clips: OpenClip[],
): Promise<{ codec: "aac" | "opus"; sampleRate: number; channels: number } | null> {
  const withAudio = clips.filter((c) => c.audio);
  if (withAudio.length === 0) return null;
  // The first clip with sound sets the rate; channels are the most any clip has, at most stereo.
  const sampleRate = withAudio[0]?.audio?.sampleRate ?? 48_000;
  const channels = Math.min(2, Math.max(...withAudio.map((c) => c.audio?.numberOfChannels ?? 2)));
  for (const codec of ["aac", "opus"] as const) {
    const rate = codec === "opus" ? 48_000 : sampleRate;
    if (await canEncodeAudio(codec, { numberOfChannels: channels, sampleRate: rate }))
      return { codec, sampleRate: rate, channels };
  }
  throw new EngineError(
    "unsupported-output",
    "Your browser cannot encode audio for the joined file.",
    "Try desktop Chrome, Edge or Safari 17.4 or newer.",
  );
}

export async function concatReencode(
  clips: OpenClip[],
  target: ReencodeTarget,
  ctx: EngineContext,
): Promise<{ blob: Blob; audioCodec?: "aac" | "opus" }> {
  const audio = await pickAudio(clips);
  // About as large as the clips together; large joins stream to disk (../mediabunny/output-store).
  const store = await openOutputStore(
    clips.reduce((n, c) => n + (fileOfInput(c.input)?.size ?? 0), 0),
  );
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: store.streamed ? false : "in-memory" }),
    target: store.target,
  });
  const videoSource = new VideoSampleSource({
    codec: "avc",
    quality: QUALITY_HIGH,
    sizeChangeBehavior: "passThrough",
  });
  output.addVideoTrack(videoSource);
  const audioSource = audio
    ? new AudioSampleSource({
        codec: audio.codec,
        quality: QUALITY_HIGH,
      })
    : null;
  if (audioSource) output.addAudioTrack(audioSource);

  const total = clips.reduce((s, c) => s + (c.end - c.start), 0);
  const check = () => {
    if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
  };
  let offset = 0;
  let audioEnd = 0;
  /** Seconds of silence fed first for an AAC encoder that swallows its start (../mediabunny/priming). */
  let leadSec = 0;

  /** Silence from `audioEnd` to `until`, in one-second samples, so the sound track has no holes. */
  const fillSilence = async (until: number) => {
    if (!audio || !audioSource) return;
    while (until - audioEnd > 1e-3) {
      check();
      const seconds = Math.min(1, until - audioEnd);
      const frames = Math.max(1, Math.round(seconds * audio.sampleRate));
      const sample = new AudioSample({
        data: new Float32Array(frames * audio.channels),
        format: "f32-planar",
        numberOfChannels: audio.channels,
        sampleRate: audio.sampleRate,
        timestamp: audioEnd + leadSec,
      });
      await audioSource.add(sample);
      sample.close();
      audioEnd += frames / audio.sampleRate;
    }
  };

  try {
    await output.start();
    // AAC: the silence this browser's encoder swallows at its start goes in first (WebKit: 1024).
    if (audio && audioSource)
      leadSec = await addAacLead(audioSource, audio.codec, audio.sampleRate, audio.channels);
    for (const [i, clip] of clips.entries()) {
      check();
      const shift = offset - clip.start;
      const span = clip.end - clip.start;

      const videoLoop = async () => {
        if (!clip.video) return;
        const sink = new CanvasSink(clip.video, {
          width: target.width,
          height: target.height,
          fit: target.fit,
          poolSize: 2,
        });
        let frames = 0;
        for await (const wrapped of sink.canvases(clip.start)) {
          check();
          const ts = wrapped.timestamp + shift;
          if (ts < offset - 1e-6) continue;
          // The sample copies the canvas at construction, so the pooled canvas can be reused.
          const sample = new VideoSample(wrapped.canvas, {
            timestamp: ts,
            duration: wrapped.duration,
          });
          await videoSource.add(sample);
          sample.close();
          frames++;
          const done = offset + (wrapped.timestamp - clip.start);
          ctx.onProgress({
            phase: "processing",
            ratio: total > 0 ? Math.min(1, done / total) : 0,
            detail: `Clip ${i + 1} of ${clips.length} · ${formatDuration(done)} of ${formatDuration(total)} encoded`,
            item: { index: i, count: clips.length },
          });
        }
        if (frames === 0)
          throw new EngineError(
            "unsupported-input",
            `Clip ${i + 1} (${clip.name}) has no frames this browser can decode.`,
            "Convert it to MP4 first, or remove it.",
          );
      };

      const audioLoop = async () => {
        if (!audio || !audioSource) return;
        if (clip.audio) {
          const sink = new AudioSampleSink(clip.audio);
          // One encoder takes one rate and layout: convert this clip's sound when it differs.
          const same =
            clip.audio.sampleRate === audio.sampleRate &&
            clip.audio.numberOfChannels === audio.channels;
          const resampler = same
            ? null
            : new LinearResampler(clip.audio.sampleRate, audio.sampleRate, audio.channels);
          const convert = (x: AudioSample, timestamp: number): AudioSample => {
            if (!resampler) return x;
            const planes = Array.from({ length: x.numberOfChannels }, (_, c) => {
              const plane = new Float32Array(x.numberOfFrames);
              x.copyTo(plane, { planeIndex: c, format: "f32-planar" });
              return plane;
            });
            const out = resampler.process(mixChannels(planes, audio.channels));
            const frames = out[0]?.length ?? 0;
            const data = new Float32Array(frames * audio.channels);
            out.forEach((plane, c) => {
              data.set(plane, c * frames);
            });
            return new AudioSample({
              data,
              format: "f32-planar",
              numberOfChannels: audio.channels,
              sampleRate: audio.sampleRate,
              timestamp,
            });
          };
          // Decode from a little before the clip so its first frame is whole (../mediabunny/pre-roll);
          // what lies before the clip's start is dropped below with the overlap.
          const first = await clip.audio.getFirstTimestamp();
          const from = Math.min(clip.start, Math.max(first, clip.start - PRE_ROLL_SEC));
          for await (const sample of sink.samples(from, clip.end)) {
            check();
            let s = sample;
            let ts = sample.timestamp + shift;
            // Drop what overlaps the previous clip's sound; fill any gap with silence.
            if (ts < audioEnd - 1e-6) {
              const skip = Math.round((audioEnd - ts) * sample.sampleRate);
              if (skip >= sample.numberOfFrames) {
                sample.close();
                continue;
              }
              s = sample.trim(skip);
              sample.close();
              ts = audioEnd;
            } else if (ts > audioEnd + 1e-3) {
              await fillSilence(ts);
            }
            const out = convert(s, ts);
            if (out !== s) s.close();
            out.setTimestamp(ts + leadSec);
            if (out.numberOfFrames > 0) {
              await audioSource.add(out);
              audioEnd = ts + out.duration;
            }
            out.close();
          }
        }
        await fillSilence(offset + span);
      };

      await Promise.all([videoLoop(), audioLoop()]);
      offset += span;
    }
    if (audio && audioSource)
      await addOpusTail(
        audioSource,
        audio.codec,
        audio.sampleRate,
        audio.channels,
        audioEnd + leadSec,
      );
    ctx.onProgress({ phase: "finishing", ratio: 1, detail: "Writing the file" });
    await output.finalize();
  } catch (e) {
    await output.cancel().catch(() => undefined);
    await store.discard();
    if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
    throw classifyError(e);
  }
  const data = await store.finish();
  // The AAC encoder's priming would push the sound late: signal it with an edit list (../mediabunny/priming).
  const parts = await withEncoderDelaySignalled(output, data, "mp4", total, 0, true);
  return { blob: new Blob(parts ?? [data], { type: "video/mp4" }), audioCodec: audio?.codec };
}
