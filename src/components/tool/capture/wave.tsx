"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "./reduced-motion";

const STEP = 4;

/**
 * The sound as it is recorded: one bar per 50 ms of peak level on the dark stage, newest on the
 * right, scrolling. With reduced motion nothing scrolls: bars fill from the left, a full row starts
 * a new page, and the canvas is redrawn four times a second. Stops while paused. Drawn in the
 * canvas's own text colour (a stage token), read once.
 */
export function LiveWave({ track, running }: { track?: MediaStreamTrack; running: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const peaks = useRef<number[]>([]);
  const runningRef = useRef(running);
  runningRef.current = running;
  const reduce = useReducedMotion();
  useEffect(() => {
    if (track?.readyState !== "live") return;
    const el = canvas.current;
    if (!el) return;
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(new MediaStream([track]));
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    src.connect(analyser);
    const data = new Float32Array(analyser.fftSize);
    const colour = getComputedStyle(el).color;
    let page = 0;
    const draw = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      if (el.width !== Math.round(w * dpr)) el.width = Math.round(w * dpr);
      if (el.height !== Math.round(h * dpr)) el.height = Math.round(h * dpr);
      const g = el.getContext("2d");
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      g.fillStyle = colour;
      const count = Math.max(1, Math.floor(w / STEP));
      const all = peaks.current;
      let shown: number[];
      let x0: (i: number, n: number) => number;
      if (reduce) {
        // Pages: the current row fills from the left; a full row starts the next one.
        page = Math.floor(Math.max(0, all.length - 1) / count);
        shown = all.slice(page * count);
        x0 = (i) => i * STEP;
      } else {
        shown = all.slice(-count);
        x0 = (i, n) => w - (n - i) * STEP;
      }
      if (all.length > count * 4) {
        const keep = reduce ? all.length % count || count : count;
        peaks.current = all.slice(-keep);
      }
      shown.forEach((p, i) => {
        // Square root scale: quiet speech stays visible next to loud.
        const bh = Math.max(1, Math.sqrt(Math.min(1, p)) * (h - 8));
        g.fillRect(x0(i, shown.length), (h - bh) / 2, STEP - 1, bh);
      });
    };
    const sample = setInterval(() => {
      if (!runningRef.current) return;
      analyser.getFloatTimeDomainData(data);
      let peak = 0;
      for (const v of data) peak = Math.max(peak, Math.abs(v));
      peaks.current.push(peak);
      if (!reduce) draw();
    }, 50);
    const slow = reduce ? setInterval(draw, 250) : undefined;
    return () => {
      clearInterval(sample);
      if (slow) clearInterval(slow);
      src.disconnect();
      void ctx.close();
    };
  }, [track, reduce]);
  return <canvas ref={canvas} aria-hidden className="h-full w-full text-gray-200" />;
}
