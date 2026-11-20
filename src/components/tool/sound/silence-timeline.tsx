"use client";

import {
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { formatDuration, withUnit } from "@/lib/format";
import {
  type CutPlan,
  planCuts,
  type RemoveSilenceOptions,
  removedWords,
} from "@/tools/engines/remove-silence/options";
import { WINDOW_SEC } from "@/tools/engines/sound/dsp/silence";
import { STAGE_FOCUS } from "../audio/audio-hero";
import type { SoundAnalysisState } from "./use-sound-analysis";

/** The level graph's range, dBFS: quiet room tone near the bottom, full scale at the top. */
const FLOOR = -70;
const TOP = 0;
const BUCKETS = 240;
const y = (db: number) => Math.min(100, Math.max(0, ((TOP - db) / (TOP - FLOOR)) * 100));
const dbAt = (share: number) => Math.round(TOP - share * (TOP - FLOOR));

/**
 * Plays the preview as the result will sound: while it plays, a cut is jumped over. Seeking into a
 * cut is left alone, so a cut can still be listened to on purpose.
 */
export function useSkipCuts(
  media: RefObject<HTMLMediaElement | null> | undefined,
  cuts: CutPlan["cuts"],
) {
  const cutsRef = useRef(cuts);
  cutsRef.current = cuts;
  useEffect(() => {
    let raf = 0;
    let tries = 0;
    let el: HTMLMediaElement | null = null;
    const loop = () => {
      if (!el || el.paused) return;
      const t = el.currentTime;
      const c = cutsRef.current.find((k) => t >= k.start && t < k.end - 0.02);
      if (c) el.currentTime = c.end;
      raf = requestAnimationFrame(loop);
    };
    const onPlay = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
    };
    const attach = () => {
      el = media?.current ?? null;
      if (!el) {
        if (tries++ < 120) raf = requestAnimationFrame(attach);
        return;
      }
      el.addEventListener("play", onPlay);
    };
    attach();
    return () => {
      cancelAnimationFrame(raf);
      el?.removeEventListener("play", onPlay);
    };
  }, [media]);
}

/**
 * The recording's level every moment, in dBFS, with the silence threshold as a line you drag up or
 * down and the parts that will be cut shaded, before anything runs. On the dark stage, like the
 * waveform. Keyboard on the line: arrows ±1 dB, Shift ±5 dB.
 */
export function SilenceTimeline({
  analysis,
  value,
  onChange,
  disabled,
  media,
}: {
  analysis: SoundAnalysisState;
  value: RemoveSilenceOptions;
  onChange: (next: RemoveSilenceOptions) => void;
  disabled?: boolean;
  media?: RefObject<HTMLMediaElement | null>;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const result = analysis.result;
  const levels = result?.levels;
  const duration = result?.duration ?? 0;
  const speech = result?.speech;
  const plan = useMemo(
    () => (levels ? planCuts(value, levels, duration, speech) : undefined),
    [levels, value, duration, speech],
  );
  // By speech, the bars are lit where someone speaks and there is no threshold line to drag.
  const bySpeech = plan?.detect === "speech";
  const summary = plan
    ? plan.cuts.length === 0
      ? plan.detect === "speech"
        ? "No gap between words is long enough to cut. Shorten the minimum pause."
        : "No pause is long and quiet enough to cut. Raise the line or shorten the minimum pause."
      : `${plan.cuts.length} ${plan.cuts.length === 1 ? "pause" : "pauses"} marked · ${removedWords(plan.removed)} removed · ${formatDuration(duration)} → ${formatDuration(plan.after)}`
    : "";
  const [announced, setAnnounced] = useState(summary);
  useEffect(() => {
    const t = setTimeout(() => setAnnounced(summary), 600);
    return () => clearTimeout(t);
  }, [summary]);
  // Per bar, whether the speech model heard speech in that slice of time.
  const spoken = useMemo(() => {
    if (!speech || speech.length === 0) return [];
    const per = speech.length / BUCKETS;
    return Array.from({ length: BUCKETS }, (_, b) => {
      const from = Math.floor(b * per);
      const to = Math.max(from + 1, Math.floor((b + 1) * per));
      for (let i = from; i < to && i < speech.length; i++) if ((speech[i] ?? 0) >= 0.5) return true;
      return false;
    });
  }, [speech]);
  // Bars: the loudest window in each slice of time.
  const bars = useMemo(() => {
    if (!levels || levels.length === 0) return [];
    const per = levels.length / BUCKETS;
    return Array.from({ length: BUCKETS }, (_, b) => {
      let m = -120;
      const from = Math.floor(b * per);
      const to = Math.max(from + 1, Math.floor((b + 1) * per));
      for (let i = from; i < to && i < levels.length; i++) m = Math.max(m, levels[i] ?? -120);
      return m;
    });
  }, [levels]);

  useSkipCuts(media, plan?.cuts ?? []);

  // Playhead that follows the preview.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const el = media?.current;
      const head = headRef.current;
      if (el && head && duration > 0)
        head.style.left = `${Math.min(1, el.currentTime / duration) * 100}%`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [media, duration]);

  const threshold = plan?.thresholdDb ?? value.thresholdDb ?? -40;
  const setThreshold = (db: number) =>
    onChange({ ...value, thresholdDb: Math.round(Math.min(-10, Math.max(-70, db))) });
  const drag = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const at = (clientY: number) => {
      const rect = boxRef.current?.getBoundingClientRect();
      if (!rect || rect.height === 0) return;
      setThreshold(dbAt((clientY - rect.top) / rect.height));
    };
    at(e.clientY);
    const move = (ev: globalThis.PointerEvent) => at(ev.clientY);
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };
  const keys = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 5 : 1;
    if (e.key === "ArrowUp" || e.key === "ArrowRight") setThreshold(threshold + step);
    else if (e.key === "ArrowDown" || e.key === "ArrowLeft") setThreshold(threshold - step);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };
  const pct = (t: number) => (duration > 0 ? (t / duration) * 100 : 0);

  return (
    <div className="rounded-lg bg-bg-stage p-3 text-gray-50 md:p-4">
      <div ref={boxRef} className="relative h-32 md:h-40">
        {bars.length > 0 ? (
          <svg
            viewBox={`0 0 ${BUCKETS} 100`}
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
            role="img"
            aria-label={
              plan
                ? `Level of the recording over ${formatDuration(duration)}, ${bySpeech ? "speech lit, " : ""}with ${plan.cuts.length} pauses marked to cut`
                : "Level of the recording"
            }
          >
            {bars.map((db, i) => (
              <rect
                key={i.toString()}
                x={i + 0.15}
                width={0.7}
                y={y(db)}
                height={100 - y(db)}
                className={
                  (bySpeech ? !spoken[i] : db < threshold) ? "fill-gray-600" : "fill-gray-300"
                }
              />
            ))}
          </svg>
        ) : (
          <p className="tabular absolute inset-0 flex items-center justify-center text-gray-400 text-sm">
            {analysis.status === "failed"
              ? (analysis.message ?? "The sound could not be read.")
              : `Reading the sound, ${Math.round(analysis.ratio * 100)}%`}
          </p>
        )}
        {plan?.cuts.map((c) => (
          <div
            key={`${c.start}-${c.end}`}
            aria-hidden
            className="pointer-events-none absolute inset-y-0 border-gray-50/40 border-x bg-gray-50/15"
            style={{
              left: `${pct(c.start)}%`,
              width: `${Math.max(0.2, pct(c.end) - pct(c.start))}%`,
            }}
          />
        ))}
        <div
          ref={headRef}
          aria-hidden
          className="pointer-events-none absolute inset-y-0 w-px bg-gray-50/70"
        />
        {bars.length > 0 && !bySpeech && (
          <div
            role="slider"
            tabIndex={disabled ? -1 : 0}
            aria-label="Silence threshold"
            aria-orientation="vertical"
            aria-valuemin={-70}
            aria-valuemax={-10}
            aria-valuenow={threshold}
            aria-valuetext={`${withUnit(threshold, "dBFS")}${value.thresholdDb === null ? ", suggested" : ""}`}
            aria-disabled={disabled || undefined}
            onPointerDown={drag}
            onKeyDown={keys}
            className={`-translate-y-1/2 absolute inset-x-0 flex h-11 cursor-ns-resize touch-none items-center ${STAGE_FOCUS}`}
            style={{ top: `${y(threshold)}%` }}
          >
            <span className="h-px w-full border-gray-50 border-t border-dashed" />
            <span className="tabular absolute right-0 rounded-sm bg-gray-50 px-1.5 text-gray-950 text-xs">
              {withUnit(threshold, "dBFS")}
            </span>
          </div>
        )}
      </div>
      <p className="tabular mt-3 min-h-5 text-gray-300 text-sm">{summary}</p>
      {/* Announced once the line rests, not for every step of a drag. */}
      <span className="sr-only" aria-live="polite">
        {announced}
      </span>
    </div>
  );
}

/** Level window length, for the panel's hint. */
export const LEVEL_WINDOW_MS = Math.round(WINDOW_SEC * 1000);
