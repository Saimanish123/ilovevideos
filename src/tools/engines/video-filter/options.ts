/**
 * Options of the two engines on the per-frame filter runner, and the colour transform they resolve
 * to. Pure; shared by the worker engines, the ffmpeg runner and the panels.
 *
 * - `filter`: one colour transform for the whole clip. `job` says which page's control drives it:
 *   a black-and-white variant, a colour look, or brightness/contrast/saturation sliders.
 * - `video-fade`: the picture fades from and to a colour over the first and last seconds, and the
 *   sound can fade with it.
 */
import { z } from "zod";
import { adjustTransform, type ColorTransform, isIdentity } from "./color";
import { lookIds, looks, lookTransform } from "./looks";

export const FilterOptions = z.object({
  job: z.enum(["mono", "look", "adjust"]).default("look"),
  look: z.enum(lookIds).default("neutral"),
  /** 0–1: how much of the look is applied. */
  strength: z.number().min(0).max(1).default(1),
  brightness: z.number().min(-1).max(1).default(0),
  contrast: z.number().min(-1).max(1).default(0),
  saturation: z.number().min(-1).max(1).default(0),
});
export type FilterOptions = z.infer<typeof FilterOptions>;

export function filterTransform(o: FilterOptions): ColorTransform {
  if (o.job === "adjust")
    return adjustTransform({
      brightness: o.brightness,
      contrast: o.contrast,
      saturation: o.saturation,
    });
  return lookTransform(o.look, o.strength);
}

export const filterIsNoop = (o: FilterOptions) => isIdentity(filterTransform(o));

/** File name suffix: "-bw", "-sepia", "-adjusted". */
export function filterSuffix(o: FilterOptions): string {
  if (o.job === "adjust") return "adjusted";
  if (o.job === "mono" || o.look === "mono") return "bw";
  return o.look;
}

/** First words of the result line for a filter run. */
export function filterWhat(o: FilterOptions): string {
  if (o.job === "adjust") return "brightness, contrast and saturation adjusted";
  const name = looks[o.look].label.toLowerCase();
  const strength = o.strength < 1 ? ` at ${Math.round(o.strength * 100)}%` : "";
  return o.job === "mono" ? `black and white, ${name}${strength}` : `${name}${strength}`;
}

/** Longest fade either end, seconds. */
export const MAX_FADE = 10;

export const FadeOptions = z.object({
  /** Seconds at the start fading in from the colour; 0 for none. */
  fadeIn: z.number().min(0).max(MAX_FADE).default(1),
  /** Seconds at the end fading out to the colour; 0 for none. */
  fadeOut: z.number().min(0).max(MAX_FADE).default(1),
  color: z.enum(["black", "white"]).default("black"),
  /** Fade the sound in and out over the same seconds. */
  audio: z.boolean().default(true),
});
export type FadeOptions = z.infer<typeof FadeOptions>;

export const FADE_RGB: Record<FadeOptions["color"], [number, number, number]> = {
  black: [0, 0, 0],
  white: [1, 1, 1],
};

/**
 * The two fades fitted to the clip: neither is longer than the clip, and together they never
 * overlap (each keeps its share when the user asks for more than the clip holds).
 */
export function fitFades(o: Pick<FadeOptions, "fadeIn" | "fadeOut">, duration: number) {
  const d = Math.max(0, duration);
  let fadeIn = Math.min(o.fadeIn, d);
  let fadeOut = Math.min(o.fadeOut, d);
  if (fadeIn + fadeOut > d && fadeIn + fadeOut > 0) {
    const k = d / (fadeIn + fadeOut);
    fadeIn *= k;
    fadeOut *= k;
  }
  return { fadeIn, fadeOut };
}

/**
 * How much of the picture shows at time `t` (0–1): a linear ramp up over the fade in, full in the
 * middle, a linear ramp down over the fade out, reaching 0 at the clip's end. `t` is the middle of
 * a frame, so the first frame is not fully black on a short fade and the last one is nearly so.
 */
export function fadeAmount(t: number, duration: number, fadeIn: number, fadeOut: number): number {
  let a = 1;
  if (fadeIn > 0 && t < fadeIn) a = Math.min(a, Math.max(0, t / fadeIn));
  const left = duration - t;
  if (fadeOut > 0 && left < fadeOut) a = Math.min(a, Math.max(0, left / fadeOut));
  return a;
}

export const fadeIsNoop = (o: FadeOptions) => o.fadeIn <= 0 && o.fadeOut <= 0;
