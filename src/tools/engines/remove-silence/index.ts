/**
 * Remove silence / jump cut (C7). The sound is measured every 10 ms on this device and, by default,
 * read for speech every 32 ms (Silero VAD, ADR-0110; the model is our own file under /models); the
 * pauses longer than the minimum are found with the same code the panel's timeline uses
 * (./options), and cut. An audio file is joined back together and saved in its own format (via ../sound/render, and
 * the ffmpeg stage for MP3 and OGG through ../sound/page); a video is cut in picture and sound at the
 * same frame times and re-encoded to H.264 and AAC in MP4 (./video). Runs in the engine worker.
 * No network access.
 */
import { formatDuration, withUnit } from "@/lib/format";
import { loadSpeechModel } from "@/tools/workers/speech-models";
import { EngineError } from "../errors";
import { analyzeSound } from "../sound/analyze";
import { readSafetensors, SileroVad } from "../sound/dsp/silero-vad";
import { codecFact, type SoundFacts } from "../sound/facts";
import { canRunSound } from "../sound/job";
import { buildChain } from "../sound/processor";
import { renderSound } from "../sound/render";
import { soundOutputName, soundTarget } from "../sound/target";
import type { Engine } from "../types";
import { cutFacts, detectWords, planCuts, RemoveSilenceOptions, silenceCommand } from "./options";
import { cutVideo } from "./video";

export { RemoveSilenceOptions };

export const removeSilenceEngine: Engine<RemoveSilenceOptions> = {
  id: "remove-silence",
  backends: ["webcodecs"],
  optionsSchema: RemoveSilenceOptions,
  async supports(backend, input, options) {
    return backend === "webcodecs" && canRunSound(input, options.output);
  },
  async run(_backend, inputs, o, ctx) {
    const src = inputs[0];
    if (!src?.info) throw new EngineError("internal", "No input file.");
    const { file, info } = src;
    ctx.onProgress({ phase: "analyzing", ratio: 0, detail: "Finding the pauses" });
    // Without the model (offline on a first visit), pauses are found by level, as the panel shows.
    const vad =
      o.detect === "speech"
        ? await loadSpeechModel("vad")
            .then((b) => new SileroVad(readSafetensors(new Uint8Array(b))))
            .catch(() => undefined)
        : undefined;
    const analysis = await analyzeSound(file, file.name, {
      levels: true,
      truePeak: false,
      speech: vad,
      signal: ctx.signal,
      onProgress: (r) =>
        ctx.onProgress({
          phase: "analyzing",
          ratio: r * 0.3,
          detail: `Finding the pauses · ${Math.round(r * 100)}%`,
        }),
    });
    const plan = planCuts(o, analysis.levels, analysis.duration, analysis.speech);
    if (plan.cuts.length === 0)
      throw plan.detect === "speech"
        ? new EngineError(
            "unsupported-input",
            `No pause in the speech lasts ${withUnit(o.minSilence, "s")} or longer.`,
            "Shorten the minimum pause, or find pauses by loudness.",
          )
        : new EngineError(
            "unsupported-input",
            `No pause of ${withUnit(o.minSilence, "s")} or longer is quieter than ${withUnit(plan.thresholdDb, "dBFS")}.`,
            "Raise the threshold or shorten the minimum pause.",
          );

    const target = soundTarget(info, file.name);
    if (target.kind === "none") throw new EngineError("unsupported-input", target.reason);

    if (target.kind === "video") {
      const r = await cutVideo(file, plan.cuts, ctx, info.startSec ?? 0);
      const outputName = `${file.name.replace(/\.[^.]+$/, "") || "video"}-cut.mp4`;
      const n = r.cuts.length;
      return {
        blob: r.blob,
        filename: outputName,
        ffmpegCommand: silenceCommand(file.name, outputName, { ...plan, cuts: r.cuts }, true),
        meta: `${n} ${n === 1 ? "pause" : "pauses"} cut · ${detectWords(plan)} · ${formatDuration(analysis.duration)} → ${formatDuration(r.seconds)} · re-encoded to H.264${r.profile === "baseline" ? " (Baseline profile)" : ""} and AAC, ${r.frames} frames`,
      };
    }

    const outputName = soundOutputName(file.name, "cut", target);
    const rendered = await renderSound({
      file,
      target: o.output === "wav" ? "wav" : target,
      chain: (facts) => buildChain({}, facts),
      outputName,
      ctx,
      span: [0.3, 1],
      label: "Cutting",
      spans: plan.kept,
    });
    const meta = cutFacts(plan, analysis.duration);
    const ffmpegCommand = silenceCommand(file.name, outputName, plan, false);
    if (o.output === "wav") {
      const facts: SoundFacts = {
        limitedDb: 0,
        seconds: rendered.seconds,
        otherTracks: rendered.otherTracks,
        sampleRate: rendered.sampleRate,
        channels: rendered.channels,
        filter: "",
        meta,
        suffix: "cut",
      };
      return {
        blob: rendered.blob,
        filename: outputName.replace(/\.[^.]+$/, ".wav"),
        ffmpegCommand,
        meta: JSON.stringify(facts),
      };
    }
    return {
      blob: rendered.blob,
      filename: outputName,
      ffmpegCommand,
      meta: `${meta} · ${codecFact(rendered.codec, rendered.bitrateKbps)}`,
    };
  },
};
