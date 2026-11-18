/**
 * Crop: keep a rectangle of the picture. Always a re-encode (a crop changes every frame's pixels;
 * no container stores it as metadata that players honour). Native path through mediabunny in the
 * engine worker; files the native reader cannot open (AVI, WMV, FLV, ...) go through ffmpeg.wasm on
 * the page (./ffmpeg via engines/page-runners).
 */

import { EngineError } from "../errors";
import { pictureDecodes } from "../mediabunny/shared";
import type { Engine } from "../types";
import { isFullFrame } from "./math";
import { geometrySupported, runGeometry } from "./native";
import { CropOptions, cropRect } from "./options";

export const cropEngine: Engine<CropOptions> = {
  id: "crop",
  backends: ["webcodecs", "ffmpeg-wasm"],
  optionsSchema: CropOptions,
  async supports(backend, input, options) {
    if (backend !== "webcodecs") return false;
    if (!pictureDecodes(input.info)) return false;
    const v = input.info?.video;
    if (!v) return false;
    return geometrySupported({ kind: "crop", rect: cropRect(options, v) });
  },
  async run(_backend, inputs, options, ctx) {
    const input = inputs[0];
    const info = input?.info;
    const v = info?.video;
    if (!input || !info || !v) {
      throw new EngineError(
        "unsupported-input",
        "This file has no video track to crop.",
        "Choose a video file.",
      );
    }
    const rect = cropRect(options, v);
    if (isFullFrame(rect, v)) {
      throw new EngineError(
        "internal",
        "Nothing to crop: the frame covers the whole picture.",
        "Drag the frame's edges or pick a shape first.",
      );
    }
    return runGeometry(input.file, info, { kind: "crop", rect }, "cropped", ctx);
  },
};
