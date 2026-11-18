"use client";

import { useEffect, useState } from "react";
import { readWaveform } from "@/tools/workers/waveform-client";

export interface WaveformState {
  /** Peak per bucket, 0–1; fills in while `status` is "reading". */
  peaks?: Float32Array;
  /** Share of the file read so far. */
  ratio: number;
  status: "reading" | "done" | "no-audio" | "unreadable";
}

/** The file's waveform, read in a worker once per file; stops reading when the file changes. */
export function useWaveform(file: File | undefined, buckets = 160): WaveformState {
  const [state, setState] = useState<WaveformState>({ ratio: 0, status: "reading" });
  useEffect(() => {
    if (!file) return;
    const controller = new AbortController();
    setState({ ratio: 0, status: "reading" });
    void readWaveform(
      file,
      buckets,
      (u) => {
        if (!controller.signal.aborted)
          setState({ peaks: u.peaks, ratio: u.ratio, status: u.done ? "done" : "reading" });
      },
      controller.signal,
    ).then((r) => {
      if (r !== "done" && !controller.signal.aborted) setState({ ratio: 0, status: r });
    });
    return () => controller.abort();
  }, [file, buckets]);
  return state;
}
