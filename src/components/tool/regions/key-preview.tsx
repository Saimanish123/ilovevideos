"use client";

import { type RefObject, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { drawBackground } from "@/tools/engines/chroma-key/background";
import {
  backgroundTime,
  type ChromaKeyOptions,
  detectKey,
  patchColor,
  type Rgb,
  type Size,
} from "@/tools/engines/chroma-key/options";
import { createKeyRenderer, type KeyRenderer } from "@/tools/engines/chroma-key/render";
import { useContentRect } from "../crop/use-content-rect";

/** Longest edge of the preview canvas. */
const MAX_EDGE = 1280;

/**
 * The green screen's live result over the preview picture, drawn with the engine's own keyer
 * (chroma-key/render) on every painted frame, on seeks and when the options change. The background
 * is drawn the engine's way (chroma-key/background): a colour, a picture, or a background video
 * that plays along, looping or holding its last frame, and is put to the foreground's time on every
 * seek. Tapping the picture picks the screen colour under the finger (a 5×5 average of the camera
 * frame, not the result); the first frame's edges set it automatically (`keyFrom: "default"`).
 * Without WebGL 2 it draws nothing and the plain video shows through.
 */
export function KeyPreview({
  video,
  source,
  value,
  onKey,
  disabled,
}: {
  video: RefObject<HTMLVideoElement | null>;
  source: Size;
  value: ChromaKeyOptions;
  onKey: (key: Rgb, from: "auto" | "picked" | "none") => void;
  disabled?: boolean;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const box = useContentRect(layerRef, source);
  const latest = useRef(value);
  latest.current = value;
  const onKeyRef = useRef(onKey);
  onKeyRef.current = onKey;
  const drawRef = useRef<() => void>(() => undefined);
  const scratchRef = useRef<{ c2d: CanvasRenderingContext2D; size: Size } | null>(null);
  const bgRef = useRef<{
    image?: ImageBitmap;
    video?: HTMLVideoElement;
  }>({});
  const backDirty = useRef(true);

  const bg = value.background;
  const bgBlob = bg.kind === "color" ? undefined : bg.blob;

  // The background picture or video, read once per file.
  useEffect(() => {
    let live = true;
    let url: string | undefined;
    const holder = bgRef.current;
    if (bg.kind === "image" && bgBlob) {
      void createImageBitmap(bgBlob).then((img) => {
        if (!live) {
          img.close();
          return;
        }
        holder.image = img;
        backDirty.current = true;
        drawRef.current();
      });
    } else if (bg.kind === "video" && bgBlob) {
      const el = document.createElement("video");
      url = URL.createObjectURL(bgBlob);
      el.src = url;
      el.muted = true;
      el.playsInline = true;
      el.preload = "auto";
      el.addEventListener("seeked", () => {
        backDirty.current = true;
        drawRef.current();
      });
      el.addEventListener("loadeddata", () => {
        backDirty.current = true;
        drawRef.current();
      });
      holder.video = el;
    }
    backDirty.current = true;
    drawRef.current();
    return () => {
      live = false;
      holder.image?.close();
      holder.image = undefined;
      if (holder.video) {
        holder.video.pause();
        holder.video.removeAttribute("src");
        holder.video.load();
      }
      holder.video = undefined;
      if (url) URL.revokeObjectURL(url);
    };
  }, [bg.kind, bgBlob]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || source.width <= 0 || source.height <= 0) return;
    const scale = Math.min(1, MAX_EDGE / Math.max(source.width, source.height));
    const size = {
      width: Math.max(1, Math.round(source.width * scale)),
      height: Math.max(1, Math.round(source.height * scale)),
    };
    // Without WebGL 2 there is no live result, but the colour is still found and picked here.
    let keyer: KeyRenderer | null = null;
    try {
      keyer = createKeyRenderer(canvas, size, scale);
    } catch {
      keyer = null;
    }
    const scratch = document.createElement("canvas");
    scratch.width = size.width;
    scratch.height = size.height;
    const c2d = scratch.getContext("2d", { alpha: false, willReadFrequently: true });
    const back = document.createElement("canvas");
    back.width = size.width;
    back.height = size.height;
    const b2d = back.getContext("2d", { alpha: false });
    if (!c2d || !b2d) return;
    scratchRef.current = { c2d, size };
    const k = keyer;
    let el: HTMLVideoElement | null = null;
    let vfc = 0;
    let raf = 0;
    const drawBack = () => {
      const o = latest.current;
      const holder = bgRef.current;
      const scaled = { ...o };
      if (o.background.kind === "image" && holder.image) {
        const img = holder.image;
        drawBackground(b2d, size, scaled, {
          width: img.width,
          height: img.height,
          draw: (c, x, y, w, h) => c.drawImage(img, x, y, w, h),
        });
      } else if (o.background.kind === "video" && holder.video && holder.video.readyState >= 2) {
        const bv = holder.video;
        drawBackground(b2d, size, scaled, {
          width: bv.videoWidth,
          height: bv.videoHeight,
          draw: (c, x, y, w, h) => c.drawImage(bv, x, y, w, h),
        });
      } else drawBackground(b2d, size, scaled);
    };
    const draw = () => {
      const v = video.current;
      if (!v || v.readyState < 2) return;
      c2d.drawImage(v, 0, 0, size.width, size.height);
      const o = latest.current;
      if (o.keyFrom === "default") {
        const found = detectKey(
          c2d.getImageData(0, 0, size.width, size.height).data,
          size.width,
          size.height,
        );
        onKeyRef.current(found?.key ?? o.key, found ? "auto" : "none");
      }
      const playingBg = o.background.kind === "video";
      if (backDirty.current || playingBg) drawBack();
      k?.render(scratch, source, back, o, backDirty.current || playingBg);
      backDirty.current = false;
      if (k) canvas.dataset.drawn = "1";
    };
    drawRef.current = draw;
    const syncBg = (playing: boolean) => {
      const o = latest.current;
      const bv = bgRef.current.video;
      const v = video.current;
      if (o.background.kind !== "video" || !bv || !v) return;
      const t = backgroundTime(v.currentTime, o.background.durationSec, o.bgEnd);
      if (Math.abs(bv.currentTime - t) > 0.15) bv.currentTime = t;
      bv.loop = o.bgEnd === "loop";
      if (playing) void bv.play().catch(() => undefined);
      else bv.pause();
    };
    const tick = () => {
      draw();
      if (!el || el.paused) return;
      if ("requestVideoFrameCallback" in el) vfc = el.requestVideoFrameCallback(tick);
      else raf = requestAnimationFrame(tick);
    };
    const onPlay = () => {
      syncBg(true);
      tick();
    };
    const onPause = () => {
      syncBg(false);
      draw();
    };
    const onSeeked = () => {
      syncBg(!el?.paused);
      draw();
    };
    const attach = () => {
      el = video.current;
      if (!el) {
        raf = requestAnimationFrame(attach);
        return;
      }
      el.addEventListener("play", onPlay);
      el.addEventListener("pause", onPause);
      el.addEventListener("seeked", onSeeked);
      el.addEventListener("loadeddata", draw);
      el.addEventListener("canplay", draw);
      draw();
      if (!el.paused) onPlay();
      // A slow decoder may have its first frame ready without another event reaching us: look
      // again on animation frames until something is drawn (about 10 s at most).
      let tries = 0;
      const firstFrame = () => {
        if (scratchRef.current && video.current && video.current.readyState >= 2) {
          draw();
          return;
        }
        if (tries++ < 600) raf = requestAnimationFrame(firstFrame);
      };
      raf = requestAnimationFrame(firstFrame);
    };
    attach();
    return () => {
      cancelAnimationFrame(raf);
      if (el) {
        if (vfc && "cancelVideoFrameCallback" in el) el.cancelVideoFrameCallback(vfc);
        el.removeEventListener("play", onPlay);
        el.removeEventListener("pause", onPause);
        el.removeEventListener("seeked", onSeeked);
        el.removeEventListener("loadeddata", draw);
        el.removeEventListener("canplay", draw);
      }
      drawRef.current = () => undefined;
      scratchRef.current = null;
      k?.dispose();
    };
  }, [video, source]);

  // Options changed: the background may look different; draw again.
  const optionsKey = `${value.key.join(",")}|${value.tolerance}|${value.softness}|${value.spill}|${value.color.join(",")}|${value.fit}|${value.bgEnd}|${value.keyFrom}`;
  useEffect(() => {
    if (optionsKey) backDirty.current = true;
    drawRef.current();
  }, [optionsKey]);

  // A pick is a tap or click: the primary pointer, lifted within 8 px of where it went down. A
  // scroll that starts on the picture moves further (or is cancelled) and picks nothing.
  const down = useRef<{ id: number; x: number; y: number } | null>(null);
  // The mark appears at once and fades out over the fast duration token (design system §6.3).
  const [mark, setMark] = useState<{ x: number; y: number; n: number; out?: boolean }>();
  const markN = mark?.n;
  useEffect(() => {
    if (markN === undefined) return;
    const fade = setTimeout(
      () => setMark((m) => (m && m.n === markN ? { ...m, out: true } : m)),
      550,
    );
    const gone = setTimeout(() => setMark((m) => (m && m.n === markN ? undefined : m)), 700);
    return () => {
      clearTimeout(fade);
      clearTimeout(gone);
    };
  }, [markN]);
  const onDown = (e: React.PointerEvent) => {
    down.current =
      !disabled && e.isPrimary && e.button === 0
        ? { id: e.pointerId, x: e.clientX, y: e.clientY }
        : null;
  };
  const onUp = (e: React.PointerEvent) => {
    const d = down.current;
    down.current = null;
    if (!d || d.id !== e.pointerId || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) return;
    if (disabled || !box) return;
    const s = scratchRef.current;
    const r = layerRef.current?.getBoundingClientRect();
    if (!s || !r) return;
    const px = e.clientX - r.left - box.left;
    const py = e.clientY - r.top - box.top;
    const x = (px / box.width) * s.size.width;
    const y = (py / box.height) * s.size.height;
    if (x < 0 || y < 0 || x > s.size.width || y > s.size.height) return;
    const data = s.c2d.getImageData(0, 0, s.size.width, s.size.height).data;
    onKeyRef.current(patchColor(data, s.size.width, s.size.height, x, y), "picked");
    setMark({ x: box.left + px, y: box.top + py, n: (mark?.n ?? 0) + 1 });
  };

  return (
    <div ref={layerRef} className="absolute inset-0 overflow-hidden rounded-lg">
      {/* Tapping is a shortcut; the panel's colour field and Detect again do the same from the keyboard. */}
      <canvas
        ref={canvasRef}
        aria-hidden
        data-testid="key-preview"
        onPointerDown={onDown}
        onPointerUp={onUp}
        onPointerCancel={() => {
          down.current = null;
        }}
        className={disabled ? "absolute" : "absolute cursor-crosshair"}
        style={
          box
            ? { left: box.left, top: box.top, width: box.width, height: box.height }
            : { display: "none" }
        }
      />
      {mark && (
        // Where the colour was taken from, for a moment.
        <span
          key={mark.n}
          aria-hidden
          className={cn(
            "-translate-x-1/2 -translate-y-1/2 pointer-events-none absolute size-6 rounded-full border border-gray-0 outline outline-1 outline-gray-1000/70 transition-opacity duration-(--duration-fast) ease-(--ease-out) motion-reduce:transition-none",
            mark.out && "opacity-0",
          )}
          style={{ left: mark.x, top: mark.y }}
        />
      )}
    </div>
  );
}
