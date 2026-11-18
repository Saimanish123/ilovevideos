/**
 * Timing edits and checks. Every edit returns a new document plus counts of what it did, so the
 * page can report real numbers ("3 overlaps fixed, 1 cue moved into order"). Pure.
 */
import { plain } from "./markup";
import type { Cue, Issue, SubtitleDoc } from "./model";

/**
 * Cues that may legitimately overlap are on different tracks: in ASS, lines on another layer or in
 * another style (a sign over dialogue). Other formats have one track.
 */
function trackOf(doc: SubtitleDoc, c: Cue): string {
  if (doc.format !== "ass") return "";
  const f = doc.eventFormat ?? [];
  const fields = c.native?.fields ?? [];
  return `${fields[f.indexOf("layer")] ?? "0"}|${(fields[f.indexOf("style")] ?? "").trim()}`;
}

/** Problems with the cue timings, sorted by line, each tied to its line. */
export function findIssues(doc: SubtitleDoc): Issue[] {
  const out: Issue[] = [];
  const seen = new Map<string, number>();
  const duplicates = new Set<Cue>();
  // ASS renderers sort events themselves, so order only matters within a layer and style.
  const previousByTrack = new Map<string, Cue>();
  for (const c of doc.cues) {
    const previous = previousByTrack.get(trackOf(doc, c));
    const n = c.line;
    if (plain(c.text).trim() === "")
      out.push({ kind: "empty", line: n, message: `Line ${n}: this cue has no text.` });
    if (c.end < c.start)
      out.push({
        kind: "end-before-start",
        line: n,
        message: `Line ${n}: the end time is before the start time.`,
      });
    else if (c.end === c.start)
      out.push({ kind: "zero-length", line: n, message: `Line ${n}: this cue has no duration.` });
    if (previous && c.start < previous.start)
      out.push({
        kind: "out-of-order",
        line: n,
        message: `Line ${n}: this cue starts before the one above it.`,
      });
    const key = `${c.start}|${c.end}|${trackOf(doc, c)}|${c.text}`;
    const twin = seen.get(key);
    if (twin !== undefined) {
      duplicates.add(c);
      out.push({
        kind: "duplicate",
        line: n,
        message: `Line ${n}: this cue repeats the one on line ${twin}.`,
      });
    } else seen.set(key, n);
    previousByTrack.set(trackOf(doc, c), c);
  }
  // Overlaps are about time, not file order: walk each track sorted by start.
  const tracks = new Map<string, Cue[]>();
  for (const c of doc.cues) {
    const t = trackOf(doc, c);
    tracks.set(t, [...(tracks.get(t) ?? []), c]);
  }
  for (const cues of tracks.values()) {
    let end = Number.NEGATIVE_INFINITY;
    for (const c of [...cues].sort((a, b) => a.start - b.start || a.line - b.line)) {
      if (c.start < end && !duplicates.has(c))
        out.push({
          kind: "overlap",
          line: c.line,
          message: `Line ${c.line}: this cue starts before the previous one ends.`,
        });
      if (c.end > c.start) end = Math.max(end, c.end);
    }
  }
  return out.sort((a, b) => a.line - b.line);
}

/** The fewest cues that must move for the list to run in time order (length minus the longest ordered run). */
function outOfOrder(cues: Cue[]): number {
  const tails: number[] = [];
  for (const c of cues) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((tails[mid] ?? 0) <= c.start) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = c.start;
  }
  return cues.length - tails.length;
}

const mapTimes = (doc: SubtitleDoc, f: (ms: number) => number): SubtitleDoc => {
  const map = (c: Cue): Cue => ({ ...c, start: Math.round(f(c.start)), end: Math.round(f(c.end)) });
  return {
    ...doc,
    cues: doc.cues.map(map),
    extras: doc.extras.map((x) => (x.cue ? { ...x, cue: map(x.cue) } : x)),
  };
};

export interface ShiftReport {
  /** Cues that ended before 0:00 after the shift and were removed. */
  removed: number;
  /** Cues that started before 0:00 and now start at 0:00. */
  clamped: number;
}

/** Moves every cue by `ms` (negative = earlier). Nothing can start before 0:00. */
export function shiftDoc(doc: SubtitleDoc, ms: number): { doc: SubtitleDoc; report: ShiftReport } {
  const moved = mapTimes(doc, (t) => t + ms);
  let removed = 0;
  let clamped = 0;
  const fit = (c: Cue): Cue | null => {
    if (c.end <= 0 && c.start <= 0) {
      removed++;
      return null;
    }
    if (c.start < 0) {
      clamped++;
      return { ...c, start: 0 };
    }
    return c;
  };
  const cues = moved.cues.map(fit).filter((c): c is Cue => c !== null);
  const extras = moved.extras.flatMap((x) => {
    if (!x.cue) return [x];
    const c = x.cue.end <= 0 ? null : { ...x.cue, start: Math.max(0, x.cue.start) };
    return c ? [{ ...x, cue: c }] : [];
  });
  return { doc: { ...moved, cues, extras }, report: { removed, clamped } };
}

/** The earliest cue start, the anchor for "make the first line appear at ...". */
export const firstStart = (doc: SubtitleDoc) =>
  doc.cues.reduce((min, c) => Math.min(min, c.start), Number.POSITIVE_INFINITY);

/** Frame rates offered for re-timing, as exact ratios (23.976 is 24000/1001). */
export const frameRates = {
  "23.976": 24000 / 1001,
  "24": 24,
  "25": 25,
  "29.97": 30000 / 1001,
  "30": 30,
} as const;
export type FrameRateId = keyof typeof frameRates;
export const frameRateIds = Object.keys(frameRates) as FrameRateId[];

/**
 * Re-times subtitles made for a video at `from` fps to play with the same video at `to` fps (the
 * PAL speed-up: a 23.976 fps film released at 25 fps runs 4.3% faster, so every time is scaled by
 * 23.976 / 25).
 */
export function changeFrameRate(doc: SubtitleDoc, from: FrameRateId, to: FrameRateId): SubtitleDoc {
  const k = frameRates[from] / frameRates[to];
  return mapTimes(doc, (t) => t * k);
}

export interface FixReport {
  /** Cues with no text, removed. */
  emptyRemoved: number;
  /** Cues repeated with the same times and text, removed. */
  duplicatesRemoved: number;
  /** Cues whose end was before (or at) their start, given a length. */
  lengthsFixed: number;
  /** Cues moved so the file runs in time order. */
  reordered: number;
  /** Cues shortened so they end when the next one starts. */
  overlapsFixed: number;
  /** Cues that started together (within 0.1 s) on one track, joined into one. */
  merged: number;
}

export const fixTotal = (r: FixReport) =>
  r.emptyRemoved + r.duplicatesRemoved + r.lengthsFixed + r.reordered + r.overlapsFixed + r.merged;

/** How long a cue with no usable end stays up: about 15 characters a second, 1 to 6 seconds. */
const readingTime = (text: string) =>
  Math.min(6000, Math.max(1000, Math.round((plain(text).length / 15) * 1000)));

const joinBody = (doc: SubtitleDoc, a: Cue, b: Cue): Cue["native"] => {
  if (!a.native && !b.native) return undefined;
  const sep = doc.format === "ass" ? "\\N" : "\n";
  const body = [a.native?.body, b.native?.body].filter((x) => x !== undefined).join(sep);
  if (doc.format !== "ass") return { ...a.native, body };
  const fields = [...(a.native?.fields ?? [])];
  const ti = (doc.eventFormat ?? []).indexOf("text");
  if (ti >= 0) fields[ti] = body;
  return { ...a.native, fields, body };
};

/**
 * Repairs timing so every player shows the file the same way: removes empty and duplicate cues,
 * gives a length to cues that end before they start, sorts by start time, joins cues that start
 * together, and shortens each cue that runs into the next one on its track.
 */
export function fixTiming(doc: SubtitleDoc): { doc: SubtitleDoc; report: FixReport } {
  const report: FixReport = {
    emptyRemoved: 0,
    duplicatesRemoved: 0,
    lengthsFixed: 0,
    reordered: 0,
    overlapsFixed: 0,
    merged: 0,
  };
  let cues = doc.cues.filter((c) => {
    if (plain(c.text).trim() !== "") return true;
    report.emptyRemoved++;
    return false;
  });
  const seen = new Set<string>();
  cues = cues.filter((c) => {
    const key = `${c.start}|${c.end}|${trackOf(doc, c)}|${c.text}`;
    if (seen.has(key)) {
      report.duplicatesRemoved++;
      return false;
    }
    seen.add(key);
    return true;
  });
  const byTrack = new Map<string, Cue[]>();
  for (const c of cues) byTrack.set(trackOf(doc, c), [...(byTrack.get(trackOf(doc, c)) ?? []), c]);
  report.reordered = [...byTrack.values()].reduce((n, t) => n + outOfOrder(t), 0);
  const sorted = cues
    .map((c, i) => ({ c, i }))
    .sort((a, b) => a.c.start - b.c.start || a.i - b.i)
    .map((x) => x.c);

  // Per track, in time order: join cues that start together, then close overlaps.
  const out: Cue[] = [];
  const lastByTrack = new Map<string, number>();
  for (const cue of sorted) {
    const c = cue;
    const track = trackOf(doc, c);
    const li = lastByTrack.get(track);
    const last = li === undefined ? undefined : out[li];
    if (last && li !== undefined && c.start - last.start < 100) {
      out[li] = {
        ...last,
        end: Math.max(last.end, c.end),
        text: `${last.text}\n${c.text}`,
        native: joinBody(doc, last, c),
      };
      report.merged++;
      continue;
    }
    if (last && li !== undefined && last.end > c.start) {
      out[li] = { ...last, end: c.start };
      report.overlapsFixed++;
    }
    lastByTrack.set(track, out.length);
    out.push(c);
  }
  // Lengths last, so a new end never runs into the next cue.
  const nextStart = new Map<number, number>();
  const pending = new Map<string, number>();
  for (let i = out.length - 1; i >= 0; i--) {
    const c = out[i];
    if (!c) continue;
    const track = trackOf(doc, c);
    const n = pending.get(track);
    if (n !== undefined) nextStart.set(i, n);
    pending.set(track, c.start);
  }
  const fixed = out.map((c, i) => {
    if (c.end > c.start) return c;
    report.lengthsFixed++;
    const limit = nextStart.get(i) ?? Number.POSITIVE_INFINITY;
    return { ...c, end: Math.max(c.start + 1, Math.min(limit, c.start + readingTime(c.text))) };
  });
  return { doc: { ...doc, cues: fixed }, report };
}
