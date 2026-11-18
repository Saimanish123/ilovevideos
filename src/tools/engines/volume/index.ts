/**
 * Change volume and normalise loudness (E4). The worker half: every run is started by the page
 * runner (`../page-runners.ts`, `../sound/page.ts`), which picks this worker for formats the browser
 * writes and adds the ffmpeg.wasm stages for the rest. The picture of a video is copied; the sound
 * is decoded, turned up or down (normalise measures EBU R128 loudness first), peak-limited when
 * asked, encoded once and measured again. Runs in the engine worker; no network access.
 */
import { EngineError } from "../errors";
import { canRunSound, runSoundJob } from "../sound/job";
import type { Engine } from "../types";
import { planGain, VolumeOptions, volumeFilter } from "./options";

export { VolumeOptions };

export const volumeEngine: Engine<VolumeOptions> = {
  id: "volume",
  backends: ["webcodecs"],
  optionsSchema: VolumeOptions,
  async supports(backend, input, options) {
    return backend === "webcodecs" && canRunSound(input, options.output);
  },
  async run(_backend, inputs, o, ctx) {
    const input = inputs[0];
    if (!input) throw new EngineError("internal", "No input file.");
    return runSoundJob(
      input,
      {
        suffix: o.mode === "normalize" ? "normalized" : o.gainDb >= 0 ? "louder" : "quieter",
        label: o.mode === "normalize" ? "Normalising" : "Changing the volume",
        // Normalise needs the loudness before it can choose the gain; a fixed gain measures the
        // source on the way through, and its limiter only ever acts above the ceiling.
        measureFirst: o.mode === "normalize",
        output: o.output,
        chain: (before) => {
          if (o.mode === "gain")
            return { gainDb: o.gainDb, ceilingDb: o.limit ? o.ceiling : undefined };
          const plan = before && planGain(o, before);
          if (!plan)
            throw new EngineError(
              "unsupported-input",
              "The sound is too short or too quiet to measure its loudness.",
              "Normalising needs at least half a second of sound; use a fixed gain instead.",
            );
          return { gainDb: plan.gainDb, ceilingDb: plan.limiter ? o.ceiling : undefined };
        },
        filter: (chain) =>
          volumeFilter(
            {
              gainDb: chain.gainDb ?? 0,
              limiter: chain.ceilingDb !== undefined,
              heldByPeaks: false,
              expected: 0,
              peakBefore: 0,
            },
            o,
          ),
      },
      ctx,
    );
  },
};
