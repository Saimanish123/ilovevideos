/**
 * Fade audio in and out (E5), in an audio file or in the sound of a video. The worker half; runs are
 * started by the page runner (`../sound/page.ts`) like volume. The picture of a video is copied
 * untouched; the sound is decoded, faded from silence at the start and to silence at the end, and
 * encoded once. Runs in the engine worker; no network access.
 */
import { EngineError } from "../errors";
import { fadeFilter, fitFades } from "../sound/dsp/fade";
import { canRunSound, runSoundJob } from "../sound/job";
import type { Engine } from "../types";
import { AudioFadeOptions } from "./options";

export { AudioFadeOptions, MAX_FADE_SEC } from "./options";

export const audioFadeEngine: Engine<AudioFadeOptions> = {
  id: "audio-fade",
  backends: ["webcodecs"],
  optionsSchema: AudioFadeOptions,
  async supports(backend, input, options) {
    return backend === "webcodecs" && canRunSound(input, options.output);
  },
  async run(_backend, inputs, o, ctx) {
    const input = inputs[0];
    if (!input) throw new EngineError("internal", "No input file.");
    const fades = { fadeIn: o.fadeIn, fadeOut: o.fadeOut, curve: o.curve };
    return runSoundJob(
      input,
      {
        suffix: o.fadeIn > 0 && o.fadeOut > 0 ? "faded" : o.fadeIn > 0 ? "fade-in" : "fade-out",
        label: "Fading",
        measureFirst: false,
        output: o.output,
        chain: () => ({ fades }),
        filter: (_chain, seconds) => fadeFilter(fitFades(fades, seconds), seconds),
      },
      ctx,
    );
  },
};
