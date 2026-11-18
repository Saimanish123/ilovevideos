"use client";

import { Pause, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/cn";
import { formatDuration, formatTimecode } from "@/lib/format";
import {
  type Box,
  insetFromBox,
  type LayoutOptions,
  mainVisible,
  outputLength,
  type Placement,
  placement,
  secondTime,
} from "@/tools/engines/layout/options";

interface Clip {
  file: File;
  size: { width: number; height: number };
  duration: number;
  hasSound: boolean;
}

const pct = (v: number, of: number) => `${(v / of) * 100}%`;
const boxStyle = (b: Box, p: Placement) => ({
  left: pct(b.x, p.frame.width),
  top: pct(b.y, p.frame.height),
  width: pct(b.width, p.frame.width),
  height: pct(b.height, p.frame.height),
});

const iconButton =
  "flex size-11 shrink-0 items-center justify-center rounded-md text-fg hover:bg-bg-subtle focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:opacity-50";

/** Keeps a <video> at clip time `t` while the layout plays, within 0.15 s; pauses it outside its run. */
function follow(el: HTMLVideoElement | null, t: number, duration: number, playing: boolean) {
  if (!el || el.readyState < 1) return;
  const inside = t >= 0 && t < duration;
  const target = Math.min(Math.max(0, t), Math.max(0, duration - 0.001));
  if (playing && inside) {
    if (Math.abs(el.currentTime - target) > 0.15) el.currentTime = target;
    if (el.paused) void el.play().catch(() => undefined);
  } else {
    if (!el.paused) el.pause();
    if (Math.abs(el.currentTime - target) > 0.01) el.currentTime = target;
  }
}

/**
 * The live preview of two videos in one frame: both play in step, placed with the engine's own
 * geometry (`placement`), so what is shown is what is written. A clock of its own drives them (the
 * output can outlast either clip); each video is kept on its time and paused outside its run, held
 * on its nearest frame or hidden as the options say. The inset of a picture in picture can be
 * dragged, or moved with the arrow keys (Shift moves further). Pointer tracking is 1:1, no easing.
 * Sound plays from the clips the sound choice keeps.
 */
export function LayoutPreview({
  value,
  onChange,
  main,
  second,
  disabled,
}: {
  value: LayoutOptions;
  onChange: (next: LayoutOptions) => void;
  main: Clip;
  second: Clip;
  disabled?: boolean;
}) {
  const p = placement(value, main.size, second.size);
  const total = outputLength(value, main.duration, second.duration);
  const [urls, setUrls] = useState<[string, string]>();
  const aRef = useRef<HTMLVideoElement>(null);
  const bRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const clock = useRef({ t: 0, at: 0 });
  // The frame's drawn width, for border and corner sizes in CSS pixels.
  const [frameWidth, setFrameWidth] = useState(0);
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () => setFrameWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const a = URL.createObjectURL(main.file);
    const b = URL.createObjectURL(second.file);
    setUrls([a, b]);
    return () => {
      URL.revokeObjectURL(a);
      URL.revokeObjectURL(b);
    };
  }, [main.file, second.file]);

  const place = useCallback(
    (t: number, run: boolean) => {
      follow(aRef.current, t, main.duration, run);
      follow(bRef.current, t - value.offset, second.duration, run);
    },
    [main.duration, second.duration, value.offset],
  );

  // The clock: while playing, time runs from the moment play was pressed.
  useEffect(() => {
    if (!playing) {
      place(clock.current.t, false);
      return;
    }
    let raf = 0;
    clock.current.at = performance.now();
    const start = clock.current.t;
    const tick = (now: number) => {
      const t = start + (now - clock.current.at) / 1000;
      if (t >= total) {
        clock.current.t = 0;
        setTime(0);
        setPlaying(false);
        return;
      }
      clock.current.t = t;
      setTime(t);
      place(t, true);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, total, place]);

  const seek = (t: number) => {
    const next = Math.min(Math.max(0, t), total);
    clock.current.t = next;
    setTime(next);
    if (!playing) place(next, false);
  };

  // Keep the paused picture on the clock when the offset or the clips change.
  useEffect(() => {
    if (!playing) place(clock.current.t, false);
  }, [place, playing]);

  const wantMain = value.sound !== "second" || !second.hasSound;
  const wantSecond = value.sound !== "main" || !main.hasSound;
  const showMain = mainVisible(value, time, main.duration);
  const st = secondTime(value, time, second.duration);

  const dragInset = (e: React.PointerEvent) => {
    if (disabled || value.layout !== "pip") return;
    e.preventDefault();
    const el = frameRef.current;
    if (!el) return;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    target.focus({ preventScroll: true });
    const k = p.frame.width / el.clientWidth;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const start = p.second;
    const move = (ev: PointerEvent) => {
      const box = {
        ...start,
        x: start.x + (ev.clientX - x0) * k,
        y: start.y + (ev.clientY - y0) * k,
      };
      onChange({ ...value, inset: insetFromBox(box, p.frame, value.inset.width) });
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };

  const keyInset = (e: React.KeyboardEvent) => {
    if (disabled || value.layout !== "pip") return;
    const step = (e.shiftKey ? 0.05 : 0.01) * Math.min(p.frame.width, p.frame.height);
    const d =
      e.key === "ArrowLeft"
        ? [-step, 0]
        : e.key === "ArrowRight"
          ? [step, 0]
          : e.key === "ArrowUp"
            ? [0, -step]
            : e.key === "ArrowDown"
              ? [0, step]
              : undefined;
    if (!d) return;
    e.preventDefault();
    const box = { ...p.second, x: p.second.x + (d[0] ?? 0), y: p.second.y + (d[1] ?? 0) };
    onChange({ ...value, inset: insetFromBox(box, p.frame, value.inset.width) });
  };

  const scale = frameWidth / p.frame.width;
  const borderPx = p.border * scale;
  const ring = value.borderColor === "white" ? "var(--color-gray-0)" : "var(--color-gray-1000)";
  const isPip = value.layout === "pip";

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={frameRef}
        className="relative mx-auto w-full overflow-hidden rounded-lg bg-bg-stage"
        style={{
          aspectRatio: `${p.frame.width} / ${p.frame.height}`,
          maxHeight: "60vh",
          maxWidth: `calc(60vh * ${p.frame.width / p.frame.height})`,
        }}
      >
        {urls && (
          <>
            <video
              ref={aRef}
              src={urls[0]}
              playsInline
              preload="auto"
              muted={!wantMain}
              aria-label="First video"
              className={cn("absolute", !showMain && "invisible")}
              style={{
                ...boxStyle(p.main, p),
                objectFit: isPip || value.fit === "cover" ? "cover" : "contain",
              }}
            />
            {!isPip && borderPx > 0 && (
              <div
                aria-hidden
                className="absolute"
                style={{
                  background: ring,
                  ...(value.layout === "side"
                    ? {
                        left: pct(p.main.x + p.main.width, p.frame.width),
                        top: 0,
                        width: pct(p.second.x - p.main.width, p.frame.width),
                        height: "100%",
                      }
                    : {
                        top: pct(p.main.y + p.main.height, p.frame.height),
                        left: 0,
                        height: pct(p.second.y - p.main.height, p.frame.height),
                        width: "100%",
                      }),
                }}
              />
            )}
            {/* biome-ignore lint/a11y/useSemanticElements: a focusable drag surface over the picture, not a set of form controls */}
            <div
              role="group"
              aria-roledescription={isPip ? "inset" : undefined}
              aria-label={
                isPip
                  ? `Inset at ${Math.round(p.second.x)}, ${Math.round(p.second.y)}, ${Math.round(p.second.width)}×${Math.round(p.second.height)}. Drag or use the arrow keys to move it.`
                  : "Second video"
              }
              tabIndex={isPip && !disabled ? 0 : undefined}
              onPointerDown={dragInset}
              onKeyDown={keyInset}
              className={cn(
                "absolute outline-none",
                isPip && "cursor-move touch-none focus-visible:stage-focus",
                !st.visible && "invisible",
              )}
              style={{
                ...boxStyle(p.second, p),
                borderRadius: p.radius * scale,
                boxShadow: isPip && borderPx > 0 ? `0 0 0 ${borderPx}px ${ring}` : undefined,
              }}
            >
              <video
                ref={bRef}
                src={urls[1]}
                playsInline
                preload="auto"
                muted={!wantSecond}
                aria-label="Second video"
                className="pointer-events-none h-full w-full"
                style={{
                  objectFit: isPip || value.fit === "cover" ? "cover" : "contain",
                  borderRadius: p.radius * scale,
                }}
              />
            </div>
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={iconButton}
          disabled={disabled}
          aria-label={playing ? "Pause" : "Play"}
          onClick={() => setPlaying((v) => !v)}
        >
          {playing ? (
            <Pause size={20} strokeWidth={1.5} aria-hidden />
          ) : (
            <Play size={20} strokeWidth={1.5} aria-hidden />
          )}
        </button>
        <p className="tabular shrink-0 whitespace-nowrap text-fg-muted text-sm">
          {formatTimecode(time)} / {formatDuration(total)}
        </p>
        <Slider
          className="min-w-0 flex-1 px-2"
          value={Math.min(time, total)}
          min={0}
          max={Math.max(0.01, total)}
          step={0.01}
          disabled={disabled}
          aria-label="Position in the result"
          getAriaValueText={(_, t) => `${formatTimecode(t)} of ${formatDuration(total)}`}
          onValueChange={seek}
        />
      </div>
    </div>
  );
}
