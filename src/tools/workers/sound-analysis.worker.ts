/**
 * Sound analysis worker: measures a file's loudness (EBU R128 integrated, sample and true peak) and,
 * when asked, its level every 10 ms, with the same code the sound engines use
 * (`engines/sound/analyze.ts`), so what a panel shows before a job is what the job will find. Runs in
 * its own worker so the engine worker stays free. No network access (README.md#privacy-and-processing §2).
 */
import { classifyError } from "@/tools/engines/errors";
import { analyzeSound, type SoundAnalysis } from "@/tools/engines/sound/analyze";
import { readSafetensors, SileroVad } from "@/tools/engines/sound/dsp/silero-vad";
import { announceReady } from "./ready";
import { loadSpeechModel } from "./speech-models";

export type ToAnalysis = {
  type: "analyze";
  id: number;
  file: Blob;
  name: string;
  levels: boolean;
  truePeak: boolean;
  /** Also read where there is speech (Silero VAD; the model is our own file under /models). */
  speech?: boolean;
};
export type FromAnalysis =
  | { type: "progress"; id: number; ratio: number }
  | { type: "done"; id: number; result: SoundAnalysis }
  | { type: "error"; id: number; code: string; message: string; hint?: string };

const post = (msg: FromAnalysis, transfer?: Transferable[]) =>
  (self as unknown as { postMessage: (m: FromAnalysis, t?: Transferable[]) => void }).postMessage(
    msg,
    transfer,
  );

self.onmessage = async (event: MessageEvent<ToAnalysis>) => {
  const msg = event.data;
  if (msg.type !== "analyze") return;
  let last = 0;
  try {
    // Without the model (offline on a first visit), the analysis still runs; `speech` stays empty
    // and the tools find pauses by level.
    const vad = msg.speech
      ? await loadSpeechModel("vad", () => {
          // The download counts as progress, so a page's stall watchdog does not give up on it.
          const now = performance.now();
          if (now - last < 100) return;
          last = now;
          post({ type: "progress", id: msg.id, ratio: 0 });
        })
          .then((b) => new SileroVad(readSafetensors(new Uint8Array(b))))
          .catch(() => undefined)
      : undefined;
    const result = await analyzeSound(msg.file, msg.name, {
      levels: msg.levels,
      truePeak: msg.truePeak,
      speech: vad,
      onProgress: (ratio) => {
        const now = performance.now();
        if (now - last < 100) return;
        last = now;
        post({ type: "progress", id: msg.id, ratio });
      },
    });
    post(
      { type: "done", id: msg.id, result },
      [result.levels.buffer, result.speech?.buffer].filter((b): b is ArrayBuffer => !!b),
    );
  } catch (e) {
    const err = classifyError(e);
    post({ type: "error", id: msg.id, code: err.code, message: err.message, hint: err.hint });
  }
};

announceReady();
