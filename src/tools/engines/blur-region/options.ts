/**
 * Blur part of a video (feature G3): the options and the geometry every path shares. Pure; used by
 * the panel, the region editor on the preview, the live preview renderer, the worker engine and the
 * ffmpeg command, so all of them put a region in the same place at the same moment (ADR-0063).
 *
 * A region is a rectangle or an ellipse placed by key frames: each key gives the region's centre and
 * size as shares of the picture (so the same numbers fit the preview and the full-size frame). One
 * key, or `moving` off, is a region that stays put. Between keys the region moves in a straight
 * line at constant speed; before the first key and after the last it holds still. A region shows
 * from `start` to `end` (page seconds; `end` absent = to the end of the video).
 *
 * Strength is relative to the region, so a face and a number plate are hidden alike: the blur's
 * Gaussian sigma is 0.4 × strength of the region's shorter side, a pixel block is half of it. The
 * default (Medium, 0.5) was measured to leave no trace of which text was under it (ADR-0063).
 */
import { z } from "zod";
import { shellQuote } from "@/lib/format";
import { ffmpegSoundEncoder, type VideoSoundCodec } from "../sound-codec";

/**
 * Most regions in one video (the inverted mode reads them all in one shader pass). 48 since Find
 * faces (ADR-0113): a crowd shot of 37 small faces made 39 tracks on the fixture.
 */
export const MAX_REGIONS = 48;
/** Most key frames per region. */
export const MAX_KEYS = 240;
/** The smallest region edge, in picture pixels: smaller ones are grown to this around their centre. */
export const MIN_EDGE_PX = 4;

export const effects = ["blur", "pixelate", "box"] as const;
export type Effect = (typeof effects)[number];

export const RegionKey = z.object({
  /** Page seconds. */
  t: z.number().min(0),
  /** Centre, as a share of the picture's width and height. */
  x: z.number().min(-1).max(2),
  y: z.number().min(-1).max(2),
  /** Size, as a share of the picture's width and height. */
  w: z.number().min(0).max(2),
  h: z.number().min(0).max(2),
});
export type RegionKey = z.infer<typeof RegionKey>;

export const Region = z.object({
  /** Stable per page session; names the region in the panel ("Region 2"). */
  id: z.number().int().min(1),
  shape: z.enum(["rect", "ellipse"]).default("rect"),
  /** Sorted by time. Only the first is used unless `moving`. */
  keys: z.array(RegionKey).min(1).max(MAX_KEYS),
  /** Follows a moving subject: moving the region at a moment sets a key frame there. */
  moving: z.boolean().default(false),
  start: z.number().min(0).default(0),
  /** Absent: to the end of the video. */
  end: z.number().min(0).optional(),
  /**
   * Placed by Find faces (./faces): the face's number in order of first appearance, so it is
   * "Face n" on the page and keeps its name when another face is deleted. The engine ignores it.
   */
  face: z.number().int().min(1).optional(),
});
export type Region = z.infer<typeof Region>;

export const BlurRegionOptions = z.object({
  regions: z.array(Region).max(MAX_REGIONS).default([]),
  effect: z.enum(effects).default("blur"),
  /** 0.1 to 1; Light 0.25, Medium 0.5, Strong 1. */
  strength: z.number().min(0.1).max(1).default(0.5),
  /** Soft edge outside the region, as a share of its shorter side; 0 is a crisp edge. */
  feather: z.number().min(0).max(0.5).default(0),
  /** Blur everything except the regions. */
  invert: z.boolean().default(false),
  /** Page only: the region the panel and the timeline edit. The engine ignores it. */
  selected: z.number().int().optional(),
});
export type BlurRegionOptions = z.infer<typeof BlurRegionOptions>;

export const strengthPresets = [
  { value: 0.25, label: "Light" },
  { value: 0.5, label: "Medium" },
  { value: 1, label: "Strong" },
] as const;

export interface Size {
  width: number;
  height: number;
}

/** A region where it is at one moment, in picture pixels (fractions kept). */
export interface PlacedRegion {
  id: number;
  shape: "rect" | "ellipse";
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The region's key frames, sorted (the panel keeps them sorted; this is the guard). */
const sortedKeys = (r: Region) =>
  r.keys.length < 2 ? r.keys : [...r.keys].sort((a, b) => a.t - b.t);

/** Where the region's key frames put it at `t`, as shares (no range check). */
export function keyAt(r: Region, t: number): Omit<RegionKey, "t"> {
  const keys = sortedKeys(r);
  const first = keys[0] as RegionKey;
  if (!r.moving || keys.length === 1 || t <= first.t) return first;
  const last = keys[keys.length - 1] as RegionKey;
  if (t >= last.t) return last;
  let i = 1;
  while (i < keys.length - 1 && (keys[i] as RegionKey).t <= t) i++;
  const a = keys[i - 1] as RegionKey;
  const b = keys[i] as RegionKey;
  const span = b.t - a.t;
  const k = span > 0 ? (t - a.t) / span : 1;
  const mix = (p: number, q: number) => p + (q - p) * k;
  return { x: mix(a.x, b.x), y: mix(a.y, b.y), w: mix(a.w, b.w), h: mix(a.h, b.h) };
}

/** True when the region shows at page time `t`. */
export const showsAt = (r: Pick<Region, "start" | "end">, t: number) =>
  t >= r.start && (r.end === undefined || t < r.end);

/** A key as a rectangle in picture pixels, never smaller than `MIN_EDGE_PX`. */
export function keyRect(k: Omit<RegionKey, "t">, src: Size) {
  const width = Math.max(MIN_EDGE_PX, k.w * src.width);
  const height = Math.max(MIN_EDGE_PX, k.h * src.height);
  return { x: k.x * src.width - width / 2, y: k.y * src.height - height / 2, width, height };
}

/** The region in picture pixels at page time `t`, or null when it does not show then. */
export function placeRegion(r: Region, t: number, src: Size): PlacedRegion | null {
  if (!showsAt(r, t)) return null;
  return { id: r.id, shape: r.shape, ...keyRect(keyAt(r, t), src) };
}

/** Every region that shows at `t`, placed. */
export const placeAll = (o: Pick<BlurRegionOptions, "regions">, t: number, src: Size) =>
  o.regions.map((r) => placeRegion(r, t, src)).filter((r): r is PlacedRegion => r !== null);

/** A key from a rectangle in picture pixels at time `t`. */
export function keyFromRect(
  rect: { x: number; y: number; width: number; height: number },
  src: Size,
  t: number,
): RegionKey {
  return {
    t,
    x: (rect.x + rect.width / 2) / src.width,
    y: (rect.y + rect.height / 2) / src.height,
    w: rect.width / src.width,
    h: rect.height / src.height,
  };
}

/**
 * The region after it was moved or resized to `rect` at page time `t`. A still region moves as a
 * whole; a moving one gets a key frame at `t` (replacing one within half a frame of it).
 */
export function withRect(
  r: Region,
  rect: { x: number; y: number; width: number; height: number },
  src: Size,
  t: number,
  frameSec: number,
): Region {
  const key = keyFromRect(rect, src, t);
  if (!r.moving) return { ...r, keys: [{ ...key, t: 0 }] };
  const keys = r.keys.filter((k) => Math.abs(k.t - t) >= frameSec / 2);
  // At the limit a new moment is not added (an existing one can still be changed).
  if (keys.length >= MAX_KEYS) return r;
  keys.push(key);
  keys.sort((a, b) => a.t - b.t);
  return { ...r, keys };
}

/** The key frame within half a frame of `t`, if there is one. */
export const keyNear = (r: Region, t: number, frameSec: number) =>
  r.moving ? r.keys.find((k) => Math.abs(k.t - t) < frameSec / 2) : undefined;

/** Turns following on (keeps the one key) or off (the region stays where it is at `t`). */
export function setMoving(r: Region, moving: boolean, t: number): Region {
  if (moving === r.moving) return r;
  if (moving) return { ...r, moving, keys: [{ ...(r.keys[0] as RegionKey), t }] };
  return { ...r, moving, keys: [{ ...keyAt(r, t), t: 0 }] };
}

/** Removes the key frame near `t`; the last one stays. */
export function withoutKey(r: Region, t: number, frameSec: number): Region {
  if (r.keys.length < 2) return r;
  const keys = r.keys.filter((k) => Math.abs(k.t - t) >= frameSec / 2);
  return keys.length === r.keys.length || keys.length === 0 ? r : { ...r, keys };
}

/** A new region centred on the picture: a quarter of the width, as tall as it is wide in pixels. */
export function defaultRegion(id: number, src: Size, t = 0): Region {
  const w = 0.25;
  const h = Math.min(0.6, (w * src.width) / Math.max(1, src.height));
  return { id, shape: "rect", moving: false, start: 0, keys: [{ t, x: 0.5, y: 0.5, w, h }] };
}

/** The next free region id. */
export const nextRegionId = (o: Pick<BlurRegionOptions, "regions">) =>
  o.regions.reduce((m, r) => Math.max(m, r.id), 0) + 1;

/** How strong the effect is for a region, in picture pixels. */
export interface EffectSize {
  /** Gaussian sigma (blur). */
  sigma: number;
  /** Pixel block edge (pixelate). */
  block: number;
  /** Soft edge width. */
  feather: number;
}

/** Effect sizes for a region of `width`×`height` pixels (`invert`: for the whole frame instead). */
export function effectSize(
  o: Pick<BlurRegionOptions, "strength" | "feather">,
  region: Size,
  frame: Size,
  invert = false,
): EffectSize {
  const side = Math.min(region.width, region.height);
  const frameSide = Math.min(frame.width, frame.height);
  const sigma = invert ? 0.05 * o.strength * frameSide : 0.4 * o.strength * side;
  const block = invert ? (o.strength * frameSide) / 20 : (o.strength * side) / 2;
  return {
    sigma: Math.max(1.5, sigma),
    block: Math.max(2, block),
    feather: Math.max(0, o.feather * side),
  };
}

/** The region's time range in page seconds, for the timeline and the summary. */
export const regionRange = (r: Pick<Region, "start" | "end">, durationSec: number) => ({
  start: Math.min(r.start, durationSec),
  end: Math.min(r.end ?? durationSec, durationSec),
});

/** True when the region shows for the whole video. */
export const wholeVideo = (r: Pick<Region, "start" | "end">, durationSec: number) =>
  r.start <= 0 && (r.end === undefined || r.end >= durationSec);

export const effectNames: Record<Effect, string> = {
  blur: "blurred",
  pixelate: "pixelated",
  box: "covered",
};

// ffmpeg command (shown on the result) ------------------------------------------------------------

const n3 = (v: number) => Number(v.toFixed(3)).toString();

/**
 * A value that follows key frames as an ffmpeg expression of `t`: held before the first and after
 * the last, straight lines between.
 */
export function keyExpr(points: { t: number; v: number }[]): string {
  const first = points[0];
  if (!first) return "0";
  if (points.length === 1 || points.every((p) => Math.round(p.v) === Math.round(first.v)))
    return String(Math.round(first.v));
  let expr = String(Math.round((points[points.length - 1] as { v: number }).v));
  for (let i = points.length - 1; i >= 1; i--) {
    const a = points[i - 1] as { t: number; v: number };
    const b = points[i] as { t: number; v: number };
    const span = b.t - a.t;
    const seg =
      span > 0 ? `${n3(a.v)}+${n3(b.v - a.v)}*(t-${n3(a.t)})/${n3(span)}` : String(Math.round(b.v));
    expr = `if(lt(t,${n3(b.t)}),${seg},${expr})`;
  }
  return `if(lt(t,${n3(first.t)}),${Math.round(first.v)},${expr})`;
}

/**
 * The ffmpeg filter graph for the same job ([0:v] in, [v] out). A moving region's size is its
 * largest key (ffmpeg's crop cannot change size per frame) and the feathered edge is left out, so
 * for those the command is close, not identical; position, timing, shape and strength match.
 */
export function blurGraph(o: BlurRegionOptions, src: Size, durationSec: number): string {
  const regions = o.regions.slice(0, MAX_REGIONS);
  if (regions.length === 0) return "[0:v]null[v]";
  const enable = (r: Region) =>
    wholeVideo(r, durationSec)
      ? ""
      : `:enable='between(t,${n3(r.start)},${n3(Math.min(r.end ?? durationSec, durationSec))})'`;
  const sizeOf = (r: Region) => {
    const keys = r.moving ? r.keys : r.keys.slice(0, 1);
    const w = Math.max(...keys.map((k) => keyRect(k, src).width));
    const h = Math.max(...keys.map((k) => keyRect(k, src).height));
    return { w: Math.max(2, Math.round(w)), h: Math.max(2, Math.round(h)) };
  };
  const pos = (r: Region, axis: "x" | "y", size: number) => {
    const keys = r.moving ? r.keys : r.keys.slice(0, 1);
    const full = axis === "x" ? src.width : src.height;
    return keyExpr(keys.map((k) => ({ t: k.t, v: k[axis] * full - size / 2 })));
  };
  const mask = (r: Region) =>
    r.shape === "ellipse"
      ? ",format=yuva420p,geq=lum='p(X,Y)':a='255*lte(pow(2*X/W-1,2)+pow(2*Y/H-1,2),1)'"
      : "";
  const effectOn = (w: number, h: number) => {
    const e = effectSize(o, { width: w, height: h }, src);
    if (o.effect === "pixelate") {
      const b = Math.max(2, Math.round(e.block));
      return `pixelize=width=${b}:height=${b}`;
    }
    if (o.effect === "box") return "drawbox=c=black:t=fill";
    return `gblur=sigma=${n3(e.sigma)}`;
  };
  if (o.invert) {
    const e = effectSize(o, src, src, true);
    const whole =
      o.effect === "pixelate"
        ? `pixelize=width=${Math.round(e.block)}:height=${Math.round(e.block)}`
        : o.effect === "box"
          ? "drawbox=c=black:t=fill"
          : `gblur=sigma=${n3(e.sigma)}`;
    const parts = [
      `[0:v]split=${regions.length + 1}[bg0]${regions.map((_, i) => `[k${i}]`).join("")}`,
    ];
    parts.push(`[bg0]${whole}[b0]`);
    regions.forEach((r, i) => {
      const { w, h } = sizeOf(r);
      const x = pos(r, "x", w);
      const y = pos(r, "y", h);
      parts.push(`[k${i}]crop=${w}:${h}:'${x}':'${y}'${mask(r)}[c${i}]`);
      const out = i === regions.length - 1 ? "[v]" : `[b${i + 1}]`;
      parts.push(`[b${i}][c${i}]overlay=x='${x}':y='${y}'${enable(r)}${out}`);
    });
    return parts.join(";");
  }
  const parts = [
    `[0:v]split=${regions.length + 1}[b0]${regions.map((_, i) => `[k${i}]`).join("")}`,
  ];
  regions.forEach((r, i) => {
    const { w, h } = sizeOf(r);
    const x = pos(r, "x", w);
    const y = pos(r, "y", h);
    parts.push(`[k${i}]crop=${w}:${h}:'${x}':'${y}',${effectOn(w, h)}${mask(r)}[c${i}]`);
    const out = i === regions.length - 1 ? "[v]" : `[b${i + 1}]`;
    parts.push(`[b${i}][c${i}]overlay=x='${x}':y='${y}'${enable(r)}${out}`);
  });
  return parts.join(";");
}

export function blurCommand(
  input: string,
  output: string,
  graph: string,
  kbps: number,
  audio: "copy" | "none" | VideoSoundCodec,
): string {
  const a =
    audio === "none"
      ? "-an"
      : audio === "copy"
        ? "-map '0:a?' -c:a copy"
        : `-map '0:a?' -c:a ${ffmpegSoundEncoder(audio)}`;
  return `ffmpeg -i ${shellQuote(input)} -filter_complex "${graph}" -map "[v]" ${a} -c:v libx264 -b:v ${kbps}k -pix_fmt yuv420p ${shellQuote(output)}`;
}
