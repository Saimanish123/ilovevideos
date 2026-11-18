/**
 * The looks the filter engine offers, as data: each one is a colour transform (./color), nothing
 * more. Kept free of zod and mediabunny so the idle state and the preview can import it. The names
 * say what the transform does; none of them claims to emulate a film stock or a camera.
 */
import {
  type ColorTransform,
  channels,
  compose,
  contrast,
  liftBlacks,
  mixMatrix,
  mono,
  saturation,
} from "./color";

/** Black and white variants (black-and-white-video). */
export const monoLookIds = ["neutral", "contrast", "red", "soft"] as const;
/** Colour looks (add-filter-to-video). "mono" is the neutral black and white, for completeness. */
export const colorLookIds = ["sepia", "warm", "cool", "vivid", "faded", "mono"] as const;
export const lookIds = [...monoLookIds, ...colorLookIds] as const;
export type LookId = (typeof lookIds)[number];
export type MonoLookId = (typeof monoLookIds)[number];
export type ColorLookId = (typeof colorLookIds)[number];

export interface Look {
  label: string;
  /** What it does, in a few words, for the picker. */
  detail: string;
  transform: ColorTransform;
}

const flat = (matrix: number[], gamma = 1): ColorTransform => ({
  gamma: [gamma, gamma, gamma],
  matrix,
});

/** CSS `sepia(1)`: the Filter Effects spec matrix. */
const SEPIA = [0.393, 0.769, 0.189, 0, 0.349, 0.686, 0.168, 0, 0.272, 0.534, 0.131, 0];
const NEUTRAL = mono([0.2126, 0.7152, 0.0722]);

export const looks: Record<LookId, Look> = {
  neutral: {
    label: "Neutral",
    detail: "Brightness as the eye sees it",
    transform: flat(NEUTRAL),
  },
  contrast: {
    label: "High contrast",
    detail: "Deeper blacks, brighter whites",
    transform: flat(compose(NEUTRAL, contrast(1.35))),
  },
  red: {
    label: "Red filter",
    detail: "Darker skies, smoother skin",
    // Mostly red, some green, no blue: blue subjects go dark, as with a red filter on black-and-white film.
    transform: flat(mono([0.65, 0.35, 0])),
  },
  soft: {
    label: "Soft",
    detail: "Gentle contrast, lifted shadows",
    transform: flat(compose(NEUTRAL, contrast(0.85)), 0.9),
  },
  sepia: {
    label: "Sepia",
    detail: "Brown-toned monochrome",
    transform: flat(SEPIA),
  },
  warm: {
    label: "Warm",
    detail: "More red and yellow",
    transform: flat(compose(channels([1.06, 1.01, 0.9], [0.015, 0, 0]), saturation(1.05))),
  },
  cool: {
    label: "Cool",
    detail: "More blue",
    transform: flat(channels([0.92, 0.99, 1.06], [0, 0, 0.015])),
  },
  vivid: {
    label: "Vivid",
    detail: "Stronger colour and contrast",
    transform: flat(compose(saturation(1.35), contrast(1.08))),
  },
  faded: {
    label: "Faded",
    detail: "Muted colour, grey blacks",
    transform: flat(compose(compose(saturation(0.7), contrast(0.9)), liftBlacks(0.06))),
  },
  mono: {
    label: "Black and white",
    detail: "No colour at all",
    transform: flat(NEUTRAL),
  },
};

export const isLookId = (v: unknown): v is LookId =>
  typeof v === "string" && (lookIds as readonly string[]).includes(v);

/** A look at a strength from 0 (off) to 1 (full), blended toward the untouched picture. */
export function lookTransform(id: LookId, strength: number): ColorTransform {
  const t = looks[id].transform;
  const k = Math.max(0, Math.min(1, strength));
  return {
    gamma: t.gamma.map((g) => 1 + (g - 1) * k) as [number, number, number],
    matrix: k >= 1 ? t.matrix : mixMatrix(t.matrix, k),
  };
}
