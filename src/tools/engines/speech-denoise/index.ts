/**
 * Remove background noise from speech (E8, ADR-0108): RNNoise 0.2 on this device
 * (../sound/dsp/rnnoise), for an audio file or a video's sound. The worker half; runs start on the
 * page (../sound/page), which adds the ffmpeg.wasm stages for MP3, OGG and AIFF. A video's picture is
 * copied packet for packet; the sound is encoded once. With "keep the loudness" a first pass cleans
 * and measures the sound, and the render adds the gain that brings it back to the original's
 * integrated loudness, peaks held at −1 dBTP by the shared limiter.
 * Runs in the engine worker. The model is our own file under /models (workers/speech-models); no
 * user data leaves the device.
 */

import { formatBytes } from "@/lib/format";
import { loadSpeechModel, SPEECH_MODELS } from "@/tools/workers/speech-models";
import { EngineError } from "../errors";
import { DenoiseProcessor, instantiateRnnoise } from "../sound/dsp/rnnoise";
import { canRunSound, runSoundJob } from "../sound/job";
import type { Engine } from "../types";
import {
  DENOISE_CEILING_DB,
  denoiseFilter,
  MAX_MAKEUP_DB,
  makeupGain,
  SpeechDenoiseOptions,
} from "./options";

export { SpeechDenoiseOptions } from "./options";

/** Share of the run's progress the model download takes. */
const MODEL_SHARE = 0.04;

export const speechDenoiseEngine: Engine<SpeechDenoiseOptions> = {
  id: "speech-denoise",
  backends: ["webcodecs"],
  optionsSchema: SpeechDenoiseOptions,
  async supports(backend, input, options) {
    return (
      backend === "webcodecs" &&
      typeof WebAssembly !== "undefined" &&
      canRunSound(input, options.output)
    );
  },
  async run(_backend, inputs, o, ctx) {
    const input = inputs[0];
    if (!input) throw new EngineError("internal", "No input file.");
    // The download is the first small share of the run, in bytes; from the browser's cache it is
    // over at once.
    const total = SPEECH_MODELS.rnnoise.bytes;
    const loading = (r: number) =>
      ctx.onProgress({
        phase: "loading",
        ratio: r * MODEL_SHARE,
        detail: `Loading the noise model · ${(Math.floor((r * total) / 100_000) / 10).toFixed(1).replace(/\.0$/, "")} of ${formatBytes(total)}`,
      });
    loading(0);
    let rn: Awaited<ReturnType<typeof instantiateRnnoise>>;
    try {
      const bytes = await loadSpeechModel("rnnoise", loading);
      rn = await instantiateRnnoise(bytes);
    } catch (e) {
      throw new EngineError(
        "resource",
        "The noise model could not be loaded.",
        e instanceof Error && /expected/.test(e.message)
          ? "Reload the page and try again."
          : "Check the connection and try again; the model is downloaded once.",
      );
    }
    if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
    const make = (facts: { sampleRate: number; channels: number }) =>
      new DenoiseProcessor(rn, {
        sampleRate: facts.sampleRate,
        channels: facts.channels,
        strength: o.strength / 100,
      });
    return runSoundJob(
      input,
      {
        suffix: "denoised",
        // "Pass 1 of 2 · measuring loudness", "Pass 2 of 2 · removing noise", or one pass.
        label: o.keepLoudness ? "removing noise" : "Removing noise",
        measureFirst: o.keepLoudness,
        measureThrough: o.keepLoudness ? make : undefined,
        measureLabel: "measuring loudness",
        passes: { from: MODEL_SHARE },
        keepsLoudness: o.keepLoudness ? { maxGainDb: MAX_MAKEUP_DB } : undefined,
        output: o.output,
        chain: (before, processed) => {
          const gainDb = makeupGain(o.keepLoudness, before, processed);
          return gainDb > 0 ? { gainDb, ceilingDb: DENOISE_CEILING_DB } : {};
        },
        processor: make,
        filter: (chain) => denoiseFilter(o, chain.gainDb ?? 0),
      },
      ctx,
    );
  },
};
