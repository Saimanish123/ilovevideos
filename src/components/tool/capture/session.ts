"use client";

import type { Dispatch, RefObject, SetStateAction } from "react";
import type { Recorder, RecorderSetup } from "@/tools/engines/capture/recorder";
import type { Captured } from "../options/types";
import type { RecordingPhase, RecordingStats } from "./use-recording";

/**
 * Starting and stopping a recording for ./use-recording: loaded with the encoder (on pointer-over
 * or focus of Start recording, or the press itself), never with the page (ADR-0104).
 */
export interface SessionContext {
  recorder: RefObject<Recorder | null>;
  timer: RefObject<ReturnType<typeof setInterval> | null>;
  stopping: RefObject<boolean>;
  busy: RefObject<boolean>;
  captured: RefObject<(c: Captured) => void>;
  setPhase: Dispatch<SetStateAction<RecordingPhase>>;
  setStats: Dispatch<SetStateAction<RecordingStats>>;
  setError: Dispatch<SetStateAction<{ message: string; hint?: string } | undefined>>;
  setNote: Dispatch<SetStateAction<string | undefined>>;
  setDescribe: Dispatch<SetStateAction<string | undefined>>;
  /** Removes the leave-page warning set while a recording runs. */
  unguard?: () => void;
}

/** Closing or reloading the tab mid-recording loses it: the browser asks first. */
function guard(c: SessionContext) {
  const ask = (e: BeforeUnloadEvent) => e.preventDefault();
  window.addEventListener("beforeunload", ask);
  c.unguard = () => {
    window.removeEventListener("beforeunload", ask);
    c.unguard = undefined;
  };
}

const clearTimer = (c: SessionContext) => {
  if (c.timer.current) clearInterval(c.timer.current);
  c.timer.current = null;
};

/** The recording is over (finished, failed or thrown away): no timer, no leave-page warning. */
const end = (c: SessionContext) => {
  clearTimer(c);
  c.unguard?.();
};

export async function stop(c: SessionContext, reason?: string) {
  const r = c.recorder.current;
  if (!r || c.stopping.current) return;
  c.stopping.current = true;
  clearTimer(c);
  c.setPhase("finishing");
  try {
    const rec = await r.stop();
    c.recorder.current = null;
    c.busy.current = false;
    c.captured.current({
      file: rec.file,
      info: rec.info,
      meta: [rec.meta, reason].filter(Boolean).join(" · ") || undefined,
      ffmpegCommand: rec.ffmpegCommand,
    });
  } catch (e) {
    c.recorder.current = null;
    c.busy.current = false;
    c.setError({ message: (e as Error).message, hint: (e as { hint?: string }).hint });
    c.setPhase("idle");
  } finally {
    c.stopping.current = false;
    c.unguard?.();
  }
}

export async function start(
  c: SessionContext,
  setup: RecorderSetup,
  ended?: MediaStreamTrack,
): Promise<boolean> {
  c.setNote(undefined);
  c.setStats({ seconds: 0, bytes: 0 });
  try {
    const { startRecorder } = await import("@/tools/engines/capture/recorder");
    const r = await startRecorder(setup);
    c.recorder.current = r;
    c.setNote(r.note);
    c.setDescribe(r.describe);
    c.setPhase("recording");
    guard(c);
    c.timer.current = setInterval(() => {
      const s = r.stats();
      c.setStats({ seconds: s.seconds, bytes: s.bytes });
      // A WAV's 4 GiB, or what memory holds where there is no disk storage: stop, keep it all.
      if (s.bytes >= r.limit)
        void stop(c, r.onDisk ? "stopped at the WAV size limit" : "stopped at the memory limit");
    }, 250);
    r.failed.catch((e: Error) => {
      if (c.recorder.current !== r) return;
      end(c);
      c.recorder.current = null;
      c.busy.current = false;
      void r.cancel();
      c.setError({ message: e.message, hint: "Try again." });
      c.setPhase("idle");
    });
    ended?.addEventListener("ended", () => void stop(c), { once: true });
    return true;
  } catch (e) {
    c.busy.current = false;
    c.setError({ message: (e as Error).message, hint: (e as { hint?: string }).hint });
    c.setPhase("idle");
    return false;
  }
}

/** Throws the recording away (after the page's confirm) and frees the file. */
export async function discard(c: SessionContext) {
  const r = c.recorder.current;
  c.recorder.current = null;
  c.busy.current = false;
  end(c);
  c.setPhase("idle");
  await r?.cancel();
}
