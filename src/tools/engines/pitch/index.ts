/**
 * Change pitch (E11): the sound of an audio file or a video moves up or down by semitones and cents
 * while its length stays exactly the same (../sound/dsp/pitch: band-limited resampling, then a
 * phase-locked vocoder that keeps attacks). The worker half; runs start on the page
 * (`../sound/page.ts`), which adds the ffmpeg.wasm stages for MP3, OGG and AIFF. A video's picture is
 * copied packet for packet. Peaks the shift raises above −1 dBTP are held by the shared limiter.
 * Runs in the engine worker; no network access.
 */
import { EngineError } from "../errors";
import { PitchShifter } from "../sound/dsp/pitch";
import { canRunSound, runSoundJob } from "../sound/job";
import type { Engine } from "../types";
import { PitchOptions, pitchFilter, pitchSuffix, shiftWords } from "./options";

export { PitchOptions } from "./options";

/** Peaks above this after the shift are limited (a shift can raise a waveform's crest a little). */
export const PITCH_CEILING_DB = -1;

export const pitchEngine: Engine<PitchOptions> = {
  id: "pitch",
  backends: ["webcodecs"],
  optionsSchema: PitchOptions,
  async supports(backend, input, options) {
    return backend === "webcodecs" && canRunSound(input, options.output);
  },
  async run(_backend, inputs, o, ctx) {
    const input = inputs[0];
    if (!input) throw new EngineError("internal", "No input file.");
    return runSoundJob(
      input,
      {
        suffix: pitchSuffix(o),
        label: "Shifting the pitch",
        measureFirst: false,
        output: o.output,
        chain: () => ({ ceilingDb: PITCH_CEILING_DB }),
        processor: (facts) =>
          new PitchShifter({
            sampleRate: facts.sampleRate,
            channels: facts.channels,
            semitones: o.semitones,
            cents: o.cents,
          }),
        filter: () => pitchFilter(o),
        describe: shiftWords(o),
      },
      ctx,
    );
  },
};
