/**
 * Sound preview worker: decodes a few seconds of a file's sound from a given time and runs them
 * through the same DSP the engine uses (the pitch shifter, `engines/sound/dsp/pitch`; noise removal,
 * `engines/sound/dsp/rnnoise`), so what a panel lets you hear before a job is what the job will
 * write. One request per worker; the page terminates it when a newer request replaces it. No access
 * to the network with user data; the noise model is our own file under /models (./speech-models).
 */
import { classifyError } from "@/tools/engines/errors";
import { openInput } from "@/tools/engines/mediabunny/shared";
import { downmix } from "@/tools/engines/sound/dsp/downmix";
import { Limiter } from "@/tools/engines/sound/dsp/limiter";
import { fromDb, LoudnessMeter } from "@/tools/engines/sound/dsp/loudness";
import { PitchShifter } from "@/tools/engines/sound/dsp/pitch";
import { DenoiseProcessor, instantiateRnnoise } from "@/tools/engines/sound/dsp/rnnoise";
import type { SoundProcessor } from "@/tools/engines/sound/processor";
import { openSound, readSound } from "@/tools/engines/sound/reader";
import { DENOISE_CEILING_DB, makeupGain } from "@/tools/engines/speech-denoise/options";
import { announceReady } from "./ready";
import { loadSpeechModel } from "./speech-models";

export type ToPreview =
  | {
      type: "pitch";
      file: File;
      /** Page time to start from, seconds. */
      from: number;
      seconds: number;
      semitones: number;
      cents: number;
    }
  | {
      type: "denoise";
      file: File;
      from: number;
      seconds: number;
      /** Percent, as the engine's option. */
      strength: number;
      keepLoudness: boolean;
    };
export type FromPreview =
  | { type: "done"; planes: Float32Array[]; sampleRate: number; from: number }
  | { type: "error"; code: string; message: string; hint?: string };

const post = (msg: FromPreview, transfer?: Transferable[]) =>
  (self as unknown as { postMessage: (m: FromPreview, t?: Transferable[]) => void }).postMessage(
    msg,
    transfer,
  );

self.onmessage = async (event: MessageEvent<ToPreview>) => {
  const msg = event.data;
  if (msg.type !== "pitch" && msg.type !== "denoise") return;
  const input = openInput(msg.file);
  try {
    const src = await openSound(input, msg.file);
    if (!src) throw new Error("This file has no sound track.");
    const channels = Math.min(2, src.channels);
    let processor: SoundProcessor;
    if (msg.type === "pitch")
      processor = new PitchShifter({
        sampleRate: src.sampleRate,
        channels,
        semitones: msg.semitones,
        cents: msg.cents,
      });
    else {
      const rn = await instantiateRnnoise(await loadSpeechModel("rnnoise"));
      processor = new DenoiseProcessor(rn, {
        sampleRate: src.sampleRate,
        channels,
        strength: msg.strength / 100,
      });
    }
    const start = Math.min(src.end, src.origin + Math.max(0, msg.from));
    const end = Math.min(src.end, start + msg.seconds);
    const parts: Float32Array[][] = [];
    // Noise removal with "keep the loudness": the same gain rule as the engine, measured on these
    // seconds (before and after), and the same limiter.
    const before =
      msg.type === "denoise" ? new LoudnessMeter(src.sampleRate, channels, false) : null;
    for await (const block of readSound(src, start, end)) {
      const planes = downmix(block.planes, channels);
      before?.push(planes, block.frames);
      parts.push(processor.process(planes, block.frames, 0));
    }
    parts.push(processor.flush());
    if (msg.type === "denoise" && msg.keepLoudness && before) {
      const after = new LoudnessMeter(src.sampleRate, channels, false);
      for (const p of parts) after.push(p, p[0]?.length ?? 0);
      const gain = makeupGain(true, before.result(), after.result());
      if (gain > 0) {
        const g = fromDb(gain);
        const limiter = new Limiter(channels, src.sampleRate, fromDb(DENOISE_CEILING_DB));
        const limited: Float32Array[][] = [];
        for (const p of parts) {
          const n = p[0]?.length ?? 0;
          if (n === 0) continue;
          limited.push(
            limiter.process(
              p.map((q) => q.map((v) => v * g)),
              n,
            ),
          );
        }
        limited.push(limiter.flush());
        parts.splice(0, parts.length, ...limited);
      }
    }
    const total = parts.reduce((n, p) => n + (p[0]?.length ?? 0), 0);
    const planes = Array.from({ length: channels }, (_, c) => {
      const out = new Float32Array(total);
      let at = 0;
      for (const p of parts) {
        const q = p[c] ?? new Float32Array(0);
        out.set(q, at);
        at += q.length;
      }
      return out;
    });
    post(
      { type: "done", planes, sampleRate: src.sampleRate, from: start - src.origin },
      planes.map((p) => p.buffer),
    );
  } catch (e) {
    const err = classifyError(e);
    post({ type: "error", code: err.code, message: err.message, hint: err.hint });
  } finally {
    input.dispose();
  }
};

announceReady();
