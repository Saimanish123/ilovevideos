/**
 * The worker half of every sound-shaping engine (volume, normalise, fades): choose the target,
 * render once through ./render, then measure what was written, so the result states the loudness and
 * peak of the actual output rather than a prediction. When the page runner asks for `wav` (ffmpeg
 * writes the final format), the measurement is left to it and the facts travel as JSON in `meta`.
 * Runs in the engine worker. No network access (README.md#privacy-and-processing §2).
 */
import { canEncodeAudio } from "mediabunny";
import { withUnit } from "@/lib/format";
import { EngineError } from "../errors";
import type { EngineContext, EngineResult, MediaInput } from "../types";
import { analyzeSound } from "./analyze";
import { LoudnessMeter, type LoudnessResult } from "./dsp/loudness";
import { channelsName, codecFact, resultMeta, type SoundFacts, soundCommand } from "./facts";
import type { Chain, ChainFacts, ChainSpec, SoundProcessor } from "./processor";
import { buildChain } from "./processor";
import { renderSound } from "./render";
import { soundOutputName, soundTarget } from "./target";

export interface SoundJobSpec {
  /** File-name suffix, e.g. "louder". */
  suffix: string;
  /** Progress wording while rendering. */
  label: string;
  /** Measure the source first (normalise needs it); progress covers it. */
  measureFirst: boolean;
  /** The chain for this file, given the source measurement when there is one. */
  chain: (before: LoudnessResult | undefined) => ChainSpec & { gainDb?: number };
  /** The ffmpeg `-af` filter for the shown command. */
  filter: (chain: ChainSpec, seconds: number) => string;
  output: "auto" | "wav";
  /**
   * A processor run before the chain (pitch shift): it must return as many frames as it is given, in
   * total, by the end of `flush`. Optional; the chain alone when absent.
   */
  processor?: (facts: ChainFacts) => SoundProcessor;
  /** States what the job did in the result line instead of the loudness (`resultMeta`). */
  describe?: string;
}

export async function runSoundJob(
  input: MediaInput,
  spec: SoundJobSpec,
  ctx: EngineContext,
): Promise<EngineResult> {
  const { file } = input;
  const info = input.info;
  if (!info) throw new EngineError("internal", "The file was not read first.");
  const target = soundTarget(info, file.name);
  if (target.kind === "none") throw new EngineError("unsupported-input", target.reason);
  const outputName = soundOutputName(file.name, spec.suffix, target);

  let before: LoudnessResult | undefined;
  if (spec.measureFirst) {
    ctx.onProgress({ phase: "analyzing", ratio: 0, detail: "Measuring the loudness" });
    before = (
      await analyzeSound(file, file.name, {
        signal: ctx.signal,
        onProgress: (r) =>
          ctx.onProgress({
            phase: "analyzing",
            ratio: r * 0.3,
            detail: `Measuring the loudness · ${Math.round(r * 100)}%`,
          }),
      })
    ).loudness;
  }
  const chainSpec = spec.chain(before);
  const renderSpan: [number, number] = spec.measureFirst
    ? [0.3, spec.output === "wav" ? 1 : 0.9]
    : [0, spec.output === "wav" ? 1 : 0.9];
  // Without a measuring pass, the source is measured on its way into the chain (same samples).
  let tap: LoudnessMeter | undefined;
  const rendered = await renderSound({
    file,
    target: spec.output === "wav" ? "wav" : target,
    chain: (facts) => {
      const chain = withProcessor(buildChain(chainSpec, facts), spec.processor?.(facts));
      if (before) return chain;
      const meter = new LoudnessMeter(facts.sampleRate, facts.channels);
      tap = meter;
      return {
        ...chain,
        process(planes, frames, t) {
          meter.push(planes, frames);
          return chain.process(planes, frames, t);
        },
      };
    },
    outputName,
    ctx,
    span: renderSpan,
    label: spec.label,
  });
  before ??= tap?.result();
  const filter = spec.filter(chainSpec, rendered.seconds);
  const ffmpegCommand = soundCommand(file.name, outputName, filter, target);

  if (spec.output === "wav") {
    const facts: SoundFacts = {
      before: before && { integrated: before.integrated, truePeak: before.truePeak },
      gainDb: chainSpec.gainDb,
      limitedDb: rendered.limitedDb,
      seconds: rendered.seconds,
      otherTracks: rendered.otherTracks,
      sampleRate: rendered.sampleRate,
      channels: rendered.channels,
      filter,
      suffix: spec.suffix,
      describe: spec.describe,
    };
    return {
      blob: rendered.blob,
      filename: outputName.replace(/\.[^.]+$/, ".wav"),
      ffmpegCommand,
      meta: JSON.stringify(facts),
    };
  }

  ctx.onProgress({ phase: "finishing", ratio: 0.9, detail: "Measuring the result" });
  const after = (
    await analyzeSound(rendered.blob, outputName, {
      signal: ctx.signal,
      onProgress: (r) =>
        ctx.onProgress({
          phase: "finishing",
          ratio: 0.9 + r * 0.1,
          detail: "Measuring the result",
        }),
    })
  ).loudness;
  return {
    blob: rendered.blob,
    filename: outputName,
    ffmpegCommand,
    meta: resultMeta({
      before,
      after,
      limitedDb: rendered.limitedDb,
      codec: codecFact(rendered.codec, rendered.bitrateKbps),
      layout: `${withUnit(rendered.sampleRate / 1000, "kHz")} ${channelsName(rendered.channels)}`,
      picture: target.kind === "video",
      otherTracks: rendered.otherTracks,
      describe: spec.describe,
    }),
  };
}

/** `first` feeding `chain`, as one chain; `chain` alone when there is no `first`. */
function withProcessor(chain: Chain, first: SoundProcessor | undefined): Chain {
  if (!first) return chain;
  let at = 0;
  return {
    process(planes, frames) {
      const out = first.process(planes, frames, at);
      const n = out[0]?.length ?? 0;
      const shaped = chain.process(out, n, at);
      at += n;
      return shaped;
    },
    flush() {
      const rest = first.flush();
      const n = rest[0]?.length ?? 0;
      const shaped = n > 0 ? chain.process(rest, n, at) : rest;
      at += n;
      const tail = chain.flush();
      if ((tail[0]?.length ?? 0) === 0) return shaped;
      return shaped.map((p, c) => {
        const t = tail[c] ?? new Float32Array(0);
        const joined = new Float32Array(p.length + t.length);
        joined.set(p);
        joined.set(t, p.length);
        return joined;
      });
    },
    limitedDb: () => chain.limitedDb(),
  };
}

/**
 * `supports()` for the sound engines: the file has a sound this tool can write back, and this
 * browser has an encoder for it (PCM always; AAC, Opus or FLAC probed). A `wav` pass always can.
 */
export async function canRunSound(input: MediaInput, output: "auto" | "wav"): Promise<boolean> {
  if (!input.info) return false;
  const t = soundTarget(input.info, input.file.name);
  if (t.kind === "none") return false;
  if (output === "wav") return true;
  const codecs = t.kind === "video" ? t.codecs : t.native ? [t.native] : [];
  for (const c of codecs)
    if (
      c.startsWith("pcm") ||
      (await canEncodeAudio(c, { numberOfChannels: 2, sampleRate: 48_000 }))
    )
      return true;
  return false;
}
