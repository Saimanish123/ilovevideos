"use client";

import {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/cn";
import type { CompareSource } from "./context";
import {
  actualPixels,
  boxRect,
  clampView,
  clipRight,
  fit,
  IDENTITY,
  placeInto,
  type Rect,
  type Size,
  sameShape,
  sideBySide,
  type View,
  viewTransform,
  visible,
  zoomAt,
} from "./geometry";
import { follow, release } from "./sync";

/** Space between the two pictures side by side. */
const GAP = 8;
/** The source has this long to show a first frame before the compare gives up on it. */
const LOAD_TIMEOUT_MS = 10_000;

/** Opaque, so a label keeps its colour over any picture. Fades are opacity only, kept under reduced motion. */
const LABEL =
  "pointer-events-none absolute rounded-sm bg-gray-950 px-2 py-1 text-gray-0 text-xs transition-opacity ease-(--ease-out)";

/** `--duration-fast` in ms, the close fade (tokens.css); 150 if it cannot be read. */
function fastMs(): number {
  if (typeof document === "undefined") return 150;
  // The built CSS may write it as ".15s".
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--duration-fast").trim();
  const n = Number.parseFloat(raw);
  const ms = raw.endsWith("ms") ? n : raw.endsWith("s") ? n * 1000 : n;
  return Number.isFinite(ms) && ms > 0 ? ms : 150;
}

/**
 * The source over the result on the preview (ADR-0134, ADR-0135). The result keeps playing in the
 * preview's own element, driven by its bar, keys and gestures; the source plays in a second, muted
 * element made only now and kept at the same frame (compare/sync).
 *
 * - Same shape: a wipe. The source shows left of a divider the user drags or moves with the arrow
 *   keys (the sharpen page's divider: the same 44 px grab strip, Home and End, Shift for big steps).
 *   With `zoom`, both pictures scale to one video pixel per CSS pixel about the divider, and a mouse
 *   drag or the arrow keys on the picture move the view.
 * - A different shape (crop, aspect, rotate) or `layout: "side-by-side"`: the two pictures side by
 *   side (or stacked, whichever shows them larger), each whole, never a wipe across two framings.
 *
 * Everything moves by transform and clip-path; the preview box keeps its size, so nothing reflows.
 *
 * Motion (ADR-0137): opening fades the source and labels in (`--duration-base`, `--ease-out`,
 * opacity) once the source has a frame; side by side, the result moves to its slot at the same
 * moment (`transform`, `--duration-base`, `--ease-in-out`), so both halves arrive together. Closing
 * (`open` false) fades out at `--duration-fast` and moves the result back, then `onClosed` unmounts
 * it. Zoom, pan and the divider follow the pointer 1:1. Reduced motion keeps the fades only.
 */
export function PictureCompare({
  master,
  box,
  compare,
  open,
  zoom,
  onZoomable,
  onFail,
  onClosed,
}: {
  master: RefObject<HTMLVideoElement | null>;
  box: RefObject<HTMLElement | null>;
  compare: CompareSource;
  /** One video pixel per CSS pixel (wipe of two same-size pictures only). */
  zoom: boolean;
  /** Whether a zoom would show more than the fitted picture (the bar's zoom button). */
  onZoomable: (zoomable: boolean) => void;
  /** The source does not play here: the preview closes the compare and says so. */
  onFail: () => void;
  /** False while closing: everything fades out, then `onClosed` lets the preview unmount it. */
  open: boolean;
  onClosed: () => void;
}) {
  const followerRef = useRef<HTMLVideoElement>(null);
  const [url, setUrl] = useState<string>();
  const [boxSize, setBoxSize] = useState<Size | null>(null);
  const [dims, setDims] = useState<{ before: Size; after: Size } | null>(null);
  const [shown, setShown] = useState(false);
  const [split, setSplit] = useState(0.5);
  const [view, setView] = useState<View>(IDENTITY);
  const labelId = useId();
  const failRef = useRef(onFail);
  failRef.current = onFail;

  useEffect(() => {
    const u = URL.createObjectURL(compare.source);
    setUrl(u);
    return () => {
      release(followerRef.current);
      URL.revokeObjectURL(u);
    };
  }, [compare.source]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setBoxSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [box]);

  // Both sizes as the browser shows them (a phone's rotation flag applied), then follow.
  useEffect(() => {
    const m = master.current;
    const f = followerRef.current;
    if (!m || !f || !url) return;
    const measure = () => {
      if (m.videoWidth > 0 && f.videoWidth > 0)
        setDims({
          before: { width: f.videoWidth, height: f.videoHeight },
          after: { width: m.videoWidth, height: m.videoHeight },
        });
    };
    const onData = () => {
      clearTimeout(timer);
      setShown(true);
    };
    const onError = () => failRef.current();
    const timer = setTimeout(() => {
      if (f.readyState < 2) failRef.current();
    }, LOAD_TIMEOUT_MS);
    m.addEventListener("loadedmetadata", measure);
    f.addEventListener("loadedmetadata", measure);
    f.addEventListener("loadeddata", onData);
    f.addEventListener("error", onError);
    measure();
    if (f.readyState >= 2) onData();
    const unfollow = follow(m, f, { scale: compare.spec.timeScale ?? 1 });
    return () => {
      clearTimeout(timer);
      unfollow();
      m.removeEventListener("loadedmetadata", measure);
      f.removeEventListener("loadedmetadata", measure);
      f.removeEventListener("loadeddata", onData);
      f.removeEventListener("error", onError);
    };
  }, [master, url, compare.spec.timeScale]);

  const side =
    !!dims && (compare.spec.layout === "side-by-side" || !sameShape(dims.before, dims.after));
  const content: Rect | null = useMemo(
    () => (boxSize && dims ? fit(boxRect(boxSize), dims.after) : null),
    [boxSize, dims],
  );
  const sameSize =
    !!dims && dims.before.width === dims.after.width && dims.before.height === dims.after.height;
  const zoomScale = content && dims && !side && sameSize ? actualPixels(content, dims.after) : 1;
  const zoomable = zoomScale > 1.05;
  useEffect(() => {
    onZoomable(zoomable);
  }, [zoomable, onZoomable]);
  const zoomed = zoom && zoomable;

  // Zooming in keeps the divider's point in place; out goes back to the fitted picture. A resize
  // (full screen, rotating a tablet) keeps the zoom and clamps the view.
  const splitRef = useRef(split);
  splitRef.current = split;
  const lastScale = useRef(1);
  useEffect(() => {
    if (!boxSize || !content) return;
    if (!zoomed) {
      lastScale.current = 1;
      setView(IDENTITY);
      return;
    }
    if (lastScale.current !== zoomScale) {
      lastScale.current = zoomScale;
      const v = visible(boxSize, content, IDENTITY);
      setView(
        zoomAt(boxSize, content, zoomScale, {
          x: v.left + splitRef.current * v.width,
          y: boxSize.height / 2,
        }),
      );
    } else
      setView((cur) => {
        const next = clampView(boxSize, content, cur);
        return next.x === cur.x && next.y === cur.y && next.scale === cur.scale ? cur : next;
      });
  }, [zoomed, zoomScale, boxSize, content]);

  const ready = shown && !!dims;
  const pair = side && boxSize && dims ? sideBySide(boxSize, dims.before, dims.after, GAP) : null;
  // Side by side, the result waits in place until the source has a frame, so both arrive together.
  const placed = !!pair && ready && open;
  const masterView =
    pair && boxSize && content
      ? placed
        ? placeInto(boxSize, content, pair.after)
        : IDENTITY
      : zoomed && open
        ? view
        : IDENTITY;

  // The result's element moves by transform only. Into its side-by-side slot it glides with the
  // element's own transition class (base, in-out, none under reduced motion); back out at
  // `--duration-fast`, so it lands as the overlay's fade ends and never moves beside an empty half.
  // A resize, the zoom and the pan follow 1:1.
  const masterTransform = viewTransform(masterView);
  const wasPlaced = useRef(false);
  useLayoutEffect(() => {
    const m = master.current;
    if (!m) return;
    const glide = wasPlaced.current !== placed;
    wasPlaced.current = placed;
    m.style.transition = glide ? "" : "none";
    m.style.transitionDuration = glide && !placed ? "var(--duration-fast)" : "";
    m.style.transform = masterTransform;
  }, [master, masterTransform, placed]);

  // Closing: fade out, then unmount. Reopening before that cancels it.
  const closedRef = useRef(onClosed);
  closedRef.current = onClosed;
  useEffect(() => {
    if (open) return;
    const t = setTimeout(() => closedRef.current(), ready ? fastMs() : 0);
    return () => clearTimeout(t);
  }, [open, ready]);
  useLayoutEffect(() => {
    const m = master.current;
    return () => {
      if (!m) return;
      m.style.transform = "";
      m.style.transition = "";
      m.style.transitionDuration = "";
    };
  }, [master]);

  const wipe = !side && !!boxSize && !!content;
  const area = wipe && boxSize && content ? visible(boxSize, content, masterView) : null;
  const line = area ? area.left + split * area.width : 0;
  const shownNow = ready && open;

  const dragging = useRef(false);
  const fromPointer = (clientX: number) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect || !area || area.width <= 0) return;
    setSplit(Math.min(1, Math.max(0, (clientX - rect.left - area.left) / area.width)));
  };
  const pct = Math.round(split * 100);
  // The 44 px grab strip stays inside the picture at the ends; the line itself follows the split.
  const grab = area ? Math.min(area.width - 22, Math.max(22, split * area.width)) : 0;

  // Panning the zoomed picture: a mouse drag (a press that does not move stays a click, which plays
  // or pauses through the preview's own gesture), or the arrow keys while the picture has focus.
  const pan = useRef<{ x: number; y: number; view: View } | null>(null);
  const panBy = (dx: number, dy: number, from: View) => {
    if (!boxSize || !content) return;
    setView(clampView(boxSize, content, { scale: from.scale, x: from.x + dx, y: from.y + dy }));
  };
  const onPanDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!e.isPrimary || e.pointerType !== "mouse" || e.button !== 0) return;
    pan.current = { x: e.clientX, y: e.clientY, view };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const fade = (hidden: boolean) =>
    hidden ? "opacity-0 duration-(--duration-fast)" : "opacity-100 duration-(--duration-base)";

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden rounded-lg transition-opacity ease-(--ease-out)",
        shownNow
          ? "opacity-100 duration-(--duration-base)"
          : "opacity-0 duration-(--duration-fast)",
      )}
      data-testid="compare"
      data-open={open ? "1" : undefined}
      data-layout={side ? "side-by-side" : "wipe"}
      data-ready={ready ? "1" : undefined}
    >
      {url && (
        <video
          ref={followerRef}
          src={url}
          muted
          playsInline
          preload="auto"
          aria-hidden
          tabIndex={-1}
          data-testid="compare-source"
          className="absolute"
          style={
            pair
              ? {
                  left: pair.before.left,
                  top: pair.before.top,
                  width: pair.before.width,
                  height: pair.before.height,
                  visibility: ready ? "visible" : "hidden",
                }
              : {
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  transform: masterTransform,
                  clipPath:
                    boxSize && area
                      ? `inset(0 ${clipRight(boxSize, masterView, line).toFixed(2)}px 0 0)`
                      : "inset(0 100% 0 0)",
                  visibility: ready && wipe ? "visible" : "hidden",
                }
          }
        />
      )}
      {ready && pair && (
        <>
          <span
            aria-hidden
            className={LABEL}
            style={{ left: pair.before.left + 8, top: pair.before.top + 8 }}
          >
            Before
          </span>
          <span
            aria-hidden
            className={LABEL}
            style={{ left: pair.after.left + 8, top: pair.after.top + 8 }}
          >
            After
          </span>
        </>
      )}
      {ready && wipe && area && (
        <>
          {zoomed && open && (
            <div
              role="application"
              aria-roledescription="zoomed picture"
              aria-label="Zoomed picture. Arrow keys move the view."
              // biome-ignore lint/a11y/noNoninteractiveTabindex: a two-axis pan surface (role application); arrows move the zoomed view
              tabIndex={0}
              className="pointer-events-auto absolute inset-0 cursor-grab outline-none focus-visible:stage-focus active:cursor-grabbing"
              onPointerDown={onPanDown}
              onPointerMove={(e) => {
                const p = pan.current;
                if (p) panBy(e.clientX - p.x, e.clientY - p.y, p.view);
              }}
              onPointerUp={() => {
                pan.current = null;
              }}
              onPointerCancel={() => {
                pan.current = null;
              }}
              onKeyDown={(e) => {
                const step =
                  (e.shiftKey ? 0.5 : 0.15) * Math.min(boxSize?.width ?? 0, boxSize?.height ?? 0);
                const d =
                  e.key === "ArrowLeft"
                    ? [step, 0]
                    : e.key === "ArrowRight"
                      ? [-step, 0]
                      : e.key === "ArrowUp"
                        ? [0, step]
                        : e.key === "ArrowDown"
                          ? [0, -step]
                          : undefined;
                if (!d) return;
                e.preventDefault();
                e.stopPropagation();
                panBy(d[0] ?? 0, d[1] ?? 0, view);
              }}
            />
          )}
          <div
            className="absolute"
            style={{ left: area.left, top: area.top, width: area.width, height: area.height }}
          >
            <span aria-hidden className={cn(LABEL, "top-2 left-2", fade(split < 0.12))}>
              Before
            </span>
            <span aria-hidden className={cn(LABEL, "top-2 right-2", fade(split > 0.88))}>
              After
            </span>
            <span
              aria-hidden
              className="-translate-x-1/2 pointer-events-none absolute inset-y-0 w-0.5 bg-gray-0 outline outline-1 outline-gray-1000/70"
              style={{ left: `${split * 100}%` }}
            />
            {/* The divider's presses and taps are its own: they never reach the preview's tap to play. */}
            <div
              role="slider"
              tabIndex={0}
              aria-labelledby={labelId}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              aria-valuetext={`${pct}% shows the original`}
              data-testid="compare-divider"
              // Vertical swipes on the strip still scroll the page (the browser then cancels the
              // pointer, which ends the drag); a sideways drag moves the split.
              className="group -translate-x-1/2 pointer-events-auto absolute inset-y-0 flex w-11 cursor-ew-resize touch-pan-y items-center justify-center outline-none"
              style={{ left: grab }}
              onPointerDown={(e) => {
                e.stopPropagation();
                if (!e.isPrimary) return;
                dragging.current = true;
                e.currentTarget.setPointerCapture(e.pointerId);
                // A finger may be starting a scroll: the split moves only once it moves sideways.
                if (e.pointerType !== "touch") fromPointer(e.clientX);
              }}
              onPointerMove={(e) => {
                if (dragging.current) fromPointer(e.clientX);
              }}
              onPointerUp={(e) => {
                e.stopPropagation();
                dragging.current = false;
              }}
              onPointerCancel={() => {
                dragging.current = false;
              }}
              onDoubleClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                const step = e.shiftKey ? 0.2 : 0.05;
                if (e.key === "ArrowLeft") setSplit((s) => Math.max(0, s - step));
                else if (e.key === "ArrowRight") setSplit((s) => Math.min(1, s + step));
                else if (e.key === "Home") setSplit(0);
                else if (e.key === "End") setSplit(1);
                else return;
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <span id={labelId} className="sr-only">
                Before and after divider
              </span>
              <span
                className="absolute flex h-11 w-3 items-center justify-center rounded-sm bg-gray-0 group-focus-visible:stage-focus"
                style={{ left: `calc(50% + ${split * area.width - grab}px - 6px)` }}
              >
                <span className="h-4 w-0.5 rounded-full bg-gray-900" />
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
