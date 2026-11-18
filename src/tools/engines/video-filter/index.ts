/**
 * Filter: one colour transform over the whole clip (black and white, a colour look, or brightness,
 * contrast and saturation). Always a re-encode of the picture; the sound is copied when the
 * container holds it. The native path runs in the engine worker (./run); files only ffmpeg can read
 * go through ./ffmpeg on the page (engines/page-runners, the panel's `route`).
 */
import { canEncodeAvc, pictureDecodes } from "../mediabunny/shared";
import type { Engine } from "../types";
import { ffmpegColorFilter } from "./color";
import { FilterOptions, filterSuffix, filterTransform, filterWhat } from "./options";
import { pictureSize } from "./plan";
import { noVideoError, runFilter } from "./run";

export const filterEngine: Engine<FilterOptions> = {
  id: "filter",
  backends: ["webcodecs", "ffmpeg-wasm"],
  optionsSchema: FilterOptions,
  async supports(backend, input) {
    if (backend !== "webcodecs") return false;
    if (!pictureDecodes(input.info)) return false;
    const info = input.info;
    if (!info?.video) return false;
    const size = pictureSize(info);
    return canEncodeAvc(size.width, size.height);
  },
  async run(_backend, inputs, options, ctx) {
    const input = inputs[0];
    const info = input?.info;
    if (!input || !info?.video) throw noVideoError();
    const t = filterTransform(options);
    return runFilter({
      file: input.file,
      info,
      transformAt: () => t,
      sound: "keep",
      suffix: filterSuffix(options),
      what: filterWhat(options),
      vf: `${ffmpegColorFilter(t) || "null"},format=yuv420p`,
      ctx,
    });
  },
};

export { FilterOptions };
