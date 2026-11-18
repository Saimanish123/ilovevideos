/**
 * Key and BPM finder (E11): reads the sound of an audio file or a video once and measures its tempo
 * and key (../sound/dsp/music). Nothing is written; the result is JSON for the page's panel, which
 * is the result itself. Runs in the engine worker; no network access.
 */
import { z } from "zod";
import { EngineError } from "../errors";
import { openInput } from "../mediabunny/shared";
import { estimateKey, estimateTempo, MusicFeatureReader } from "../sound/dsp/music";
import { pacedRatio } from "../sound/pace";
import { openSound, readSound } from "../sound/reader";
import type { Engine, EngineContext } from "../types";
import type { MusicAnalysis } from "./result";

export const AudioAnalyzeOptions = z.object({});
export type AudioAnalyzeOptions = z.infer<typeof AudioAnalyzeOptions>;

export async function analyzeMusic(file: File, ctx: EngineContext): Promise<MusicAnalysis> {
  const input = openInput(file);
  try {
    const src = await openSound(input, file);
    if (!src)
      throw new EngineError(
        "unsupported-input",
        "This file has no sound track, so there is no key or tempo to find.",
      );
    if (!(await src.track.canDecode()))
      throw new EngineError(
        "unsupported-input",
        "This browser cannot decode the sound in this file.",
        "Convert it to WAV or M4A with the audio converter first.",
      );
    const reader = new MusicFeatureReader(src.sampleRate);
    const total = Math.max(1e-6, src.end - src.origin);
    const progress = pacedRatio((r) =>
      ctx.onProgress({
        phase: "analyzing",
        ratio: r,
        detail: `Listening · ${Math.round(r * 100)}%`,
      }),
    );
    for await (const block of readSound(src, src.origin, src.end, ctx.signal)) {
      reader.push(block.planes, block.frames);
      progress?.(Math.min(1, (block.time + block.frames / src.sampleRate - src.origin) / total));
    }
    if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
    const features = reader.finish();
    return {
      seconds: features.seconds,
      tempo: estimateTempo(features),
      key: estimateKey(features),
    };
  } finally {
    input.dispose();
  }
}

export const audioAnalyzeEngine: Engine<AudioAnalyzeOptions> = {
  id: "audio-analyze",
  backends: ["webcodecs"],
  optionsSchema: AudioAnalyzeOptions,
  async supports(backend, input) {
    return backend === "webcodecs" && (input.info?.audio?.length ?? 0) > 0;
  },
  async run(_backend, inputs, _options, ctx) {
    const input = inputs[0];
    if (!input) throw new EngineError("internal", "No input file.");
    const result = await analyzeMusic(input.file, ctx);
    return {
      blob: new Blob([JSON.stringify(result)], { type: "application/json" }),
      filename: "analysis.json",
      meta: "analysis",
    };
  },
};
