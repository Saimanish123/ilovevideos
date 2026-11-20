/**
 * Freeze frame (C9). Holds chosen frames for a number of seconds (./options). Pause mode writes
 * the picture with each held frame repeated at the source's frame rate and the sound cut at each
 * hold with silence put in (../compose/encode); over mode replaces the frames under each hold with
 * the held one and copies the sound packet for packet (../video-filter/picture). The picture is
 * always re-encoded to H.264: a held frame cannot be inserted into an encoded stream without
 * re-encoding from that frame on, and one file from one encoder plays everywhere (ADR-0075).
 * Runs in the engine worker. No network access.
 */
import { type VideoSample, VideoSampleSink } from "mediabunny";
import { baseName } from "@/lib/format";
import { encodeComposed } from "../compose/encode";
import { exactSpan, silenceBlocks } from "../compose/sound";
import { FrameCanvas, frameTimes, openPicture, rateOf } from "../compose/source";
import { cropFilter, cutsOddEdge, encodedSize } from "../crop/math";
import { reencodeBitrate } from "../crop/plan";
import { frameProgress, totalFrames } from "../crop/progress";
import { classifyError, EngineError } from "../errors";
import { canEncodeAvc, openInput, pictureDecodes } from "../mediabunny/shared";
import { openSound } from "../sound/reader";
import { soundCodecName } from "../sound-codec";
import type { Engine, EngineResult, MediaInfo } from "../types";
import { encodePicture } from "../video-filter/picture";
import { pictureContainer, pictureSize } from "../video-filter/plan";
import {
  FreezeOptions,
  frameAt,
  freezeCommand,
  heldFrameAt,
  holdWords,
  outputLength,
  type PlannedHold,
  pausedTime,
  planHolds,
} from "./options";

export { FreezeOptions };

const noPicture = () =>
  new EngineError(
    "unsupported-input",
    "This file has no picture to freeze.",
    "Choose a video file.",
  );

const evenCropOf = (v: NonNullable<MediaInfo["video"]>) =>
  cutsOddEdge(v) ? cropFilter({ x: 0, y: 0, ...encodedSize(v) }) : undefined;

export const freezeFrameEngine: Engine<FreezeOptions> = {
  id: "freeze-frame",
  backends: ["webcodecs"],
  optionsSchema: FreezeOptions,
  async supports(backend, input) {
    if (backend !== "webcodecs") return false;
    const info = input.info;
    if (!info?.video || !pictureDecodes(info)) return false;
    const size = pictureSize(info);
    return canEncodeAvc(size.width, size.height);
  },
  async run(_backend, inputs, options, ctx) {
    const src = inputs[0];
    const info = src?.info;
    if (!src || !info?.video) throw noPicture();
    return options.mode === "over"
      ? freezeOver(src.file, info, options, ctx)
      : freezePause(src.file, info, options, ctx);
  },
};

async function freezePause(
  file: File,
  info: MediaInfo,
  options: FreezeOptions,
  ctx: Parameters<Engine<FreezeOptions>["run"]>[3],
): Promise<EngineResult> {
  const v = info.video;
  if (!v) throw noPicture();
  const t0 = info.startSec ?? 0;
  const duration = info.durationSec;
  const input = openInput(file);
  try {
    ctx.onProgress({ phase: "analyzing", ratio: 0, detail: "Reading the frame times" });
    const pic = await openPicture(input);
    const times = await frameTimes(pic.track, t0);
    const fps = rateOf(times, v.fps || 30);
    const planned = planHolds(options.holds, times, duration);
    if (planned.length === 0) throw noPicture();
    const outSec = outputLength(planned, duration, "pause");
    const sound = await openSound(input, file);
    const soundOk = !!sound && (await sound.track.canDecode());
    if (sound && !soundOk)
      throw new EngineError(
        "unsupported-input",
        `This browser cannot decode the sound of this video (${sound.track.codec ?? "unknown codec"}), so silence cannot be put into it.`,
        "Choose Sound keeps playing, which copies the sound, or convert the video to MP4 first.",
      );
    const turned = pic.rotation % 180 !== 0;
    const size = pic.passThrough
      ? turned
        ? { width: pic.even.height, height: pic.even.width }
        : pic.even
      : pic.even;
    const bitrate = reencodeBitrate({ size: pic.even, fps, source: v });
    const outputName = `${baseName(file.name)}-freeze.mp4`;
    const tags = await input.getMetadataTags().catch(() => undefined);
    const shift = t0 + (sound?.delay ?? 0);

    const frames = async function* (signal: AbortSignal): AsyncGenerator<VideoSample> {
      const canvas = pic.passThrough ? undefined : new FrameCanvas(pic.even.width, pic.even.height);
      const sink = new VideoSampleSink(pic.track);
      for await (const s of sink.samples()) {
        if (signal.aborted) {
          s.close();
          return;
        }
        const t = s.timestamp - t0;
        const out = pausedTime(planned, t);
        const index = frameAt(times, t);
        const hold = planned.find((h) => h.frame === index);
        let frame: VideoSample;
        if (canvas) {
          canvas.drawWhole(s, pic.display);
          frame = canvas.sample(out, s.duration);
          s.close();
        } else {
          frame = s;
          frame.setTimestamp(out);
        }
        const copy = hold ? frame.clone() : undefined;
        yield frame;
        if (hold && copy) yield* holdFrames(copy, hold, out + (hold.from - t), fps);
      }
    };

    const r = await encodeComposed({
      size,
      fps,
      bitrate,
      durationSec: outSec,
      frames,
      ...(soundOk && sound
        ? {
            sound: {
              sampleRate: sound.sampleRate,
              channels: sound.channels,
              blocks: async function* (signal) {
                let start = 0;
                for (const h of planned) {
                  yield* exactSpan(
                    sound,
                    start,
                    h.from,
                    shift,
                    { in: start > 0, out: true },
                    signal,
                  );
                  yield* silenceBlocks(h.seconds * sound.sampleRate, sound.channels);
                  start = h.from;
                }
                yield* exactSpan(
                  sound,
                  start,
                  duration,
                  shift,
                  { in: start > 0, out: false },
                  signal,
                );
              },
            },
          }
        : {}),
      ...(pic.passThrough ? { rotation: pic.rotation } : {}),
      expectedBytes: Math.round(((bitrate + 192_000) * outSec) / 8) + 1_000_000,
      tags,
      label: "Freezing",
      span: [0.02, 1],
      ctx,
    });
    const soundWords = !sound
      ? "no sound"
      : `sound with silence in the ${planned.length === 1 ? "hold" : "holds"}, encoded to ${soundCodecName(r.soundCodec)}`;
    return {
      blob: r.blob,
      filename: outputName,
      ffmpegCommand: freezeCommand({
        input: file.name,
        output: outputName,
        planned,
        mode: "pause",
        fps,
        kbps: Math.round(bitrate / 1000),
        duration,
        ...(sound
          ? { sound: { rate: sound.sampleRate, channels: Math.min(2, sound.channels) } }
          : {}),
        evenCrop: evenCropOf(v),
      }),
      meta: `${holdWords(planned)} · ${pic.even.width}×${pic.even.height} · picture re-encoded to H.264${r.profile === "baseline" ? " (Baseline profile)" : ""} · ${soundWords}`,
    };
  } catch (e) {
    if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
    throw classifyError(e);
  } finally {
    input.dispose();
  }
}

/** The held frame repeated at the frame rate over the hold, starting at output time `start`. */
function* holdFrames(
  frame: VideoSample,
  hold: PlannedHold,
  start: number,
  fps: number,
): Generator<VideoSample> {
  const n = Math.max(1, Math.round(hold.seconds * fps));
  const step = hold.seconds / n;
  try {
    for (let k = 0; k < n; k++) {
      const f = frame.clone();
      f.setTimestamp(start + k * step);
      f.setDuration(step);
      yield f;
    }
  } finally {
    frame.close();
  }
}

async function freezeOver(
  file: File,
  info: MediaInfo,
  options: FreezeOptions,
  ctx: Parameters<Engine<FreezeOptions>["run"]>[3],
): Promise<EngineResult> {
  const v = info.video;
  if (!v) throw noPicture();
  const t0 = info.startSec ?? 0;
  const input = openInput(file);
  let times: number[];
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw noPicture();
    times = await frameTimes(track, t0);
  } finally {
    input.dispose();
  }
  const fps = rateOf(times, v.fps || 30);
  const planned = planHolds(options.holds, times, info.durationSec);
  const size = pictureSize(info);
  const to = pictureContainer(file.name);
  const bitrate = reencodeBitrate({ size, fps, source: v });
  const outputName = `${baseName(file.name)}-freeze.${to}`;
  const held = new Map<number, OffscreenCanvas>();
  const r = await encodePicture({
    file,
    info,
    to,
    outputName,
    video: {
      codec: "avc",
      bitrate,
      processedWidth: size.width,
      processedHeight: size.height,
      process: (sample) => {
        const t = sample.timestamp;
        const index = frameAt(times, t);
        if (planned.some((h) => h.frame === index) && !held.has(index)) {
          const c = new OffscreenCanvas(size.width, size.height);
          const g = c.getContext("2d", { alpha: false });
          if (g) sample.draw(g, 0, 0);
          held.set(index, c);
        }
        const k = heldFrameAt(planned, t);
        return (k !== undefined ? held.get(k) : undefined) ?? sample;
      },
    },
    sound: "keep",
    ffmpegCommand: freezeCommand({
      input: file.name,
      output: outputName,
      planned,
      mode: "over",
      fps,
      kbps: Math.round(bitrate / 1000),
      duration: info.durationSec,
      ...(info.audio?.length ? { sound: { rate: 48_000, channels: 2 } } : {}),
      evenCrop: evenCropOf(v),
    }),
    ctx: { ...ctx, onProgress: frameProgress(ctx, totalFrames(info.durationSec, fps)) },
  });
  const sound =
    r.sound === "copy"
      ? "sound copied"
      : r.sound === "encode"
        ? `sound encoded to ${soundCodecName(r.soundCodec)}`
        : "no sound";
  return {
    blob: r.blob,
    filename: r.filename,
    ffmpegCommand: r.ffmpegCommand,
    meta: `${holdWords(planned)}, sound playing on · ${size.width}×${size.height} · picture re-encoded to H.264 · ${sound}`,
  };
}
