/**
 * Add a watermark (feature G1): an image or text mark drawn over every frame, with a position, size,
 * opacity and an optional time range. Always a re-encode of the picture (the mark becomes part of
 * it); the sound is copied when the container allows. The WebCodecs path composites on a canvas
 * (../overlay/composite); containers only ffmpeg reads go through ffmpeg's overlay filter on the
 * page (./ffmpeg via engines/page-runners).
 */

import { withEvenCropOut } from "../crop/math";
import { EngineError } from "../errors";
import { pictureDecodes } from "../mediabunny/shared";
import { compositeSupported, runComposite } from "../overlay/composite";
import type { Engine } from "../types";
import {
  effectiveRange,
  markRect,
  needMark,
  overlayFilter,
  placeName,
  showsAt,
  WatermarkOptions,
  watermarkCommand,
} from "./options";

export const watermarkEngine: Engine<WatermarkOptions> = {
  id: "watermark",
  backends: ["webcodecs", "ffmpeg-wasm"],
  optionsSchema: WatermarkOptions,
  async supports(backend, input) {
    return backend === "webcodecs" && pictureDecodes(input.info) && compositeSupported(input.info);
  },
  async run(_backend, inputs, options, ctx) {
    const input = inputs[0];
    const info = input?.info;
    const v = info?.video;
    if (!input || !info || !v)
      throw new EngineError(
        "unsupported-input",
        "This file has no video track to put a watermark on.",
        "Choose a video file.",
      );
    const mark = needMark(options);
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(mark);
    } catch {
      throw new EngineError(
        "unsupported-input",
        "The watermark image could not be read.",
        "Use a PNG, JPEG, WebP or SVG file.",
      );
    }
    const range = effectiveRange(options, info.durationSec);
    try {
      return await runComposite({
        file: input.file,
        info,
        layer: (size) => {
          const rect = markRect(options, size);
          return {
            draw: (c2d, t) => {
              if (!showsAt(range, t)) return;
              c2d.globalAlpha = options.opacity;
              c2d.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height);
              c2d.globalAlpha = 1;
            },
          };
        },
        suffix: "watermarked",
        what: `${options.kind === "text" ? "text" : "logo"} ${placeName(options)}`,
        ffmpegCommand: ({ outputName, kbps, copyAudio }) =>
          watermarkCommand(
            input.file.name,
            options.kind === "text" ? "watermark.png" : (options.image?.name ?? "logo.png"),
            outputName,
            withEvenCropOut(v, overlayFilter(markRect(options, v), options.opacity, range)),
            kbps,
            copyAudio,
          ),
        ctx,
      });
    } finally {
      bitmap.close();
    }
  },
};
