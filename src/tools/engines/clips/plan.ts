/**
 * Clips for short-video platforms (C8): options, where clips are proposed to start and end, the
 * vertical frame, and the ffmpeg command. Shared by the timeline, the panel and the engine so the
 * clips shown are the clips written. Pure; safe to import on the page.
 *
 * Boundaries are proposed where a cut is least noticed: at a scene cut (the picture changes
 * completely between two key frames) or in the middle of a pause in the sound. From the start, each
 * clip ends at the best such moment between half the length cap and the cap, later ones preferred
 * and none that would leave a scrap under a quarter of the cap at the end; where there is none, at
 * the cap itself, or in the middle of what is left when less than one and a half caps remain.
 */
import { z } from "zod";
import { framePlatforms } from "@/content/platforms/frames";
import { shellQuote } from "@/lib/format";
import { reencodeBitrate } from "../crop/plan";
import type { Span } from "../sound/dsp/silence";
import type { MediaInfo } from "../types";

export const MAX_CLIPS = 200;
export const MIN_CLIP = 1;
/**
 * YouTube Shorts' stated upload limit, from its dated profile (src/content/platforms/frames). The
 * longest length offered is this number; a profile without it fails the build rather than let a
 * guess stand in.
 */
export const SHORTS_MAX_SEC: number = (() => {
  const max = framePlatforms["youtube-shorts"].maxSec;
  if (!max) throw new Error("src/content/platforms/frames.ts: youtube-shorts has no maxSec");
  return max;
})();
/** Length caps offered, seconds: fixed short lengths, then the Shorts limit. */
export const LENGTHS: readonly number[] = [...new Set([15, 30, 60, 90, SHORTS_MAX_SEC])].sort(
  (a, b) => a - b,
);
export const DEFAULT_LENGTH = 60;

export const Clip = z.object({
  start: z.number().min(0),
  end: z.number().min(0),
  include: z.boolean().default(true),
  /** Vertical crop: the window's centre across the picture, 0–1. */
  focus: z.number().min(0).max(1).default(0.5),
});
export type Clip = z.infer<typeof Clip>;

export const ClipsOptions = z.object({
  clips: z.array(Clip).min(1).max(MAX_CLIPS),
  /** Longest clip wanted, seconds (proposals and the length check use it). */
  maxSec: z.number().min(5).max(600).default(DEFAULT_LENGTH),
  /** 9:16 output: keep the picture as it is, cut a vertical window from it, or fit it over a blur. */
  reframe: z.enum(["none", "crop", "blur"]).default("crop"),
});
export type ClipsOptions = z.infer<typeof ClipsOptions>;

export interface Candidate {
  t: number;
  /** 0–2: how good a place to cut this is (a scene cut scores above any pause). */
  score: number;
  kind: "scene" | "pause";
}

/** Pauses as cut candidates: the middle of each, better the longer it is (a second or more is best). */
export function pauseCandidates(pauses: readonly Span[]): Candidate[] {
  return pauses.map((p) => ({
    t: (p.start + p.end) / 2,
    score: Math.min(1, (p.end - p.start) / 1),
    kind: "pause" as const,
  }));
}

/** Scene cuts as candidates (from the engine's key frame comparison). */
export const sceneCandidates = (times: readonly number[]): Candidate[] =>
  times.map((t) => ({ t, score: 1.5, kind: "scene" as const }));

/**
 * Clip boundaries for a video of `duration`, each clip at most `maxSec`. Within each window of
 * [start + maxSec / 2, start + maxSec], the candidate with the best score, weighted toward the
 * window's end so clips use their length, wins; no candidate means a cut at the cap.
 */
export function proposeCuts(
  duration: number,
  maxSec: number,
  candidates: readonly Candidate[],
): number[] {
  const cuts: number[] = [];
  const sorted = [...candidates].sort((a, b) => a.t - b.t);
  let start = 0;
  while (duration - start > maxSec + 1e-6 && cuts.length < MAX_CLIPS - 1) {
    const lo = start + maxSec / 2;
    const hi = start + maxSec;
    let best: Candidate | undefined;
    let bestValue = -1;
    const left = duration - start;
    for (const c of sorted) {
      if (c.t < lo || c.t > hi) continue;
      // A cut that would leave a scrap at the end is no good place.
      if (duration - c.t < maxSec / 4) continue;
      const value = c.score * (0.6 + 0.4 * ((c.t - start) / maxSec));
      if (value > bestValue) {
        bestValue = value;
        best = c;
      }
    }
    // No good place: the cap, or the middle of what is left when that would leave a scrap.
    const cut = best?.t ?? (left < maxSec * 1.5 ? start + left / 2 : hi);
    cuts.push(cut);
    start = cut;
  }
  return cuts;
}

/** Clips from boundaries (all included, framed in the middle). */
export function clipsFromCuts(cuts: readonly number[], duration: number): Clip[] {
  const edges = [0, ...cuts, duration];
  return edges.slice(0, -1).map((start, i) => ({
    start,
    end: edges[i + 1] ?? duration,
    include: true,
    focus: 0.5,
  }));
}

/** Boundaries of a clip list (the starts after the first). */
export const cutsOf = (clips: readonly Clip[]) => clips.slice(1).map((c) => c.start);

/**
 * Moves boundary `i` (between clip i and i + 1) to `t`, keeping at least `MIN_CLIP` seconds on
 * both sides; the two clips keep their choices.
 */
export function moveCut(clips: readonly Clip[], i: number, t: number): Clip[] {
  const a = clips[i];
  const b = clips[i + 1];
  if (!a || !b) return [...clips];
  const at = Math.min(b.end - MIN_CLIP, Math.max(a.start + MIN_CLIP, t));
  return clips.map((c, k) => (k === i ? { ...c, end: at } : k === i + 1 ? { ...c, start: at } : c));
}

/** Splits the clip under `t` in two there (a new boundary). */
export function addCut(clips: readonly Clip[], t: number): Clip[] {
  const i = clips.findIndex((c) => t > c.start + MIN_CLIP && t < c.end - MIN_CLIP);
  const c = clips[i];
  if (!c) return [...clips];
  return [...clips.slice(0, i), { ...c, end: t }, { ...c, start: t }, ...clips.slice(i + 1)];
}

/** Removes boundary `i`, joining clip i and i + 1 (the first one's choices stay). */
export function removeCut(clips: readonly Clip[], i: number): Clip[] {
  const a = clips[i];
  const b = clips[i + 1];
  if (!a || !b) return [...clips];
  return [...clips.slice(0, i), { ...a, end: b.end }, ...clips.slice(i + 2)];
}

export interface Size {
  width: number;
  height: number;
}

const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);

/** The source is already vertical (taller than 4:5), so no reframing is offered. */
export const isVertical = (s: Size) => s.height / s.width >= 1.25;

/**
 * The output frame. `none`: the picture's own size (less an odd edge). `crop`: a 9:16 window of the
 * picture's full height, never enlarged, at most 1080×1920. `blur`: 9:16 at the picture's width (at
 * most 1080), the picture fitted across it over a blurred, darkened copy of itself.
 */
export function outputFrame(src: Size, reframe: ClipsOptions["reframe"]): Size {
  if (reframe === "none" || isVertical(src))
    return { width: even(src.width), height: even(src.height) };
  if (reframe === "crop") {
    const h = Math.min(1920, src.height, Math.floor((src.width * 16) / 9));
    return { width: even((h * 9) / 16), height: even(h) };
  }
  const w = Math.min(1080, src.width);
  return { width: even(w), height: even((w * 16) / 9) };
}

/**
 * The part of the picture a vertical crop keeps, for a window centred at `focus` (0–1 across): the
 * full height, as wide as the output frame's own shape (`outputFrame`, which rounds 9:16 to even
 * edges), so the window is scaled evenly and nothing is squashed.
 */
export function cropWindow(
  src: Size,
  focus: number,
): { x: number; y: number; width: number; height: number } {
  const frame = outputFrame(src, "crop");
  const height = Math.min(src.height, (src.width * frame.height) / frame.width);
  const width = (height * frame.width) / frame.height;
  const x = Math.min(src.width - width, Math.max(0, focus * src.width - width / 2));
  return { x, y: (src.height - height) / 2, width, height };
}

/** Where the whole picture sits in a blurred-background frame: across the full width, centred. */
export function blurFit(
  src: Size,
  frame: Size,
): { x: number; y: number; width: number; height: number } {
  const width = frame.width;
  const height = (frame.width * src.height) / src.width;
  return { x: 0, y: (frame.height - height) / 2, width, height };
}

export const clipName = (base: string, i: number, count: number) =>
  `${base}-clip-${String(i + 1).padStart(Math.max(2, String(count).length), "0")}.mp4`;

const n = (v: number) => Number(v.toFixed(3)).toString();

/** The command for one clip: trimmed exactly, reframed, re-encoded. */
export function clipCommand(o: {
  input: string;
  output: string;
  clip: Clip;
  src: Size;
  reframe: ClipsOptions["reframe"];
  kbps: number;
  sound: boolean;
}): string {
  const frame = outputFrame(o.src, o.reframe);
  let vf = "";
  if (o.reframe === "crop" && !isVertical(o.src)) {
    const w = cropWindow(o.src, o.clip.focus);
    vf = `-vf "crop=${Math.round(w.width)}:${Math.round(w.height)}:${Math.round(w.x)}:${Math.round(w.y)},scale=${frame.width}:${frame.height}" `;
  } else if (o.reframe === "blur" && !isVertical(o.src)) {
    const fit = blurFit(o.src, frame);
    vf = `-filter_complex "[0:v]split[a][b];[a]scale=${frame.width}:${frame.height}:force_original_aspect_ratio=increase,crop=${frame.width}:${frame.height},boxblur=20,eq=brightness=-0.08[bg];[b]scale=${frame.width}:${even(fit.height)}[fg];[bg][fg]overlay=0:(H-h)/2" `;
  } else if (frame.width !== o.src.width || frame.height !== o.src.height) {
    vf = `-vf "crop=${frame.width}:${frame.height}:0:0" `;
  }
  const a = o.sound ? "-c:a aac -b:a 192k" : "-an";
  return `ffmpeg -ss ${n(o.clip.start)} -to ${n(o.clip.end)} -i ${shellQuote(o.input)} ${vf}-c:v libx264 -b:v ${o.kbps}k -pix_fmt yuv420p ${a} -movflags +faststart ${shellQuote(o.output)}`;
}

/**
 * Video bitrate of a clip: the re-encode density at the output frame, capped by what the source
 * spends on the share of the picture kept (../crop/plan `reencodeBitrate`, ADR-0060).
 */
export const clipBitrate = (
  v: NonNullable<MediaInfo["video"]>,
  reframe: ClipsOptions["reframe"],
  fps: number,
) => reencodeBitrate({ size: outputFrame(v, reframe), fps, source: v });
