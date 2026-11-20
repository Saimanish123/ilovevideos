/**
 * Zoom and pan (D6). Every frame is cut to the view at its time (./options `rectAt`: key frames,
 * log-scale zoom, eased or straight) and drawn back up to the source's size on an OffscreenCanvas
 * with high-quality filtering, then encoded to H.264 (../video-filter/picture). The sound is copied
 * when the container holds it. The rectangle is fractional, so slow moves glide instead of stepping
 * a whole pixel at a time. Runs in the engine worker. No network access.
 */
import { baseName } from "@/lib/format";
import { reencodeBitrate } from "../crop/plan";
import { frameProgress, totalFrames } from "../crop/progress";
import { EngineError } from "../errors";
import { canEncodeAvc, pictureDecodes } from "../mediabunny/shared";
import { soundCodecName } from "../sound-codec";
import type { Engine } from "../types";
import { encodePicture } from "../video-filter/picture";
import { pictureContainer, pictureSize } from "../video-filter/plan";
import { deepestZoom, linesOfDetail, rectAt, ZoomOptions, zoomCommand } from "./options";

export { ZoomOptions };

export const zoomPanEngine: Engine<ZoomOptions> = {
  id: "zoom-pan",
  backends: ["webcodecs"],
  optionsSchema: ZoomOptions,
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
    const v = info?.video;
    if (!src || !info || !v)
      throw new EngineError(
        "unsupported-input",
        "This file has no picture to zoom into.",
        "Choose a video file.",
      );
    const size = pictureSize(info);
    const to = pictureContainer(src.file.name);
    const bitrate = reencodeBitrate({ size, fps: v.fps, source: v });
    const outputName = `${baseName(src.file.name)}-zoom.${to}`;
    let canvas: OffscreenCanvas | undefined;
    let c2d: OffscreenCanvasRenderingContext2D | null = null;
    const r = await encodePicture({
      file: src.file,
      info,
      to,
      outputName,
      video: {
        codec: "avc",
        bitrate,
        processedWidth: size.width,
        processedHeight: size.height,
        process: (sample) => {
          if (!canvas) {
            canvas = new OffscreenCanvas(size.width, size.height);
            c2d = canvas.getContext("2d", { alpha: false });
            if (c2d) {
              c2d.imageSmoothingEnabled = true;
              c2d.imageSmoothingQuality = "high";
            }
          }
          if (!c2d) throw new EngineError("internal", "Could not draw the frame.", "Try again.");
          // The view is placed on the picture as the page shows it (display size), then scaled to the
          // frame as decoded here, which an odd source has already lost its last column or row of.
          const k = sample.displayWidth / v.width;
          const rect = rectAt(options.keys, sample.timestamp + sample.duration / 2, options.ease, {
            width: v.width,
            height: v.height,
          });
          sample.draw(
            c2d,
            rect.x * k,
            rect.y * k,
            rect.width * k,
            rect.height * k,
            0,
            0,
            size.width,
            size.height,
          );
          return canvas;
        },
      },
      sound: "keep",
      ffmpegCommand: "",
      ctx: { ...ctx, onProgress: frameProgress(ctx, totalFrames(info.durationSec, v.fps)) },
    });
    const zoom = deepestZoom(options.keys);
    const sound =
      r.sound === "copy"
        ? "sound copied"
        : r.sound === "encode"
          ? `sound encoded to ${soundCodecName(r.soundCodec)}`
          : "no sound";
    return {
      blob: r.blob,
      filename: r.filename,
      ffmpegCommand: zoomCommand({
        input: src.file.name,
        output: outputName,
        keys: options.keys,
        ease: options.ease,
        size,
        kbps: Math.round(bitrate / 1000),
        sound: r.sound === "copy" ? "copy" : r.sound === "encode" ? "encode" : "none",
      }),
      meta: `${size.width}×${size.height} · deepest zoom ${Number(zoom.toFixed(2))}×, ${linesOfDetail(v.height, zoom)} lines of detail · re-encoded to H.264 · ${sound}`,
    };
  },
};
