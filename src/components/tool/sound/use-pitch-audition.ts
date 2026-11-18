"use client";

import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { startWorker } from "@/tools/workers/ready";
import type { FromPreview, ToPreview } from "@/tools/workers/sound-preview.worker";

/** Seconds of sound an audition plays from the playhead. */
export const AUDITION_SEC = 8;

export type AuditionState = "idle" | "rendering" | "playing" | "unavailable";

/**
 * Plays a few seconds from the playhead with the pitch shifted by the engine's own DSP (rendered in
 * the preview worker), so the shift can be heard before the whole file is processed. The page's
 * player follows along, muted, so its position moves with what is heard. A new request or a change
 * of shift while playing renders again from where it is; Stop, a page change or unmounting ends it.
 */
export function usePitchAudition(
  file: File,
  media: RefObject<HTMLMediaElement | null>,
  shift: { semitones: number; cents: number },
) {
  const [state, setState] = useState<AuditionState>("idle");
  const [error, setError] = useState<string>();
  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const workerRef = useRef<{ terminate(): void } | null>(null);
  const restore = useRef<{ muted: boolean } | null>(null);
  const shiftRef = useRef(shift);
  shiftRef.current = shift;

  const stopSound = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    const s = sourceRef.current;
    sourceRef.current = null;
    if (s) {
      s.onended = null;
      try {
        s.stop();
      } catch {
        // Already stopped.
      }
    }
    const el = media.current;
    if (el && restore.current) {
      el.pause();
      el.muted = restore.current.muted;
      restore.current = null;
    }
  }, [media]);

  const stop = useCallback(() => {
    stopSound();
    setState((s) => (s === "unavailable" ? s : "idle"));
  }, [stopSound]);

  const start = useCallback(
    (from?: number) => {
      const el = media.current;
      const at = from ?? el?.currentTime ?? 0;
      stopSound();
      const Ctx =
        typeof window === "undefined"
          ? undefined
          : (window.AudioContext ??
            (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
      if (!Ctx) {
        setState("unavailable");
        return;
      }
      // Created inside the click, so the browser lets it play.
      const ctx = ctxRef.current ?? new Ctx();
      ctxRef.current = ctx;
      void ctx.resume().catch(() => undefined);
      setState("rendering");
      setError(undefined);
      // One render at a time: the handle of this one, compared on arrival so a stale one is ignored.
      const job: { terminate(): void } = { terminate: () => started.terminate() };
      workerRef.current = job;
      const onMessage = (event: MessageEvent<FromPreview>) => {
        job.terminate();
        if (workerRef.current !== job) return;
        workerRef.current = null;
        const msg = event.data;
        if (msg.type === "error") {
          setError(msg.message);
          setState("idle");
          return;
        }
        const frames = msg.planes[0]?.length ?? 0;
        if (frames === 0) {
          setState("idle");
          return;
        }
        const buffer = ctx.createBuffer(msg.planes.length, frames, msg.sampleRate);
        msg.planes.forEach((p, c) => {
          buffer.copyToChannel(p as Float32Array<ArrayBuffer>, c);
        });
        const node = ctx.createBufferSource();
        node.buffer = buffer;
        node.connect(ctx.destination);
        node.onended = () => {
          if (sourceRef.current !== node) return;
          stop();
        };
        sourceRef.current = node;
        const player = media.current;
        if (player) {
          restore.current = { muted: player.muted };
          player.muted = true;
          player.currentTime = msg.from;
          void player.play().catch(() => undefined);
        }
        node.start();
        setState("playing");
      };
      // Started once ready, replaced if it never says so (workers/ready).
      const started = startWorker(
        () =>
          new Worker(new URL("@/tools/workers/sound-preview.worker.ts", import.meta.url), {
            type: "module",
          }),
        {
          type: "pitch",
          file,
          from: at,
          seconds: AUDITION_SEC,
          semitones: shiftRef.current.semitones,
          cents: shiftRef.current.cents,
        } satisfies ToPreview,
        onMessage,
        () => {
          job.terminate();
          if (workerRef.current === job) workerRef.current = null;
          setState("idle");
        },
      );
    },
    [file, media, stop, stopSound],
  );

  // A new shift while listening: render again from where the player is.
  const playing = state === "playing" || state === "rendering";
  const key = `${shift.semitones}:${shift.cents}`;
  const lastKey = useRef(key);
  useEffect(() => {
    if (lastKey.current === key) return;
    lastKey.current = key;
    if (playing) start(media.current?.currentTime);
  }, [key, playing, start, media]);

  // The player's own controls take over: stop the audition when the user plays or seeks it.
  // The player may mount after this hook: look for it each frame until it is there (as wave-strip).
  useEffect(() => {
    let el: HTMLMediaElement | null = null;
    let raf = 0;
    let tries = 0;
    const onPause = () => {
      if (sourceRef.current && restore.current) stop();
    };
    const attach = () => {
      el = media.current;
      if (el) el.addEventListener("pause", onPause);
      else if (tries++ < 600) raf = requestAnimationFrame(attach);
    };
    attach();
    return () => {
      cancelAnimationFrame(raf);
      el?.removeEventListener("pause", onPause);
    };
  }, [media, stop]);

  useEffect(
    () => () => {
      stopSound();
      void ctxRef.current?.close().catch(() => undefined);
      ctxRef.current = null;
    },
    [stopSound],
  );

  return { state, error, start, stop };
}
