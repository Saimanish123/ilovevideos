"use client";

import { Pause, Play, Square } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions, DialogContent } from "@/components/ui/dialog";
import { formatBytes, formatDuration } from "@/lib/format";
import { useActionBarRef } from "../action-bar";
import { useReducedMotion } from "./reduced-motion";
import type { RecordingPhase, RecordingStats } from "./use-recording";

/**
 * What the recorders show while recording: the live line, the controls, Discard with its confirm,
 * and the level meter. Nothing here animates except the meter, which is data drawn as it arrives
 * (no easing, no decoration), and steps four times a second with reduced motion.
 */

const labelOf = (phase: RecordingPhase) =>
  phase === "paused"
    ? "Paused"
    : phase === "finishing"
      ? "Finishing the file"
      : phase === "starting"
        ? "Starting"
        : "Recording";

/**
 * "Recording 0:42 · 12.4 MB": real time recorded and bytes written. The visible line changes four
 * times a second, so it is not a live region; a hidden one announces each change of phase, and the
 * time once a minute while recording.
 */
export function LiveLine({ phase, stats }: { phase: RecordingPhase; stats: RecordingStats }) {
  const minute = Math.floor(stats.seconds / 60);
  const [said, setSaid] = useState("");
  useEffect(() => {
    const label = labelOf(phase);
    setSaid(
      phase === "recording" && minute > 0
        ? `${label}, ${formatDuration(minute * 60)}`
        : phase === "paused"
          ? `${label} at ${formatDuration(stats.seconds)}`
          : label,
    );
    // The time is read only when the phase or the minute changes.
  }, [phase, minute]);
  return (
    <div data-live-line="">
      <p className="flex items-center gap-2 text-body" aria-hidden>
        {(phase === "recording" || phase === "paused") && (
          <span
            className={
              phase === "recording"
                ? "size-2 shrink-0 rounded-full bg-fg"
                : "size-2 shrink-0 rounded-full border border-fg"
            }
          />
        )}
        {/* A fixed width, so the digits do not move when Recording becomes Paused. */}
        <span className="min-w-20">{labelOf(phase)}</span>
        {phase !== "starting" && (
          <span className="tabular text-fg-muted">
            {formatDuration(stats.seconds)} · {formatBytes(stats.bytes)}
          </span>
        )}
      </p>
      <p className="sr-only" role="status" aria-live="polite">
        {said}
      </p>
    </div>
  );
}

/**
 * The sticky bar while recording: the live line, then Pause or Resume and Stop. One button toggles
 * between Pause and Resume, so focus stays on it; Stop takes focus when the recording starts.
 */
export function RecordingControls({
  phase,
  onPause,
  onResume,
  onStop,
  children,
}: {
  /** The live line, shown first inside the bar (like the stage's status line). */
  children?: ReactNode;
  phase: RecordingPhase;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}) {
  const busy = phase === "finishing" || phase === "starting";
  const barRef = useActionBarRef();
  const focused = useRef(false);
  useEffect(() => {
    if (phase !== "recording" || focused.current) return;
    focused.current = true;
    // Start recording has gone; focus moves to Stop rather than falling to the page.
    document.querySelector<HTMLElement>('[data-live-bar] [data-action="run"]')?.focus();
  }, [phase]);
  const paused = phase === "paused";
  return (
    <div
      // Phones: the sticky bar the page keeps focused controls clear of (globals.css), as on the stage.
      data-action-bar=""
      data-live-bar=""
      ref={barRef}
      className="-mx-6 sticky bottom-0 mt-auto flex flex-col gap-2 border-border border-t bg-bg-raised px-6 py-3 lg:static lg:m-0 lg:gap-6 lg:border-0 lg:p-0"
    >
      {children}
      <div className="flex items-center gap-3">
        <Button
          variant="secondary"
          size="lg"
          className="flex-1"
          onClick={paused ? onResume : onPause}
          disabled={busy}
        >
          {paused ? (
            <Play size={20} strokeWidth={1.5} aria-hidden />
          ) : (
            <Pause size={20} strokeWidth={1.5} aria-hidden />
          )}
          {paused ? "Resume" : "Pause"}
        </Button>
        <Button
          variant="primary"
          size="lg"
          className="flex-1"
          onClick={onStop}
          disabled={busy}
          data-action="run"
        >
          <Square size={16} strokeWidth={1.5} aria-hidden />
          Stop
        </Button>
      </div>
    </div>
  );
}

/**
 * Discard, kept out of the sticky bar (away from the thumb) and confirmed first: a recording thrown
 * away cannot be recovered.
 */
export function DiscardButton({
  seconds,
  disabled,
  onDiscard,
}: {
  seconds: number;
  disabled?: boolean;
  onDiscard: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [length, setLength] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="destructive"
        size="md"
        className="self-start"
        disabled={disabled}
        onClick={() => {
          setLength(formatDuration(seconds));
          setOpen(true);
        }}
      >
        Discard
      </Button>
      <DialogContent
        title={`Discard this ${length} recording?`}
        description="It cannot be recovered."
        showClose={false}
      >
        <DialogActions>
          <Button variant="secondary" size="md" onClick={() => setOpen(false)}>
            Keep recording
          </Button>
          <Button
            variant="destructive"
            size="md"
            onClick={() => {
              setOpen(false);
              onDiscard();
            }}
          >
            Discard
          </Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Microphone level: the peak of the last ~40 ms, on a dBFS scale from −60 to 0, revealed with a
 * clip so the fill keeps square ends. Every frame, or four times a second with reduced motion.
 * Hidden from assistive tech: the live line carries the state.
 */
export function LevelMeter({
  track,
  label = "Level",
}: {
  track?: MediaStreamTrack;
  label?: string;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (track?.readyState !== "live") return;
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(new MediaStream([track]));
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    src.connect(analyser);
    const data = new Float32Array(analyser.fftSize);
    let raf = 0;
    let timer: ReturnType<typeof setInterval> | undefined;
    const draw = () => {
      analyser.getFloatTimeDomainData(data);
      let peak = 0;
      for (const v of data) peak = Math.max(peak, Math.abs(v));
      const db = peak > 0 ? 20 * Math.log10(peak) : -60;
      const share = Math.min(1, Math.max(0, (db + 60) / 60));
      if (bar.current) bar.current.style.clipPath = `inset(0 ${(1 - share) * 100}% 0 0)`;
    };
    if (reduce) timer = setInterval(draw, 250);
    else {
      const loop = () => {
        draw();
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }
    return () => {
      cancelAnimationFrame(raf);
      if (timer) clearInterval(timer);
      src.disconnect();
      void ctx.close();
    };
  }, [track, reduce]);
  return (
    <div className="flex items-center gap-3" aria-hidden>
      <span className="w-12 shrink-0 text-fg-muted text-xs">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-bg-subtle">
        <div ref={bar} className="h-full w-full bg-fg" style={{ clipPath: "inset(0 100% 0 0)" }} />
      </div>
    </div>
  );
}
