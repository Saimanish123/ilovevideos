"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Recorder, RecorderSetup } from "@/tools/engines/capture/recorder";
import type { Captured } from "../options/types";
import type { SessionContext } from "./session";

/**
 * Loads the encoder ahead of the press (pointer over or focus on Start recording), so the recording
 * begins as soon as the devices answer rather than after a download. Never on page load.
 */
export const preloadRecorder = () => {
  void import("@/tools/engines/capture/recorder").catch(() => undefined);
  void import("./session").catch(() => undefined);
  void import("./devices").catch(() => undefined);
  void import("./lazy-live").then((m) => m.preloadLive()).catch(() => undefined);
  void import("./wave").catch(() => undefined);
};

export type RecordingPhase = "idle" | "starting" | "recording" | "paused" | "finishing";

export interface RecordingStats {
  seconds: number;
  bytes: number;
}

/**
 * One recording's life on a recorder page: loads the encoder when recording starts (never before),
 * shows real time and size while it runs, pauses and resumes, finishes when Stop is pressed or the
 * shared screen ends from the browser's own bar, and hands the file to the stage. Leaving the page
 * mid-recording asks first; unmounting cancels and frees everything.
 */
export function useRecording(onCaptured: (c: Captured) => void) {
  const [phase, setPhase] = useState<RecordingPhase>("idle");
  const [stats, setStats] = useState<RecordingStats>({ seconds: 0, bytes: 0 });
  const [error, setError] = useState<{ message: string; hint?: string }>();
  const [note, setNote] = useState<string>();
  const [describe, setDescribe] = useState<string>();
  const recorder = useRef<Recorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopping = useRef(false);
  const busy = useRef(false);
  const captured = useRef(onCaptured);
  captured.current = onCaptured;

  const clearTimer = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  // What ./session needs to run a recording; the same object for the hook's life.
  const ctx = useRef<SessionContext | null>(null);
  ctx.current ??= {
    recorder,
    timer,
    stopping,
    busy,
    captured,
    setPhase,
    setStats,
    setError,
    setNote,
    setDescribe,
  };

  /** Ends the recording and hands the file to the stage (the code loads with the encoder). */
  const stop = useCallback(async (reason?: string) => {
    const c = ctx.current;
    if (c) await (await import("./session")).stop(c, reason);
  }, []);

  /**
   * Starts recording these tracks. `ended`: the track whose end (Stop sharing in the browser's bar,
   * a camera unplugged) finishes the recording.
   */
  const start = useCallback(async (setup: RecorderSetup, ended?: MediaStreamTrack) => {
    const c = ctx.current;
    // A second press while one recording starts or runs does nothing (never two recorders).
    if (!c || busy.current) return false;
    busy.current = true;
    setError(undefined);
    setPhase("starting");
    return (await import("./session")).start(c, setup, ended);
  }, []);

  /**
   * Shows a device refusal (or any failure) in two sentences, loaded when needed. `orElse` is a
   * second way out joined to the second sentence ("turn the camera bubble off").
   */
  const fail = useCallback((e: unknown, orElse?: string) => {
    void import("./access-messages").then(
      (m) => setError({ message: m.messageFor(e, orElse) }),
      () => setError({ message: String((e as Error)?.message ?? e) }),
    );
  }, []);

  const pause = useCallback(() => {
    recorder.current?.pause();
    setPhase((p) => (p === "recording" ? "paused" : p));
  }, []);
  const resume = useCallback(() => {
    recorder.current?.resume();
    setPhase((p) => (p === "paused" ? "recording" : p));
  }, []);
  const discard = useCallback(async () => {
    const c = ctx.current;
    if (c) await (await import("./session")).discard(c);
  }, []);

  const live = phase === "recording" || phase === "paused" || phase === "finishing";
  useEffect(
    () => () => {
      clearTimer();
      ctx.current?.unguard?.();
      const r = recorder.current;
      recorder.current = null;
      if (r && !stopping.current) void r.cancel();
    },
    [],
  );

  return {
    phase,
    stats,
    error,
    setError,
    fail,
    note,
    describe,
    start,
    pause,
    resume,
    stop,
    discard,
    live,
  };
}
