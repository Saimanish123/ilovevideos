/**
 * Add a border: a band of colour on every edge of the picture, drawn by the geometry runner the
 * aspect-ratio engine uses for its bars (../crop/native, ADR-0015). A separate engine because the job
 * is different (a thickness and a colour, not a target shape). Always a re-encode to H.264; the sound
 * is copied when the container allows. Files only ffmpeg can read go through ../crop/ffmpeg.
 */

import { formatDimensions } from "@/lib/format";
import { geometrySupported, runGeometry } from "../crop/native";
import { EngineError } from "../errors";
import { pictureDecodes } from "../mediabunny/shared";
import type { Engine } from "../types";
import { borderPlan, borderPx, borderTooThick, borderWhat, PadOptions } from "./options";

export const padEngine: Engine<PadOptions> = {
  id: "pad",
  backends: ["webcodecs", "ffmpeg-wasm"],
  optionsSchema: PadOptions,
  async supports(backend, input, options) {
    if (backend !== "webcodecs" || !input.info?.video) return false;
    if (!pictureDecodes(input.info)) return false;
    return geometrySupported(borderPlan(options, input.info));
  },
  async run(_backend, inputs, options, ctx) {
    const input = inputs[0];
    const info = input?.info;
    const v = info?.video;
    if (!input || !info || !v) {
      throw new EngineError(
        "unsupported-input",
        "This file has no video track to add a border to.",
        "Choose a video file.",
      );
    }
    if (borderTooThick(options, v)) {
      throw new EngineError(
        "internal",
        `A ${borderPx(options, v)} px border leaves no room for the picture in ${formatDimensions(v.width, v.height)}.`,
        "Choose a thinner border.",
      );
    }
    return runGeometry(input.file, info, borderPlan(options, info), "border", ctx, {
      what: borderWhat(options, info),
      tooBig: "Choose a thinner border or Keep the frame size, or make the video smaller first.",
    });
  },
};

export { PadOptions };
