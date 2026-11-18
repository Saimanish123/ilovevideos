"use client";

import { type PointerEvent, type RefObject, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { withUnit } from "@/lib/format";
import { seekBy, toggleFullscreen, togglePlayback } from "./shortcuts";

/** A press that moves further or lasts longer is a scroll or a hold, not a tap. */
const TAP_SLOP_PX = 10;
const TAP_MAX_MS = 500;
/** Second tap of a double tap; later taps on the same side keep seeking within this window. */
const DOUBLE_TAP_MS = 300;
const SEEK_STEP_S = 5;
/** How long the "+5 s" label stays before it fades. */
const INDICATOR_MS = 600;

type Zone = "back" | "middle" | "forward";

/**
 * Pointer and touch gestures on the preview picture (design principles: familiar players):
 * - mouse: click plays or pauses, double-click toggles full screen;
 * - touch: a tap plays or pauses at once (no wait for a possible second tap); a double tap on the
 *   left or right third seeks 5 s back or forward and undoes the first tap's toggle, as phone players
 *   do; more taps on that side keep seeking. The middle third has no double tap.
 * A press that moves (a scroll starting on the video) or is held is ignored, so the page still
 * scrolls under a finger. Keyboard users have the bar and the player keys; this adds nothing they
 * need.
 */
export function usePreviewGestures(
  video: RefObject<HTMLVideoElement | null>,
  box: RefObject<HTMLElement | null>,
) {
  const down = useRef<{ x: number; y: number; t: number } | null>(null);
  const lastType = useRef<string>("mouse");
  const last = useRef<{ t: number; zone: Zone; toggled: boolean; seeking: boolean } | null>(null);
  const [indicator, setIndicator] = useState<{ zone: Zone; seconds: number; id: number }>();
  const [shown, setShown] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const show = (zone: Zone, seconds: number) => {
    setIndicator((prev) => ({ zone, seconds, id: (prev?.id ?? 0) + 1 }));
    setShown(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setShown(false), INDICATOR_MS);
  };

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    lastType.current = e.pointerType;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    down.current = { x: e.clientX, y: e.clientY, t: e.timeStamp };
  };

  const onPointerUp = (e: PointerEvent<HTMLElement>) => {
    const d = down.current;
    down.current = null;
    if (!d) return;
    const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y) > TAP_SLOP_PX;
    if (moved || e.timeStamp - d.t > TAP_MAX_MS) return;
    const el = video.current;
    if (!el) return;
    if (e.pointerType === "mouse") {
      togglePlayback(el);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / Math.max(1, rect.width);
    const zone: Zone = x < 1 / 3 ? "back" : x > 2 / 3 ? "forward" : "middle";
    const now = e.timeStamp;
    const prev = last.current;
    const sign = zone === "back" ? -1 : 1;
    if (prev && zone !== "middle" && prev.zone === zone) {
      const window = prev.seeking ? INDICATOR_MS : DOUBLE_TAP_MS;
      if (now - prev.t < window) {
        // The first tap of the pair played or paused; a seek leaves playback as it was.
        if (prev.toggled) togglePlayback(el);
        seekBy(el, sign * SEEK_STEP_S);
        const total = prev.seeking ? (indicator?.seconds ?? 0) + SEEK_STEP_S : SEEK_STEP_S;
        show(zone, total);
        last.current = { t: now, zone, toggled: false, seeking: true };
        return;
      }
    }
    togglePlayback(el);
    last.current = { t: now, zone, toggled: true, seeking: false };
  };

  const onDoubleClick = () => {
    // Touch double taps are seeks; only a mouse double-click means full screen.
    if (lastType.current !== "mouse") return;
    toggleFullscreen(box.current, video.current);
    // The two clicks toggled playback twice; leave it as it was.
  };

  const overlay = indicator && (
    <span
      key={indicator.id}
      // A pointer-only echo of the seek (the time in the bar says it too); keyboard seeks have
      // their own feedback, so it is not announced.
      aria-hidden
      className={cn(
        "tabular pointer-events-none absolute top-1/2 -translate-y-1/2 rounded-full bg-bg-stage px-3 py-1 text-gray-50 text-sm",
        indicator.zone === "back" ? "left-4" : "right-4",
        // Appears at once; fades on the way out only (exits are the short half, §6.3).
        shown
          ? "opacity-100 duration-0"
          : "opacity-0 transition-opacity duration-(--duration-fast) ease-out motion-reduce:transition-none",
      )}
    >
      {withUnit(indicator.zone === "back" ? -indicator.seconds : indicator.seconds, "s").replace(
        /^(?=\d)/,
        "+",
      )}
    </span>
  );

  return { onPointerDown, onPointerUp, onDoubleClick, overlay };
}
