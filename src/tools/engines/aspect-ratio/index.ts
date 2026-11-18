/**
 * Change aspect ratio: make the picture a given shape, either by filling it (keep the largest window
 * of that shape, positioned by `anchorX`/`anchorY`) or by fitting it (scale the whole picture into
 * the new frame and fill the rest with bars). A separate engine from crop because the job and the
 * options differ (a target shape, not a rectangle) and fit has no crop equivalent; both share the
 * geometry runner in ../crop/native. Always a re-encode. Files only ffmpeg can read go through
 * ../crop/ffmpeg on the page (engines/page-runners).
 */

import { geometrySupported, runGeometry } from "../crop/native";
import { EngineError } from "../errors";
import { pictureDecodes } from "../mediabunny/shared";
import type { Engine } from "../types";
import { AspectRatioOptions, aspectPlan, aspectSuffix } from "./options";

export const aspectRatioEngine: Engine<AspectRatioOptions> = {
  id: "aspect-ratio",
  backends: ["webcodecs", "ffmpeg-wasm"],
  optionsSchema: AspectRatioOptions,
  async supports(backend, input, options) {
    if (backend !== "webcodecs") return false;
    if (!pictureDecodes(input.info)) return false;
    const v = input.info?.video;
    if (!v) return false;
    return geometrySupported(aspectPlan(options, v));
  },
  async run(_backend, inputs, options, ctx) {
    const input = inputs[0];
    const info = input?.info;
    const v = info?.video;
    if (!input || !info || !v) {
      throw new EngineError(
        "unsupported-input",
        "This file has no video track to reshape.",
        "Choose a video file.",
      );
    }
    return runGeometry(input.file, info, aspectPlan(options, v), aspectSuffix(options), ctx);
  },
};
