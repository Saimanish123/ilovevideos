"use client";

import { useEffect, useState } from "react";
import type { SoundAnalysis } from "@/tools/engines/sound/analyze";

export interface SoundAnalysisState {
  status: "measuring" | "done" | "failed";
  /** Share decoded so far while measuring. */
  ratio: number;
  result?: SoundAnalysis;
  /** Why it failed, one sentence. */
  message?: string;
}

interface Entry {
  state: SoundAnalysisState;
  listeners: Set<(s: SoundAnalysisState) => void>;
  controller: AbortController;
}

/**
 * One measurement per file and kind, shared by every component that asks (a panel and its timeline
 * read the same numbers from one decode). Stopped when the last listener goes away.
 */
const entries = new WeakMap<File, Map<string, Entry>>();

function subscribe(
  file: File,
  levels: boolean,
  listener: (s: SoundAnalysisState) => void,
  speech = false,
): () => void {
  const key = `${levels ? "levels" : "loudness"}${speech ? "+speech" : ""}`;
  let byKind = entries.get(file);
  if (!byKind) {
    byKind = new Map();
    entries.set(file, byKind);
  }
  let entry = byKind.get(key);
  if (!entry || entry.state.status === "failed") {
    const created: Entry = {
      state: { status: "measuring", ratio: 0 },
      listeners: new Set(),
      controller: new AbortController(),
    };
    entry = created;
    byKind.set(key, created);
    const set = (s: SoundAnalysisState) => {
      created.state = s;
      for (const l of created.listeners) l(s);
    };
    void import("@/tools/workers/sound-analysis-client")
      .then(({ analyzeInWorker }) =>
        analyzeInWorker(file, file.name, {
          levels,
          speech,
          signal: created.controller.signal,
          onProgress: (ratio) => set({ status: "measuring", ratio }),
        }),
      )
      .then((result) => set({ status: "done", ratio: 1, result }))
      .catch((e: { code?: string; message?: string }) => {
        if (e?.code === "cancelled") return;
        set({ status: "failed", ratio: 0, message: e?.message ?? "It could not be measured." });
      });
  }
  const current = entry;
  current.listeners.add(listener);
  listener(current.state);
  return () => {
    current.listeners.delete(listener);
    if (current.listeners.size === 0 && current.state.status === "measuring") {
      current.controller.abort();
      byKind?.delete(key);
    }
  };
}

/**
 * Measures a file's sound in the analysis worker: loudness and true peak, plus the level every 10 ms
 * when `levels` is set, and the speech probability every 32 ms when `speech` is set. Measured once per file; stops when the file changes or nobody listens.
 */
export function useSoundAnalysis(
  file: File | undefined,
  opts: { levels?: boolean; speech?: boolean } = {},
): SoundAnalysisState {
  const [state, setState] = useState<SoundAnalysisState>({ status: "measuring", ratio: 0 });
  const levels = opts.levels === true;
  const speech = opts.speech === true;
  useEffect(() => {
    if (!file) return;
    return subscribe(file, levels, setState, speech);
  }, [file, levels, speech]);
  return state;
}
