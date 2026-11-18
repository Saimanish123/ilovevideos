/**
 * Sound preview worker: decodes a few seconds of a file's sound from a given time and runs them
 * through the same DSP the engine uses (today the pitch shifter, `engines/sound/dsp/pitch`), so what
 * a panel lets you hear before a job is what the job will write. One request per worker; the page
 * terminates it when a newer request replaces it. No network access (README.md#privacy-and-processing §2).
 */
import { classifyError } from "@/tools/engines/errors";
import { openInput } from "@/tools/engines/mediabunny/shared";
import { downmix } from "@/tools/engines/sound/dsp/downmix";
import { PitchShifter } from "@/tools/engines/sound/dsp/pitch";
import { openSound, readSound } from "@/tools/engines/sound/reader";
import { announceReady } from "./ready";

export type ToPreview = {
  type: "pitch";
  file: File;
  /** Page time to start from, seconds. */
  from: number;
  seconds: number;
  semitones: number;
  cents: number;
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
  if (msg.type !== "pitch") return;
  const input = openInput(msg.file);
  try {
    const src = await openSound(input, msg.file);
    if (!src) throw new Error("This file has no sound track.");
    const channels = Math.min(2, src.channels);
    const shifter = new PitchShifter({
      sampleRate: src.sampleRate,
      channels,
      semitones: msg.semitones,
      cents: msg.cents,
    });
    const start = Math.min(src.end, src.origin + Math.max(0, msg.from));
    const end = Math.min(src.end, start + msg.seconds);
    const parts: Float32Array[][] = [];
    for await (const block of readSound(src, start, end)) {
      const planes = downmix(block.planes, channels);
      parts.push(shifter.process(planes, block.frames));
    }
    parts.push(shifter.flush());
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
