/**
 * Green screen (feature G12): options and the pure maths every path shares (ADR-0065). Used by the
 * panel, the live preview, the worker engine and the unit tests.
 *
 * The keyer is a colour-difference keyer against a local screen plate:
 * 1. The screen's key-ness of a pixel is its dominant channel over the larger of the other two
 *    (green: G − max(R, B); blue: B − max(R, G)), the measure classic screen keyers use. Yellow and
 *    skin score near zero on a green screen, so they never turn see-through.
 * 2. The screen's own colour is estimated around every pixel (the "plate"): pixels that are clearly
 *    screen are averaged over about 28 px, so light that falls off across the screen is followed.
 * 3. Cover is 1 − key-ness ÷ the plate's key-ness, ramped between `soft` and `1 − tolerance`; mixed
 *    edge pixels (hair, motion blur) land in between in proportion to how much screen they hold.
 * 4. The plate's colour times (1 − cover) is taken off the pixel and the backdrop put in its place,
 *    so an edge keeps the subject's share of its colour instead of a green or dark fringe.
 * 5. What key-ness is left on the subject (light spilt from the screen) is reduced by `spill`.
 * Measured on a synthetic shot with uneven light and spill against the right answer, after the
 * H.264 encode: 37.6 to 37.8 dB overall and 28.3 to 28.5 dB on edge pixels, where FFmpeg's
 * chromakey + despill at its best setting, without an encode, reaches 35.4 to 35.9 and 23.8 to 24.2
 * (ADR-0065, tests/e2e/remove-green-screen-from-video.spec.ts).
 */
import { z } from "zod";
import { shellQuote } from "@/lib/format";
import { withEvenCropOut } from "../crop/math";
import { ffmpegSoundEncoder, type VideoSoundCodec } from "../sound-codec";

export const Rgb = z.tuple([
  z.number().int().min(0).max(255),
  z.number().int().min(0).max(255),
  z.number().int().min(0).max(255),
]);
export type Rgb = z.infer<typeof Rgb>;

export const Background = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("color") }),
  z.object({
    kind: z.literal("image"),
    name: z.string(),
    blob: z.instanceof(Blob),
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  z.object({
    kind: z.literal("video"),
    name: z.string(),
    blob: z.instanceof(Blob),
    width: z.number().positive(),
    height: z.number().positive(),
    durationSec: z.number().positive(),
  }),
]);
export type Background = z.infer<typeof Background>;

export const ChromaKeyOptions = z.object({
  /** The screen's colour. */
  key: Rgb.default([0, 177, 64]),
  /**
   * Where `key` came from. "default" until the page has looked at the picture; "auto" from the
   * frame's edges; "picked" by a tap on the picture or the colour field; "none" when the edges show
   * no screen (the page then asks for a tap).
   */
  keyFrom: z.enum(["default", "auto", "picked", "none"]).default("default"),
  /** 0 to 0.5: how much less screen-like than the plate still counts as screen. */
  tolerance: z.number().min(0).max(0.5).default(0.05),
  /** 0.1 to 1: width of the ramp from screen to subject (hard to soft edges). */
  softness: z.number().min(0.1).max(1).default(0.9),
  /** 0 to 1: how much of the screen's colour left on the subject is taken out. */
  spill: z.number().min(0).max(1).default(1),
  background: Background.default({ kind: "color" }),
  /** Fills behind the subject with "color"; fills bars around a contained picture otherwise. */
  color: Rgb.default([0, 0, 0]),
  fit: z.enum(["cover", "contain"]).default("cover"),
  /** A background video shorter than the foreground loops or holds its last frame. */
  bgEnd: z.enum(["loop", "hold"]).default("loop"),
  sound: z.enum(["foreground", "none"]).default("foreground"),
  /**
   * Page only: the background kind chosen in the panel, which leads `background` until its file is
   * picked (an Image or Video choice without a file blocks the run). The engine ignores it.
   */
  bgKind: z.enum(["color", "image", "video"]).optional(),
});
export type ChromaKeyOptions = z.infer<typeof ChromaKeyOptions>;

/** Which channel the screen is (the key's largest). */
export function keyChannel(key: Rgb): 0 | 1 | 2 {
  const [r, g, b] = key;
  return g >= r && g >= b ? 1 : b >= r ? 2 : 0;
}

/** Key-ness of an RGB pixel (0..1 values) for a screen whose dominant channel is `ch`. */
export function keyness(r: number, g: number, b: number, ch: 0 | 1 | 2): number {
  if (ch === 1) return g - Math.max(r, b);
  if (ch === 2) return b - Math.max(r, g);
  return r - Math.max(g, b);
}

/** The ramp ends for `ratio` = key-ness ÷ plate key-ness: transparent at `hi`, opaque at `lo`. */
export function ramp(o: Pick<ChromaKeyOptions, "tolerance" | "softness">) {
  const hi = 1 - o.tolerance;
  return { lo: Math.max(0, hi - o.softness), hi };
}

/** Cover (0 transparent, 1 opaque) from the key-ness ratio; the shader computes the same. */
export function coverFromRatio(ratio: number, r: { lo: number; hi: number }): number {
  const span = Math.max(1e-3, r.hi - r.lo);
  return 1 - Math.min(1, Math.max(0, (ratio - r.lo) / span));
}

/** A pixel counts as clear screen for the plate when its key-ness is at least this share of the key's. */
export const PLATE_SHARE = 0.6;

export interface DetectedKey {
  key: Rgb;
  /** Share of the edge band that is screen. */
  share: number;
}

/**
 * The screen's colour from a frame's edges (RGBA, `width`×`height`): the band 6% in from each edge
 * is read, strongly coloured pixels are grouped by hue, and the largest group's median colour is the
 * key, if that group covers at least a quarter of the band. Undefined when no screen fills the edges.
 */
export function detectKey(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): DetectedKey | undefined {
  const band = Math.max(2, Math.round(Math.min(width, height) * 0.06));
  const bins: number[][] = Array.from({ length: 24 }, () => []);
  let total = 0;
  const step = Math.max(1, Math.round(Math.min(width, height) / 360));
  for (let y = 0; y < height; y += step)
    for (let x = 0; x < width; x += step) {
      if (x >= band && x < width - band && y >= band && y < height - band) continue;
      total++;
      const i = (y * width + x) * 4;
      const r = (rgba[i] ?? 0) / 255;
      const g = (rgba[i + 1] ?? 0) / 255;
      const b = (rgba[i + 2] ?? 0) / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const c = max - min;
      // Strongly coloured and not too dark: a lit screen, not grey walls or shadows.
      if (c < 0.12 || max < 0.15) continue;
      let h: number;
      if (max === r) h = ((g - b) / c + 6) % 6;
      else if (max === g) h = (b - r) / c + 2;
      else h = (r - g) / c + 4;
      bins[Math.floor((h / 6) * 24) % 24]?.push(i);
    }
  if (total === 0) return undefined;
  // The best run of three neighbouring hue bins.
  let best = 0;
  let bestN = -1;
  for (let k = 0; k < 24; k++) {
    const n =
      (bins[(k + 23) % 24]?.length ?? 0) +
      (bins[k]?.length ?? 0) +
      (bins[(k + 1) % 24]?.length ?? 0);
    if (n > bestN) {
      bestN = n;
      best = k;
    }
  }
  const share = bestN / total;
  if (share < 0.25) return undefined;
  const picked = [
    ...(bins[(best + 23) % 24] ?? []),
    ...(bins[best] ?? []),
    ...(bins[(best + 1) % 24] ?? []),
  ];
  const median = (c: number) => {
    const v = picked.map((i) => rgba[i + c] ?? 0).sort((a, b) => a - b);
    return v[v.length >> 1] ?? 0;
  };
  return { key: [median(0), median(1), median(2)], share };
}

/** The average colour of a `size`×`size` patch around (x, y), for a tap on the picture. */
export function patchColor(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  size = 5,
): Rgb {
  const s = [0, 0, 0];
  let n = 0;
  const h = Math.floor(size / 2);
  for (let dy = -h; dy <= h; dy++)
    for (let dx = -h; dx <= h; dx++) {
      const px = Math.min(width - 1, Math.max(0, Math.round(x) + dx));
      const py = Math.min(height - 1, Math.max(0, Math.round(y) + dy));
      const i = (py * width + px) * 4;
      s[0] = (s[0] ?? 0) + (rgba[i] ?? 0);
      s[1] = (s[1] ?? 0) + (rgba[i + 1] ?? 0);
      s[2] = (s[2] ?? 0) + (rgba[i + 2] ?? 0);
      n++;
    }
  return [Math.round((s[0] ?? 0) / n), Math.round((s[1] ?? 0) / n), Math.round((s[2] ?? 0) / n)];
}

export interface Size {
  width: number;
  height: number;
}

/** Where a background of `bg` size goes on a `frame`: cover fills and crops, contain fits inside. */
export function fitRect(bg: Size, frame: Size, fit: "cover" | "contain") {
  const k =
    fit === "cover"
      ? Math.max(frame.width / bg.width, frame.height / bg.height)
      : Math.min(frame.width / bg.width, frame.height / bg.height);
  const width = bg.width * k;
  const height = bg.height * k;
  return { x: (frame.width - width) / 2, y: (frame.height - height) / 2, width, height };
}

/** The background video's time for foreground page time `t`. */
export function backgroundTime(
  t: number,
  bgDuration: number,
  end: "loop" | "hold",
  frameSec = 1 / 30,
) {
  if (bgDuration <= 0) return 0;
  if (t < bgDuration) return Math.max(0, t);
  return end === "loop" ? t % bgDuration : Math.max(0, bgDuration - frameSec / 2);
}

export const hex = (c: Rgb) => `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;

export function fromHex(s: string): Rgb | undefined {
  const m = /^#?([0-9a-f]{6})$/i.exec(s.trim());
  if (!m?.[1]) return undefined;
  const n = Number.parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** The screen in words, for the summary: "green screen", "blue screen", or the colour. */
export function screenName(key: Rgb): string {
  const ch = keyChannel(key);
  const [r, g, b] = key;
  const lead = [r, g, b][ch] ?? 0;
  const next = Math.max(...[r, g, b].filter((_, i) => i !== ch));
  if (lead - next < 30) return `${hex(key)} screen`;
  return ch === 1 ? "green screen" : ch === 2 ? "blue screen" : `${hex(key)} screen`;
}

// ffmpeg command ----------------------------------------------------------------------------------

/**
 * The nearest FFmpeg graph: chromakey on the key colour, despill for green or blue, the background
 * fitted the same way and laid under. FFmpeg's keyer has no local screen plate, so the command is a
 * close stand-in, not the same arithmetic (about 4 dB worse on edges, ADR-0065).
 */
export function keyCommand(
  o: ChromaKeyOptions,
  input: string,
  output: string,
  frame: Size,
  durationSec: number,
  kbps: number,
  audio: "copy" | "none" | VideoSoundCodec,
): string {
  const color = `0x${hex(o.key).slice(1)}`;
  const despill =
    keyChannel(o.key) === 1
      ? ",despill=type=green"
      : keyChannel(o.key) === 2
        ? ",despill=type=blue"
        : "";
  const key = `chromakey=color=${color}:similarity=${(0.05 + o.tolerance * 0.3).toFixed(3)}:blend=${((0.03 * o.softness) / 0.9).toFixed(3)}${o.spill > 0 ? despill : ""}`;
  const W = frame.width;
  const H = frame.height;
  const bgColor = `0x${hex(o.color).slice(1)}`;
  const fit =
    o.fit === "cover"
      ? `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`
      : `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=${bgColor}`;
  const a =
    audio === "none"
      ? "-an"
      : audio === "copy"
        ? "-map '0:a?' -c:a copy"
        : `-map '0:a?' -c:a ${ffmpegSoundEncoder(audio)}`;
  let bgInput: string;
  let bgChain: string;
  if (o.background.kind === "color") {
    bgInput = `-f lavfi -i color=c=${bgColor}:s=${W}x${H}:d=${durationSec.toFixed(3)}`;
    bgChain = "[1:v]null[bg]";
  } else if (o.background.kind === "image") {
    bgInput = `-loop 1 -i ${shellQuote(o.background.name)}`;
    bgChain = `[1:v]${fit}[bg]`;
  } else {
    bgInput = `${o.bgEnd === "loop" ? "-stream_loop -1 " : ""}-i ${shellQuote(o.background.name)}`;
    bgChain = `[1:v]${fit}${o.bgEnd === "hold" ? `,tpad=stop_mode=clone:stop_duration=${durationSec.toFixed(3)}` : ""}[bg]`;
  }
  const graph = withEvenCropOut(
    frame,
    `${bgChain};[0:v]${key}[fg];[bg][fg]overlay=shortest=1,format=yuv420p[v]`,
  );
  return `ffmpeg -i ${shellQuote(input)} ${bgInput} -filter_complex "${graph}" -map "[v]" ${a} -c:v libx264 -b:v ${kbps}k -t ${durationSec.toFixed(3)} ${shellQuote(output)}`;
}
