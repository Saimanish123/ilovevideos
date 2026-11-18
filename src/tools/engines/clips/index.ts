/**
 * Clips for short-video platforms (C8). Two jobs on one engine:
 *
 * - `analyze`: finds scene cuts for the page's proposal (./plan). Only key frames are decoded (an
 *   encoder places one at most scene changes, and decoding one needs nothing else), each shrunk to
 *   32×18 grey; a cut is where the mean difference to the previous key frame is far above the
 *   video's usual change. The result is JSON, for the page; nothing is written.
 * - the run: each included clip is cut exactly at its times, optionally reframed to 9:16 (a crop
 *   window placed per clip, or the whole picture over a blurred copy), and encoded to H.264 and AAC
 *   in its own MP4 (../compose/encode). The stage zips them.
 *
 * Runs in the engine worker. No network access.
 */
import { type VideoSample, VideoSampleSink } from "mediabunny";
import { z } from "zod";
import { baseName, formatDuration } from "@/lib/format";
import { encodeComposed } from "../compose/encode";
import { exactSpan } from "../compose/sound";
import { FrameCanvas, openPicture, type Picture } from "../compose/source";
import { drawBlurred } from "../crop/native";
import { classifyError, EngineError } from "../errors";
import { canEncodeAvc, openInput, pictureDecodes } from "../mediabunny/shared";
import { openSound, type SoundSource } from "../sound/reader";
import type { Engine, EngineContext, EngineOutputFile, MediaInfo } from "../types";
import { findSceneCuts } from "./scenes";

export type { SceneAnalysis } from "./scenes";

import {
  blurFit,
  type Clip,
  ClipsOptions,
  clipBitrate,
  clipCommand,
  clipName,
  cropWindow,
  isVertical,
  outputFrame,
} from "./plan";

export const ClipsEngineOptions = ClipsOptions.extend({
  /** Page-only: find scene cuts instead of writing clips (`clips` is then ignored). */
  analyze: z.boolean().optional(),
});
export type ClipsEngineOptions = z.infer<typeof ClipsEngineOptions>;

/** Frames of one clip, from its start, as output frames of `frame` size. */
async function* clipFrames(
  pic: Picture,
  clip: Clip,
  t0: number,
  frame: { width: number; height: number },
  reframe: ClipsOptions["reframe"],
  signal: AbortSignal,
): AsyncGenerator<VideoSample> {
  const vertical = isVertical(pic.display);
  const mode = vertical ? "none" : reframe;
  const canvas =
    mode === "none" && pic.passThrough ? undefined : new FrameCanvas(frame.width, frame.height);
  const scratch: { small?: OffscreenCanvas; mid?: OffscreenCanvas } = {};
  const sink = new VideoSampleSink(pic.track);
  const length = clip.end - clip.start;
  for await (const s of sink.samples(clip.start + t0, clip.end + t0)) {
    if (signal.aborted) {
      s.close();
      return;
    }
    const at = s.timestamp - t0 - clip.start;
    const end = Math.min(length, at + s.duration);
    // A frame that starts before the clip is shown from its first moment; one at its end is left out.
    const t = Math.max(0, at);
    if (end - t <= 1e-6 || t >= length - 1e-6) {
      s.close();
      continue;
    }
    if (!canvas) {
      s.setTimestamp(t);
      s.setDuration(end - t);
      yield s;
      continue;
    }
    const g = canvas.ctx;
    if (mode === "crop") {
      const w = cropWindow(pic.display, clip.focus);
      const kx = s.displayWidth / pic.display.width;
      const ky = s.displayHeight / pic.display.height;
      s.draw(g, w.x * kx, w.y * ky, w.width * kx, w.height * ky, 0, 0, frame.width, frame.height);
    } else if (mode === "blur") {
      drawBlurred(g, s, frame.width, frame.height, scratch);
      const fit = blurFit(pic.display, frame);
      s.draw(g, fit.x, fit.y, fit.width, fit.height);
    } else {
      canvas.drawWhole(s, pic.display);
    }
    s.close();
    yield canvas.sample(t, end - t);
  }
}

export const clipsEngine: Engine<ClipsEngineOptions> = {
  id: "clips",
  backends: ["webcodecs"],
  optionsSchema: ClipsEngineOptions,
  async supports(backend, input, options) {
    if (backend !== "webcodecs") return false;
    const info = input.info;
    if (!info?.video || !pictureDecodes(info)) return false;
    if (options.analyze) return true;
    const f = outputFrame(info.video, options.reframe);
    return canEncodeAvc(f.width, f.height);
  },
  async run(_backend, inputs, options, ctx) {
    const src = inputs[0];
    const info = src?.info;
    if (!src || !info?.video)
      throw new EngineError(
        "unsupported-input",
        "This file has no picture to cut into clips.",
        "Choose a video file.",
      );
    if (options.analyze) {
      const result = await findSceneCuts(
        src.file,
        info.startSec ?? 0,
        ctx.signal,
        (ratio, detail) => ctx.onProgress({ phase: "analyzing", ratio, detail }),
      );
      return {
        blob: new Blob([JSON.stringify(result)], { type: "application/json" }),
        filename: "scenes.json",
      };
    }
    return writeClips(src.file, info, ClipsOptions.parse(options), ctx);
  },
};

async function writeClips(file: File, info: MediaInfo, o: ClipsOptions, ctx: EngineContext) {
  const chosen = o.clips
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.include && c.end - c.start > 0.05);
  if (chosen.length === 0)
    throw new EngineError(
      "unsupported-input",
      "Every clip is skipped.",
      "Include at least one clip.",
    );
  const input = openInput(file);
  try {
    const pic = await openPicture(input);
    const frame = outputFrame(pic.display, o.reframe);
    const fps = info.video?.fps && info.video.fps > 0 ? Math.min(60, info.video.fps) : 30;
    const bitrate = info.video ? clipBitrate(info.video, o.reframe, fps) : 1_000_000;
    const sound: SoundSource | null = await openSound(input, file);
    const soundOk = !!sound && (await sound.track.canDecode());
    const t0 = info.startSec ?? 0;
    const shift = t0 + (sound?.delay ?? 0);
    const base = baseName(file.name);
    const tags = await input.getMetadataTags().catch(() => undefined);
    const files: EngineOutputFile[] = [];
    const commands: string[] = [];
    for (const [k, { c, i }] of chosen.entries()) {
      const name = clipName(base, i, o.clips.length);
      const length = c.end - c.start;
      const span: [number, number] = [k / chosen.length, (k + 1) / chosen.length];
      const r = await encodeComposed({
        size: frame,
        fps,
        bitrate,
        durationSec: length,
        frames: (signal) => clipFrames(pic, c, t0, frame, o.reframe, signal),
        ...(soundOk && sound
          ? {
              sound: {
                sampleRate: sound.sampleRate,
                channels: sound.channels,
                blocks: (signal: AbortSignal) =>
                  exactSpan(
                    sound,
                    c.start,
                    c.end,
                    shift,
                    { in: c.start > 0, out: c.end < info.durationSec - 0.01 },
                    signal,
                  ),
              },
            }
          : {}),
        ...(pic.passThrough && (o.reframe === "none" || isVertical(pic.display))
          ? { rotation: pic.rotation }
          : {}),
        expectedBytes: Math.round(((bitrate + 192_000) * length) / 8) + 1_000_000,
        tags,
        label: `Clip ${k + 1} of ${chosen.length}`,
        span,
        ctx: {
          signal: ctx.signal,
          onProgress: (p) => ctx.onProgress({ ...p, item: { index: i, count: o.clips.length } }),
        },
      });
      files.push({
        blob: r.blob,
        filename: name,
        meta: `${formatDuration(c.start)}–${formatDuration(c.end)} · ${length.toFixed(1)} s`,
      });
      commands.push(
        clipCommand({
          input: file.name,
          output: name,
          clip: c,
          src: pic.display,
          reframe: o.reframe,
          kbps: Math.round(bitrate / 1000),
          sound: soundOk,
        }),
      );
    }
    const first = files[0];
    if (!first) throw new EngineError("internal", "No clip was written.", "Try again.");
    const shape =
      isVertical(pic.display) || o.reframe === "none"
        ? `${frame.width}×${frame.height}`
        : `${frame.width}×${frame.height}, ${o.reframe === "crop" ? "cropped to 9:16" : "9:16 over a blurred background"}`;
    return {
      blob: first.blob,
      filename: first.filename,
      files,
      ffmpegCommand: commands.join("\n"),
      meta: `${files.length} ${files.length === 1 ? "clip" : "clips"} · ${shape} · H.264${soundOk ? " and AAC" : ""}, re-encoded`,
    };
  } catch (e) {
    if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
    throw classifyError(e);
  } finally {
    input.dispose();
  }
}

export { ClipsOptions };
