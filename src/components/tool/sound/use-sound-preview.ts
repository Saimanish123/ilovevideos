"use client";

import { type RefObject, useEffect, useRef } from "react";

interface Graph {
  ctx: AudioContext;
  gain: GainNode;
  /** A fast compressor standing in for the limiter while previewing, so a boost does not crackle. */
  guard: DynamicsCompressorNode;
}

/** Each media element can be routed into Web Audio only once, so the graph is kept per element. */
const graphs = new WeakMap<HTMLMediaElement, Graph>();

function graphFor(el: HTMLMediaElement): Graph | undefined {
  const existing = graphs.get(el);
  if (existing) return existing;
  const Ctx =
    typeof window === "undefined"
      ? undefined
      : (window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (!Ctx) return undefined;
  try {
    const ctx = new Ctx();
    const source = ctx.createMediaElementSource(el);
    const gain = ctx.createGain();
    const guard = ctx.createDynamicsCompressor();
    guard.threshold.value = -1;
    guard.knee.value = 0;
    guard.ratio.value = 20;
    guard.attack.value = 0.003;
    guard.release.value = 0.08;
    source.connect(gain).connect(guard).connect(ctx.destination);
    const graph = { ctx, gain, guard };
    graphs.set(el, graph);
    return graph;
  } catch {
    return undefined;
  }
}

/**
 * Plays the preview (the stage's video, or the audio hero's element) through a gain that follows
 * `gainAt(currentTime)`, so the ready state sounds like the result: louder, quieter, fading. The
 * graph is built on the first play (a user gesture, so the audio context may start). Nothing is
 * decoded or sent anywhere; the browser plays the file as it would, turned up or down.
 * `gainAt` undefined leaves playback as it is.
 */
export function useSoundPreview(
  media: RefObject<HTMLMediaElement | null> | undefined,
  gainAt: ((t: number) => number) | undefined,
) {
  const gainRef = useRef(gainAt);
  gainRef.current = gainAt;
  useEffect(() => {
    let raf = 0;
    let tries = 0;
    let el: HTMLMediaElement | null = null;
    let graph: Graph | undefined;
    const apply = () => {
      if (!graph || !el) return;
      const g = gainRef.current?.(el.currentTime) ?? 1;
      graph.gain.gain.setTargetAtTime(Math.max(0, g), graph.ctx.currentTime, 0.01);
    };
    const loop = () => {
      apply();
      if (el && !el.paused) raf = requestAnimationFrame(loop);
    };
    const onPlay = () => {
      if (!el) return;
      graph ??= gainRef.current ? graphFor(el) : undefined;
      if (graph?.ctx.state === "suspended") void graph.ctx.resume();
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
    };
    const attach = () => {
      el = media?.current ?? null;
      if (!el) {
        if (tries++ < 120) raf = requestAnimationFrame(attach);
        return;
      }
      graph = graphs.get(el);
      el.addEventListener("play", onPlay);
      el.addEventListener("seeked", apply);
      apply();
    };
    attach();
    return () => {
      cancelAnimationFrame(raf);
      el?.removeEventListener("play", onPlay);
      el?.removeEventListener("seeked", apply);
      // Leave the element as it plays without the tool: unity gain.
      if (graph) graph.gain.gain.value = 1;
    };
  }, [media]);
  // A new gain applies at once, also while paused.
  useEffect(() => {
    const el = media?.current;
    const graph = el ? graphs.get(el) : undefined;
    if (el && graph) {
      const g = gainAt?.(el.currentTime) ?? 1;
      graph.gain.gain.setTargetAtTime(Math.max(0, g), graph.ctx.currentTime, 0.01);
    }
  }, [media, gainAt]);
}
