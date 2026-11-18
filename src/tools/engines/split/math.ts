/**
 * Split planning, shared by the options panel (markers, summary) and the engine (the actual cuts), so
 * the page shows exactly the cuts that will be made (principles: one source of truth per fact).
 * Pure: no DOM, no mediabunny.
 */
import { baseName, formatTimecode, NBSP } from "@/lib/format";

export type SplitMode = "equal" | "every" | "points";

/** Most parts one run writes. Each part is a separate download; beyond this a zip of 100 is unwieldy. */
export const MAX_PARTS = 100;
/** "Every N seconds" presets. */
export const EVERY_PRESETS = [15, 30, 60] as const;

export interface SplitPlanInput {
  mode: SplitMode;
  parts: number;
  every: number;
  points: number[];
  precise: boolean;
}

export interface Part {
  start: number;
  end: number;
}

const EPS = 1e-6;

/** Cut points the user asked for, before snapping: sorted, inside (0, duration), no duplicates. */
export function requestedPoints(o: SplitPlanInput, duration: number): number[] {
  if (!(duration > 0)) return [];
  let pts: number[];
  if (o.mode === "equal") {
    const n = Math.max(1, Math.min(MAX_PARTS, Math.round(o.parts)));
    pts = Array.from({ length: n - 1 }, (_, i) => ((i + 1) * duration) / n);
  } else if (o.mode === "every") {
    const step = o.every > 0 ? o.every : duration;
    pts = [];
    for (let t = step; t < duration - EPS && pts.length < MAX_PARTS - 1; t += step) pts.push(t);
  } else {
    pts = [...o.points];
  }
  return dedupe(pts.filter((t) => t > EPS && t < duration - EPS));
}

function dedupe(sorted: number[], minGap = EPS): number[] {
  const out: number[] = [];
  for (const t of [...sorted].sort((a, b) => a - b)) {
    const last = out[out.length - 1];
    if (last === undefined || t - last > minGap) out.push(t);
  }
  return out;
}

/** Nearest key frame to `t` (ties go to the earlier one). `keyframes` ascending. */
export function nearestKeyframe(t: number, keyframes: number[]): number | undefined {
  let lo = 0;
  let hi = keyframes.length - 1;
  if (hi < 0) return undefined;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((keyframes[mid] ?? 0) < t) lo = mid + 1;
    else hi = mid;
  }
  const after = keyframes[lo];
  const before = keyframes[lo - 1];
  if (after === undefined) return before;
  if (before === undefined) return after;
  return t - before <= after - t ? before : after;
}

/**
 * Moves each point to the nearest key frame (lossless) or frame boundary (precise). Points that land
 * on the file's first key frame, on the end, or on the same key frame as a neighbour are dropped, so
 * the result can have fewer parts than requested; the page says so.
 */
export function snapPoints(
  points: number[],
  duration: number,
  opts: { precise: boolean; fps: number; keyframes?: number[] },
): number[] {
  const frame = opts.fps > 0 && Number.isFinite(opts.fps) ? 1 / opts.fps : 1 / 30;
  if (opts.precise) {
    const snapped = points.map((t) => Math.round(t / frame) * frame);
    return dedupe(
      snapped.filter((t) => t >= frame - EPS && t <= duration - frame + EPS),
      frame / 2,
    );
  }
  const kf = opts.keyframes ?? [];
  const first = kf[0] ?? 0;
  const snapped = points
    .map((t) => nearestKeyframe(t, kf))
    .filter((t): t is number => t !== undefined && t > first + EPS && t < duration - EPS);
  return dedupe(snapped, frame / 2);
}

/** The cuts that will actually be made. Lossless needs the key frame list. */
export function cutPoints(
  o: SplitPlanInput,
  duration: number,
  media: { fps: number; keyframes?: number[] },
): number[] {
  return snapPoints(requestedPoints(o, duration), duration, {
    precise: o.precise,
    fps: media.fps,
    keyframes: media.keyframes,
  });
}

export function partsFrom(points: number[], duration: number): Part[] {
  const edges = [0, ...points, duration];
  return edges.slice(0, -1).map((start, i) => ({ start, end: edges[i + 1] ?? duration }));
}

/** "clip.mp4", part 3 of 12 → "clip-part-03.mp4". Zero-padded so the parts sort in order. */
export function partName(fileName: string, index: number, count: number, ext: string): string {
  return `${baseName(fileName)}-part-${String(index + 1).padStart(partDigits(count), "0")}.${ext}`;
}

/**
 * A user-typed part name made safe for a download: no path or reserved characters, no leading dots,
 * at most 80 characters. Empty when nothing usable is left (the default name is used instead).
 */
export function cleanPartName(name: string | undefined): string {
  return (
    (name ?? "")
      // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what we strip
      .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^\.+/, "")
      .slice(0, 80)
      .trim()
  );
}

/** Final file names: the user's name where given, the numbered default otherwise, never twice the same. */
export function partFileNames(
  fileName: string,
  count: number,
  ext: string,
  names: (string | undefined)[] = [],
): string[] {
  const seen = new Set<string>();
  return Array.from({ length: count }, (_, i) => {
    const own = cleanPartName(names[i]).replace(new RegExp(`\\.${ext}$`, "i"), "");
    let name = own ? `${own}.${ext}` : partName(fileName, i, count, ext);
    for (let n = 2; seen.has(name.toLowerCase()); n++)
      name = `${own || baseName(partName(fileName, i, count, ext))}-${n}.${ext}`;
    seen.add(name.toLowerCase());
    return name;
  });
}

/** Digits in a part number: at least two. */
export const partDigits = (count: number) => Math.max(2, String(count).length);

/** Row facts for one part, e.g. "0:00.00–0:01.00 · 1.0 s". */
export function partMeta(p: Part): string {
  return `${formatTimecode(p.start)}–${formatTimecode(p.end)} · ${(p.end - p.start).toFixed(1)}${NBSP}s`;
}
