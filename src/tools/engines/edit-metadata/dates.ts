/**
 * Creation dates in MP4 and MOV files (ADR-0096). A file carries its recording time in up to three
 * kinds of place, all edited together so no app reads a stale one:
 *
 * - The movie, track and media headers (`mvhd`, every `tkhd` and `mdhd`): creation and modification
 *   time, whole seconds since 1904-01-01 UTC. Version 0 boxes hold 32 bits (up to 2040-02-06), version
 *   1 boxes 64.
 * - Apple's metadata key `com.apple.quicktime.creationdate` (iPhones, Macs): local time with its
 *   offset from UTC, "2024-05-04T10:20:30+0200". Updated where the file has it, never added.
 *
 * Pure; no DOM, no mediabunny. Unit-tested.
 */
import { z } from "zod";

/** Seconds from 1904-01-01 (the ISO BMFF epoch) to 1970-01-01. */
export const MP4_EPOCH = 2_082_844_800;
const MAX_U32 = 0xffff_ffff;
export const CREATION_KEY = "com.apple.quicktime.creationdate";
/** FFmpeg's copy of the creation time as a metadata key (`-movflags use_metadata_tags`), UTC. */
export const FFMPEG_CREATION_KEY = "creation_time";

export const DateChange = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("set"),
    /** Local wall-clock time, "YYYY-MM-DDTHH:MM" or with ":SS". */
    local: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/),
    /** Minutes east of UTC for that local time (+120 for UTC+2). */
    offsetMin: z
      .number()
      .int()
      .min(-12 * 60)
      .max(14 * 60),
  }),
  z.object({
    mode: z.literal("shift"),
    /** Seconds added to every date (negative moves them earlier). */
    seconds: z
      .number()
      .int()
      .min(-100 * 365 * 86400)
      .max(100 * 365 * 86400),
  }),
]);
export type DateChange = z.infer<typeof DateChange>;

/** Milliseconds since 1970 UTC for a "set" change. */
export function setInstant(c: Extract<DateChange, { mode: "set" }>): number {
  const [d, t] = c.local.split("T");
  const [y, mo, da] = (d ?? "").split("-").map(Number);
  const [h, mi, s] = (t ?? "").split(":").map(Number);
  return (
    Date.UTC(y ?? 1970, (mo ?? 1) - 1, da ?? 1, h ?? 0, mi ?? 0, s ?? 0) - c.offsetMin * 60_000
  );
}

/** A header time (seconds since 1904) after the change; 0 ("not set") stays 0 when shifting. */
export function newHeaderTime(old: number, c: DateChange): number {
  if (c.mode === "set") return Math.floor(setInstant(c) / 1000) + MP4_EPOCH;
  if (old === 0) return 0;
  return old + c.seconds;
}

export interface QtDate {
  /** Milliseconds since 1970 UTC. */
  utcMs: number;
  /** Minutes east of UTC as written ("+0200" is 120); undefined when the text had no offset. */
  offsetMin?: number;
}

/** Reads Apple's creation date text: "2024-05-04T10:20:30+0200", "+02:00", "Z", optional fraction. */
export function parseQtDate(s: string): QtDate | undefined {
  const m = s
    .trim()
    .match(
      /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/,
    );
  if (!m) return undefined;
  const [, y, mo, d, h, mi, sec, tz] = m;
  let offsetMin: number | undefined;
  if (tz === "Z") offsetMin = 0;
  else if (tz) {
    const sign = tz.startsWith("-") ? -1 : 1;
    const digits = tz.slice(1).replace(":", "");
    offsetMin = sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4)));
  }
  const local = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(sec ?? 0),
  );
  return { utcMs: local - (offsetMin ?? 0) * 60_000, offsetMin };
}

const pad = (n: number, w = 2) => String(Math.abs(n)).padStart(w, "0");

/** Apple's form, as iPhones write it: "2024-05-04T10:20:30+0200". */
export function formatQtDate(utcMs: number, offsetMin: number): string {
  const t = new Date(utcMs + offsetMin * 60_000);
  const sign = offsetMin < 0 ? "-" : "+";
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}T${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}${sign}${pad(Math.trunc(offsetMin / 60))}${pad(offsetMin % 60)}`;
}

/**
 * A date key's new text in the style it was written: Apple's local time with its offset (kept when
 * shifting), or UTC ending in Z with the same number of fraction digits (FFmpeg's `creation_time`).
 */
export function newKeyDate(old: string, c: DateChange): string | undefined {
  const q = parseQtDate(old);
  const utc = /Z$/.test(old.trim());
  if (c.mode === "shift" && !q) return undefined;
  const ms = c.mode === "set" ? setInstant(c) : (q?.utcMs ?? 0) + c.seconds * 1000;
  if (utc) {
    const digits = old.trim().match(/\.(\d+)Z$/)?.[1]?.length ?? 0;
    const base = new Date(ms).toISOString().slice(0, 19);
    return `${base}${digits ? `.${"0".repeat(digits)}` : ""}Z`;
  }
  return formatQtDate(ms, c.mode === "set" ? c.offsetMin : (q?.offsetMin ?? 0));
}

/** Human form of a time for the page: "4 May 2024, 10:20:30 UTC+02:00". */
export function describeInstant(utcMs: number, offsetMin: number): string {
  const t = new Date(utcMs + offsetMin * 60_000);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const sign = offsetMin < 0 ? "−" : "+";
  const zone =
    offsetMin === 0 ? "UTC" : `UTC${sign}${pad(Math.trunc(offsetMin / 60))}:${pad(offsetMin % 60)}`;
  return `${t.getUTCDate()} ${months[t.getUTCMonth()]} ${t.getUTCFullYear()}, ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())} ${zone}`;
}

/** "+1 h", "−30 min", "+2 d 3 h": a shift in words. */
export function describeShift(seconds: number): string {
  if (seconds === 0) return "no change";
  const sign = seconds < 0 ? "−" : "+";
  let s = Math.abs(seconds);
  const parts: string[] = [];
  const d = Math.floor(s / 86400);
  s -= d * 86400;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  if (d) parts.push(`${d} d`);
  if (h) parts.push(`${h} h`);
  if (m) parts.push(`${m} min`);
  if (s) parts.push(`${s} s`);
  return `${sign}${parts.join(" ")}`;
}

export interface HeaderTime {
  /** Offset of the 32- or 64-bit creation time field within the moov bytes. */
  at: number;
  version: number;
  box: "mvhd" | "tkhd" | "mdhd";
}

/** Every header creation-time field (modification time follows it), in file order. */
export function headerTimes(moov: Uint8Array): HeaderTime[] {
  const view = new DataView(moov.buffer, moov.byteOffset, moov.byteLength);
  const out: HeaderTime[] = [];
  const kids = (from: number, to: number) => {
    const r: { type: string; body: number; end: number }[] = [];
    for (let at = from; at + 8 <= to; ) {
      let size = view.getUint32(at);
      let head = 8;
      if (size === 1) {
        size = Number(view.getBigUint64(at + 8));
        head = 16;
      } else if (size === 0) size = to - at;
      if (size < head || at + size > to) break;
      r.push({
        type: String.fromCharCode(...moov.subarray(at + 4, at + 8)),
        body: at + head,
        end: at + size,
      });
      at += size;
    }
    return r;
  };
  const top = kids(0, moov.length)[0];
  if (top?.type !== "moov") return out;
  const add = (b: { type: string; body: number }) =>
    out.push({ at: b.body + 4, version: moov[b.body] ?? 0, box: b.type as HeaderTime["box"] });
  for (const c of kids(top.body, top.end)) {
    if (c.type === "mvhd") add(c);
    if (c.type !== "trak") continue;
    for (const t of kids(c.body, c.end)) {
      if (t.type === "tkhd") add(t);
      if (t.type === "mdia") for (const m of kids(t.body, t.end)) if (m.type === "mdhd") add(m);
    }
  }
  return out;
}

const readTime = (view: DataView, h: HeaderTime, which: 0 | 1) =>
  h.version === 1 ? Number(view.getBigUint64(h.at + which * 8)) : view.getUint32(h.at + which * 4);

/** The movie header's creation time (seconds since 1904), or undefined. */
export function movieCreation(moov: Uint8Array): number | undefined {
  const h = headerTimes(moov).find((x) => x.box === "mvhd");
  if (!h) return undefined;
  return readTime(new DataView(moov.buffer, moov.byteOffset, moov.byteLength), h, 0);
}

/**
 * Rewrites every header's creation and modification time in place. Throws (before changing
 * anything) when a time would not fit its field: before 1904, or after 2040-02-06 in a version 0 box.
 * Returns how many headers changed.
 */
export function retimeHeaders(moov: Uint8Array, c: DateChange): number {
  const view = new DataView(moov.buffer, moov.byteOffset, moov.byteLength);
  const plan: { h: HeaderTime; which: 0 | 1; value: number }[] = [];
  for (const h of headerTimes(moov)) {
    for (const which of [0, 1] as const) {
      const old = readTime(view, h, which);
      const value = newHeaderTime(old, c);
      if (value === old) continue;
      if (value < 0) throw new RangeError("before 1904");
      if (h.version === 0 && value > MAX_U32) throw new RangeError("after 2040");
      plan.push({ h, which, value });
    }
  }
  const changed = new Set<number>();
  for (const { h, which, value } of plan) {
    if (h.version === 1) view.setBigUint64(h.at + which * 8, BigInt(value));
    else view.setUint32(h.at + which * 4, value);
    changed.add(h.at);
  }
  return changed.size;
}
