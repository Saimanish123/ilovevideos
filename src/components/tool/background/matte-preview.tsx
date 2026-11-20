"use client";

import { type RefObject, useEffect, useRef } from "react";
import { drawBackground } from "@/tools/engines/chroma-key/background";
import { backgroundTime } from "@/tools/engines/chroma-key/options";
import {
  modelFor,
  type PortraitMatteOptions,
  type Size,
} from "@/tools/engines/portrait-matte/options";
import { createMatteRenderer, type MatteRenderer } from "@/tools/engines/portrait-matte/render";
import { steady, toBytes } from "@/tools/engines/portrait-matte/smooth";
import { SegmentClient } from "@/tools/workers/segment-client";
import { useContentRect } from "../crop/use-content-rect";

/** Longest edge of the preview canvas. */
const MAX_EDGE = 1280;

export type MatteState =
  | { state: "loading" }
  | { state: "ready" }
  | { state: "failed"; reason: string };

/**
 * The background tools' live result over the preview picture, drawn with the engine's own renderer
 * (portrait-matte/render) from the engine's own model, which runs in a preview worker
 * (workers/segment.worker) loaded when the file is chosen. Each painted frame is scaled to the
 * model's size here, measured there, and drawn when its mask returns; frames that arrive meanwhile
 * are skipped, so the preview keeps up on slow devices. While the video plays, each mask is steadied
 * with the previous one, as the engine does; the engine also uses the next frame, which a preview
 * cannot know. Without WebGL 2 nothing is drawn and `onState` says why.
 */
export function MattePreview({
  video,
  source,
  value,
  onState,
}: {
  video: RefObject<HTMLVideoElement | null>;
  source: Size;
  value: PortraitMatteOptions;
  onState: (s: MatteState) => void;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  const holderRef = useRef<HTMLDivElement>(null);
  const box = useContentRect(layerRef, source);
  const latest = useRef(value);
  latest.current = value;
  const onStateRef = useRef(onState);
  onStateRef.current = onState;
  const drawRef = useRef<() => void>(() => undefined);
  const bgRef = useRef<{ image?: ImageBitmap; video?: HTMLVideoElement }>({});
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
      const redraw = () => {
        backDirty.current = true;
        drawRef.current();
      };
      el.addEventListener("seeked", redraw);
      el.addEventListener("loadeddata", redraw);
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
    const holder = holderRef.current;
    if (!holder || source.width <= 0 || source.height <= 0) return;
    // A canvas per run: a context lost on cleanup (React runs effects twice in development) cannot
    // be had again from the same element.
    const canvas = document.createElement("canvas");
    canvas.className = "block size-full";
    holder.append(canvas);
    const scale = Math.min(1, MAX_EDGE / Math.max(source.width, source.height));
    const size = {
      width: Math.max(1, Math.round(source.width * scale)),
      height: Math.max(1, Math.round(source.height * scale)),
    };
    let renderer: MatteRenderer | null = null;
    try {
      renderer = createMatteRenderer(canvas, size, scale);
    } catch (e) {
      // A shader that does not compile here is a bug, not a missing feature: say so in the console.
      console.error(e);
      renderer = null;
    }
    if (!renderer) {
      onStateRef.current({
        state: "failed",
        reason: "This browser cannot find the person in a video. Try a current Chrome or Edge.",
      });
      return;
    }
    const r = renderer;
    const back = document.createElement("canvas");
    back.width = size.width;
    back.height = size.height;
    const b2d = back.getContext("2d", { alpha: false });
    const kind = modelFor(source.width, source.height);
    const client = new SegmentClient();
    let model: Size | undefined;
    let small: CanvasRenderingContext2D | null = null;
    let alive = true;
    let busy = false;
    let again = false;
    let previous: { t: number; mask: Float32Array } | undefined;
    let bytes: Uint8Array | undefined;
    let el: HTMLVideoElement | null = null;
    let vfc = 0;
    let raf = 0;
    onStateRef.current({ state: "loading" });
    client.load(kind).then(
      (s) => {
        if (!alive) return;
        model = s;
        const c = document.createElement("canvas");
        c.width = s.width;
        c.height = s.height;
        small = c.getContext("2d", { alpha: false });
        drawRef.current();
      },
      (e: Error) => {
        if (!alive) return;
        // The cause goes to the console for a bug report; the page says what to do.
        console.error(e);
        onStateRef.current({
          state: "failed",
          reason:
            "The person finder could not start in this browser. Reload the page, or try desktop Chrome or Edge.",
        });
      },
    );

    const drawBack = () => {
      if (!b2d) return;
      const o = latest.current;
      const holder = bgRef.current;
      const look = { color: o.color, fit: o.fit };
      if (o.effect === "image" && o.background.kind === "image" && holder.image) {
        const img = holder.image;
        drawBackground(b2d, size, look, {
          width: img.width,
          height: img.height,
          draw: (c, x, y, w, h) => c.drawImage(img, x, y, w, h),
        });
      } else if (
        o.effect === "video" &&
        o.background.kind === "video" &&
        holder.video &&
        holder.video.readyState >= 2
      ) {
        const bv = holder.video;
        drawBackground(b2d, size, look, {
          width: bv.videoWidth,
          height: bv.videoHeight,
          draw: (c, x, y, w, h) => c.drawImage(bv, x, y, w, h),
        });
      } else drawBackground(b2d, size, look);
    };

    const draw = async () => {
      const v = video.current;
      if (!alive || !model || !small || !v || v.readyState < 2) return;
      if (busy) {
        again = true;
        return;
      }
      busy = true;
      try {
        const t = v.currentTime;
        small.imageSmoothingEnabled = true;
        small.imageSmoothingQuality = "high";
        small.drawImage(v, 0, 0, model.width, model.height);
        const frame = await createImageBitmap(small.canvas);
        const { mask, ms } = await client.segment(frame);
        if (!alive) return;
        // Consecutive frames of playback lean on the last mask, as the engine's do.
        const dt = t - (previous?.t ?? Number.NEGATIVE_INFINITY);
        if (previous && !v.paused && dt > 0 && dt < 0.25) steady(mask, previous.mask, undefined);
        previous = { t, mask };
        bytes = toBytes(mask, bytes?.length === mask.length ? bytes : undefined);
        const o = latest.current;
        const playingBg = o.effect === "video" && o.background.kind === "video";
        const changed = backDirty.current || playingBg;
        if (changed) drawBack();
        r.render(
          v,
          source,
          { data: bytes, width: model.width, height: model.height },
          back,
          o,
          changed,
        );
        backDirty.current = false;
        holder.dataset.drawn = "1";
        holder.dataset.inferMs = ms.toFixed(1);
        onStateRef.current({ state: "ready" });
      } catch (e) {
        if (alive) {
          console.error(e);
          onStateRef.current({
            state: "failed",
            reason:
              "The person finder stopped while reading the video. Reload the page and try again.",
          });
        }
      } finally {
        busy = false;
        if (again && alive) {
          again = false;
          void draw();
        }
      }
    };
    drawRef.current = () => void draw();

    const syncBg = (playing: boolean) => {
      const o = latest.current;
      const bv = bgRef.current.video;
      const v = video.current;
      if (o.effect !== "video" || o.background.kind !== "video" || !bv || !v) return;
      const t = backgroundTime(v.currentTime, o.background.durationSec, o.bgEnd);
      if (Math.abs(bv.currentTime - t) > 0.15) bv.currentTime = t;
      bv.loop = o.bgEnd === "loop";
      if (playing) void bv.play().catch(() => undefined);
      else bv.pause();
    };
    const tick = () => {
      void draw();
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
      void draw();
    };
    const onSeeked = () => {
      syncBg(!el?.paused);
      void draw();
    };
    const onLoaded = () => void draw();
    const attach = () => {
      el = video.current;
      if (!el) {
        raf = requestAnimationFrame(attach);
        return;
      }
      el.addEventListener("play", onPlay);
      el.addEventListener("pause", onPause);
      el.addEventListener("seeked", onSeeked);
      el.addEventListener("loadeddata", onLoaded);
      el.addEventListener("canplay", onLoaded);
      void draw();
      if (!el.paused) onPlay();
    };
    attach();
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      if (el) {
        if (vfc && "cancelVideoFrameCallback" in el) el.cancelVideoFrameCallback(vfc);
        el.removeEventListener("play", onPlay);
        el.removeEventListener("pause", onPause);
        el.removeEventListener("seeked", onSeeked);
        el.removeEventListener("loadeddata", onLoaded);
        el.removeEventListener("canplay", onLoaded);
      }
      drawRef.current = () => undefined;
      client.dispose();
      r.dispose();
      delete holder.dataset.drawn;
      canvas.remove();
    };
  }, [video, source]);

  // Options changed: draw again (the background may look different).
  const b = value.background;
  const optionsKey = `${value.effect}|${value.blur}|${value.color.join(",")}|${value.fit}|${value.bgEnd}|${value.edge}|${value.shift}|${value.output}|${b.kind === "color" ? "" : b.name}`;
  useEffect(() => {
    if (optionsKey) backDirty.current = true;
    drawRef.current();
  }, [optionsKey]);

  return (
    <div ref={layerRef} className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg">
      <div
        ref={holderRef}
        aria-hidden
        data-testid="matte-preview"
        className="absolute opacity-0 data-drawn:opacity-100"
        style={
          box
            ? { left: box.left, top: box.top, width: box.width, height: box.height }
            : { display: "none" }
        }
      />
    </div>
  );
}
