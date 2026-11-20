"use client";

import { useEffect, useRef, useState } from "react";
import { type Candidate, pauseCandidates, sceneCandidates } from "@/tools/engines/clips/plan";
import type { SceneAnalysis } from "@/tools/engines/clips/scenes";
import { speechUsable } from "@/tools/engines/remove-silence/options";
import { findPauses, suggestThreshold } from "@/tools/engines/sound/dsp/silence";
import { speechPauses } from "@/tools/engines/sound/dsp/speech";
import type { MediaInfo } from "@/tools/engines/types";

export interface CandidateState {
  status: "measuring" | "done";
  /** Share of the work done while measuring (sound, then pictures). */
  ratio: number;
  candidates: Candidate[];
  pauses: number;
  scenes: number;
  /** There is no sound to find pauses in. */
  noSound?: boolean;
  /** The sound could not be measured in this browser. */
  soundFailed?: boolean;
}

/** Seconds without any progress from the sound analysis before it is tried again. */
const STALL_MS = 6000;

/** Pauses this long or longer are cut points; shorter ones fall between words. */
const MIN_PAUSE = 0.35;

interface Entry {
  state: CandidateState;
  listeners: Set<(s: CandidateState) => void>;
  controller: AbortController;
}
const entries = new WeakMap<File, Entry>();

const measuring = (ratio: number): CandidateState => ({
  status: "measuring",
  ratio,
  candidates: [],
  pauses: 0,
  scenes: 0,
});

/**
 * The measurement for one file: the sound's level every 10 ms in the sound analysis worker (the
 * remove-silence analysis), then the scene changes from the key frames, on the page
 * (`@/tools/engines/clips/scenes`). One after the other, so the two do not compete for the decoder. A part that
 * fails leaves its candidates out; the length cap still places the clips.
 */
async function measure(
  file: File,
  info: MediaInfo,
  signal: AbortSignal,
  set: (s: CandidateState) => void,
) {
  const hasSound = !!info.audio?.length;
  let pauses: ReturnType<typeof findPauses> = [];
  const noSound = !hasSound;
  let soundFailed = false;
  if (hasSound) {
    const { analyzeInWorker } = await import("@/tools/workers/sound-analysis-client");
    for (let attempt = 0; attempt < 2 && !signal.aborted; attempt++) {
      // A decoder that never answers in the analysis worker (seen intermittently in headless
      // Chromium on macOS) is stopped after STALL_MS without progress, and the same measurement
      // (`@/tools/engines/sound/analyze`) runs once more here on the page.
      const attemptSignal = new AbortController();
      const onAbort = () => attemptSignal.abort();
      signal.addEventListener("abort", onAbort, { once: true });
      let last = performance.now();
      const watchdog = setInterval(() => {
        if (performance.now() - last > STALL_MS) attemptSignal.abort();
      }, 1000);
      try {
        // The speech model is read in the worker; on the page fallback it is loaded here, and
        // without it (offline on a first visit) pauses come from the level.
        const vad =
          attempt === 0
            ? undefined
            : await import("@/tools/workers/speech-models")
                .then(({ loadSpeechModel }) => loadSpeechModel("vad"))
                .then(async (b) => {
                  const { readSafetensors, SileroVad } = await import(
                    "@/tools/engines/sound/dsp/silero-vad"
                  );
                  return new SileroVad(readSafetensors(new Uint8Array(b)));
                })
                .catch(() => undefined);
        const opts = {
          levels: true,
          truePeak: false,
          signal: attemptSignal.signal,
          onProgress: (r: number) => {
            last = performance.now();
            set(measuring(r / 2));
          },
        };
        const sound =
          attempt === 0
            ? await analyzeInWorker(file, file.name, { ...opts, speech: true })
            : await (await import("@/tools/engines/sound/analyze")).analyzeSound(file, file.name, {
                ...opts,
                speech: vad,
              });
        const levels = sound.levels;
        const speech = sound.speech;
        soundFailed = false;
        // Speech when the file has enough of it (the gaps between words, through noise and music);
        // otherwise the quiet moments.
        if (speech && speechUsable(speech)) {
          pauses = speechPauses(speech, { minSilence: MIN_PAUSE }, sound.duration);
        } else if (levels.length > 0)
          pauses = findPauses(levels, {
            thresholdDb: suggestThreshold(levels),
            minSilence: MIN_PAUSE,
            padding: 0,
          });
        break;
      } catch {
        if (signal.aborted) return;
        soundFailed = true;
      } finally {
        clearInterval(watchdog);
        signal.removeEventListener("abort", onAbort);
      }
    }
  }
  if (signal.aborted) return;
  set(measuring(0.5));
  let scenes: SceneAnalysis = { cuts: [], keyframes: 0, gop: 0 };
  try {
    // On the page: key frames only, a few hundred small decodes at most (../engines/clips/scenes).
    const { findSceneCuts } = await import("@/tools/engines/clips/scenes");
    scenes = await findSceneCuts(file, info.startSec ?? 0, signal, (r) =>
      set(measuring(0.5 + r / 2)),
    );
  } catch {
    if (signal.aborted) return;
  }
  set({
    status: "done",
    ratio: 1,
    candidates: [...pauseCandidates(pauses), ...sceneCandidates(scenes.cuts)],
    pauses: pauses.length,
    scenes: scenes.cuts.length,
    ...(noSound ? { noSound: true } : {}),
    ...(soundFailed ? { soundFailed: true } : {}),
  });
}

function subscribe(file: File, info: MediaInfo, listener: (s: CandidateState) => void) {
  let entry = entries.get(file);
  if (!entry) {
    const created: Entry = {
      state: measuring(0),
      listeners: new Set(),
      controller: new AbortController(),
    };
    entry = created;
    entries.set(file, created);
    void measure(file, info, created.controller.signal, (s) => {
      created.state = s;
      for (const l of created.listeners) l(s);
    });
  }
  const current = entry;
  current.listeners.add(listener);
  listener(current.state);
  return () => {
    current.listeners.delete(listener);
    if (current.listeners.size === 0 && current.state.status === "measuring") {
      current.controller.abort();
      entries.delete(file);
    }
  };
}

/**
 * Where a long video can be cut with the least jolt: the middle of every pause in its sound
 * (threshold from the recording's noise floor) and every scene change in its picture. Measured once
 * per file and shared by every component that asks; stopped when nobody listens.
 */
export function useClipCandidates(file: File, info: MediaInfo): CandidateState {
  const [state, setState] = useState<CandidateState>(measuring(0));
  // The file is the key: one measurement per file whatever else re-renders.
  const infoRef = useRef(info);
  infoRef.current = info;
  useEffect(() => subscribe(file, infoRef.current, setState), [file]);
  return state;
}
