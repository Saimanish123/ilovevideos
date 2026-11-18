"use client";

import { Pause, Play } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { formatDuration } from "@/lib/format";
import type { HeroProps } from "../options/types";
import { usePlayerKeys, useWorkspaceKeys } from "../shortcuts";
import { useWaveform } from "./use-waveform";
import { Waveform } from "./waveform";

/** Focus on the always-dark stage: the shared `stage-focus` ring (tokens.css), readable on any fill. */
export const STAGE_FOCUS = "outline-none focus-visible:stage-focus";

const extension = (name: string) => name.split(".").pop()?.toUpperCase() ?? "this format";

/**
 * The hero of audio pages (spec.Hero): the file's waveform with a play button, on the dark stage
 * where video pages show the picture. The waveform is the seek bar (click, drag, arrows ±5 s).
 * While processing, the bright share shows real progress instead of playback; when done it plays
 * the output. Says plainly when the browser cannot decode or play the format. The audio element is
 * the stage's preview element (`media`), so a page's timeline and Space drive this playback, and
 * `range` dims what a partial extraction leaves out.
 */
export function AudioHero({
  file,
  info,
  phase,
  progress,
  showing,
  media,
  range,
  layer,
}: HeroProps<unknown> & {
  /** The part that becomes the output, drawn bright; the rest is dimmed. */
  range?: { start: number; end: number };
  /**
   * Drawn over the waveform as a sibling of the seek bar (a slider's children are presentational,
   * so controls cannot sit inside it): e.g. a fade envelope with its own handles. Position it with
   * `absolute inset-0`; it receives the waveform's box.
   */
  layer?: (duration: number) => ReactNode;
}) {
  const result = showing === "result";
  const wave = useWaveform(file);
  const audioRef = useRef<HTMLAudioElement>(null);
  const brightRef = useRef<SVGGElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string>();
  const [playing, setPlaying] = useState(false);
  const [playable, setPlayable] = useState(true);
  const [time, setTime] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(0);
  const duration = info?.durationSec && info.durationSec > 0 ? info.durationSec : mediaDuration;
  const processing = phase === "processing";

  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    setPlayable(true);
    setTime(0);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  // Bright share: playback position on rAF while playing, else the last known position.
  const paint = useCallback((share: number) => {
    const g = brightRef.current;
    if (g) g.style.clipPath = `inset(0 ${(1 - Math.min(1, Math.max(0, share))) * 100}% 0 0)`;
  }, []);
  useEffect(() => {
    if (processing) {
      paint(progress?.ratio ?? 0);
      return;
    }
    const el = audioRef.current;
    if (!el) return;
    let raf = 0;
    const tick = () => {
      if (duration > 0) paint(el.currentTime / duration);
      if (!el.paused) raf = requestAnimationFrame(tick);
    };
    const onPlay = () => {
      setPlaying(true);
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };
    const onPause = () => {
      setPlaying(false);
      tick();
    };
    const onTime = () => setTime(el.currentTime);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onPause);
    el.addEventListener("seeked", tick);
    el.addEventListener("timeupdate", onTime);
    tick();
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onPause);
      el.removeEventListener("seeked", tick);
      el.removeEventListener("timeupdate", onTime);
    };
  }, [processing, progress?.ratio, duration, paint, url]);

  // Nothing plays while the file is being processed.
  useEffect(() => {
    if (processing) audioRef.current?.pause();
  }, [processing]);

  const seek = (t: number) => {
    const el = audioRef.current;
    if (!el || !(duration > 0)) return;
    el.currentTime = Math.min(duration, Math.max(0, t));
    setTime(el.currentTime);
    paint(el.currentTime / duration);
  };
  const seekAt = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    seek(((clientX - rect.left) / rect.width) * duration);
  };
  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => setPlayable(false));
    else el.pause();
  };

  const interactive = playable && !processing && phase !== "inspecting" && duration > 0;
  useWorkspaceKeys(audioRef, [{ key: " ", run: toggle }], interactive);
  usePlayerKeys(audioRef, { enabled: interactive });
  const attach = useCallback(
    (el: HTMLAudioElement | null) => {
      audioRef.current = el;
      if (media) media.current = el;
    },
    [media],
  );
  const pct = (t: number) => (duration > 0 ? Math.min(100, Math.max(0, (t / duration) * 100)) : 0);
  const ext = extension(file.name);
  const note =
    phase === "inspecting"
      ? "Reading the file"
      : processing
        ? undefined
        : wave.status === "unreadable"
          ? `This browser cannot decode ${ext} to draw it. Converting still works.`
          : wave.status === "no-audio"
            ? "This file has no audio track."
            : !playable
              ? `This browser cannot play ${ext}, so there is no preview before converting.`
              : wave.status === "reading"
                ? `Reading the waveform, ${Math.round(wave.ratio * 100)}%`
                : undefined;

  return (
    <div className="rounded-lg bg-bg-stage p-4 text-gray-50 md:p-6">
      {url && (
        // biome-ignore lint/a11y/useMediaCaption: the user's own audio file; there is no transcript to offer
        <audio
          ref={attach}
          src={url}
          preload="metadata"
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            if (Number.isFinite(d)) setMediaDuration(d);
          }}
          onError={() => setPlayable(false)}
          className="hidden"
        />
      )}
      <div className="relative">
        <div
          ref={trackRef}
          role="slider"
          tabIndex={interactive ? 0 : -1}
          aria-label={result ? "Result playback position" : "Playback position"}
          aria-disabled={!interactive || undefined}
          aria-valuemin={0}
          aria-valuemax={Math.round(duration * 10) / 10}
          aria-valuenow={
            Math.round((processing ? (progress?.ratio ?? 0) * duration : time) * 10) / 10
          }
          aria-valuetext={
            processing
              ? `${Math.round((progress?.ratio ?? 0) * 100)}% processed`
              : `${formatDuration(time)} of ${formatDuration(duration)}`
          }
          className={`relative h-28 touch-none rounded-sm outline-none md:h-40 ${interactive ? "cursor-pointer" : ""} ${STAGE_FOCUS}`}
          onPointerDown={(e) => {
            if (!interactive) return;
            e.preventDefault();
            const target = e.currentTarget;
            target.setPointerCapture(e.pointerId);
            seekAt(e.clientX);
            const move = (ev: PointerEvent) => seekAt(ev.clientX);
            const up = () => {
              target.removeEventListener("pointermove", move);
              target.removeEventListener("pointerup", up);
              target.removeEventListener("pointercancel", up);
            };
            target.addEventListener("pointermove", move);
            target.addEventListener("pointerup", up);
            target.addEventListener("pointercancel", up);
          }}
          onKeyDown={(e) => {
            if (!interactive) return;
            const step = e.shiftKey ? 15 : 5;
            let next: number | undefined;
            if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = time - step;
            else if (e.key === "ArrowRight" || e.key === "ArrowUp") next = time + step;
            else if (e.key === "Home") next = 0;
            else if (e.key === "End") next = duration;
            else if (e.key === " " || e.key === "k") {
              e.preventDefault();
              toggle();
              return;
            }
            if (next === undefined) return;
            e.preventDefault();
            seek(next);
          }}
        >
          <Waveform
            peaks={wave.peaks}
            brightRef={brightRef}
            bright={processing ? (progress?.ratio ?? 0) : 0}
          />
          {range && !result && duration > 0 && (
            <>
              <div
                className="pointer-events-none absolute inset-y-0 left-0 bg-overlay"
                style={{ width: `${pct(range.start)}%` }}
                aria-hidden
              />
              <div
                className="pointer-events-none absolute inset-y-0 right-0 bg-overlay"
                style={{ width: `${100 - pct(range.end)}%` }}
                aria-hidden
              />
            </>
          )}
        </div>
        {layer && duration > 0 && layer(duration)}
      </div>
      <div className="mt-3 flex min-h-11 items-center gap-3">
        {playable && phase !== "inspecting" && (
          <button
            type="button"
            onClick={toggle}
            disabled={!interactive}
            aria-label={playing ? "Pause" : result ? "Play the result" : "Play"}
            className={`flex size-11 shrink-0 items-center justify-center rounded-full bg-gray-50 text-gray-950 transition-opacity duration-(--duration-instant) disabled:opacity-40 ${STAGE_FOCUS}`}
          >
            {playing ? (
              <Pause size={20} strokeWidth={1.5} aria-hidden />
            ) : (
              <Play size={20} strokeWidth={1.5} aria-hidden />
            )}
          </button>
        )}
        <p className="tabular shrink-0 whitespace-nowrap text-gray-300 text-sm">
          {processing
            ? `${Math.round((progress?.ratio ?? 0) * 100)}% processed`
            : `${formatDuration(time)} / ${formatDuration(duration)}`}
        </p>
        <p className="ml-auto min-w-0 truncate text-right text-gray-400 text-xs">
          {note ?? (result ? "Result" : "Source")}
        </p>
        {/* Announced once when reading starts and once when it ends, not on every percentage step. */}
        <span className="sr-only" aria-live="polite">
          {wave.status === "reading"
            ? phase === "inspecting"
              ? ""
              : "Reading the waveform"
            : wave.status === "done"
              ? "Waveform ready"
              : (note ?? "")}
        </span>
      </div>
    </div>
  );
}
