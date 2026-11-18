/**
 * Timestamps in and out of every format, as whole milliseconds. Readers are lenient in the ways real
 * files are broken (one-digit hours, a comma where a dot belongs, two or four fraction digits);
 * writers are strict to each format's own spelling.
 */
import { withUnit } from "@/lib/format";

/**
 * Reads "h:mm:ss.fff", "mm:ss.fff" or "h:mm:ss,fff" with any number of fraction digits ("5" = 500 ms,
 * "05" = 50 ms). A colon before the fraction is not accepted: "00:00:01:500" is ambiguous with hours.
 * Returns undefined for anything else.
 */
export function parseTime(s: string): number | undefined {
  const m = /^\s*(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d+))?\s*$/.exec(s);
  if (!m) return undefined;
  const h = Number(m[1] ?? 0);
  const min = Number(m[2]);
  const sec = Number(m[3]);
  if (min > 59 || sec > 59) return undefined;
  const frac = m[4] ?? "";
  // Scale any number of digits to milliseconds, rounding a fourth digit rather than dropping it.
  const ms = frac ? Math.round(Number(`0.${frac}`) * 1000) : 0;
  return ((h * 60 + min) * 60 + sec) * 1000 + ms;
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

function split(ms: number) {
  const t = Math.max(0, Math.round(ms));
  return {
    h: Math.floor(t / 3_600_000),
    m: Math.floor((t % 3_600_000) / 60_000),
    s: Math.floor((t % 60_000) / 1000),
    ms: t % 1000,
  };
}

/** SRT: 00:01:02,345 */
export function srtTime(ms: number): string {
  const t = split(ms);
  return `${pad(t.h)}:${pad(t.m)}:${pad(t.s)},${pad(t.ms, 3)}`;
}

/** WebVTT: 00:01:02.345 (hours always written, which the spec allows). */
export function vttTime(ms: number): string {
  const t = split(ms);
  return `${pad(t.h)}:${pad(t.m)}:${pad(t.s)}.${pad(t.ms, 3)}`;
}

/** SBV (YouTube): 0:01:02.345, one-digit hours. */
export function sbvTime(ms: number): string {
  const t = split(ms);
  return `${t.h}:${pad(t.m)}:${pad(t.s)}.${pad(t.ms, 3)}`;
}

/** ASS: 0:01:02.35, centiseconds. Callers round both ends the same way so no cue collapses. */
export function assTime(ms: number): string {
  const cs = Math.max(0, Math.round(ms / 10));
  const h = Math.floor(cs / 360_000);
  const m = Math.floor((cs % 360_000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${h}:${pad(m)}:${pad(s)}.${pad(cs % 100)}`;
}

/** For the cue list: m:ss.cc under an hour, h:mm:ss.cc above; a minus sign for negative offsets. */
export function cueClock(ms: number): string {
  const neg = ms < 0;
  const cs = Math.round(Math.abs(ms) / 10);
  const h = Math.floor(cs / 360_000);
  const m = Math.floor((cs % 360_000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const body = `${h > 0 ? `${h}:${pad(m)}` : m}:${pad(s)}.${pad(cs % 100)}`;
  return neg ? `−${body}` : body;
}

/** "+1.5 s", "−250 ms": a shift amount as people say it. */
export function offsetLabel(ms: number): string {
  const sign = ms < 0 ? "−" : "+";
  const a = Math.abs(Math.round(ms));
  if (a < 1000) return `${sign}${withUnit(a, "ms")}`;
  const s = a / 1000;
  return `${sign}${withUnit(Number.isInteger(s) ? s : s.toFixed(3).replace(/0+$/, ""), "s")}`;
}
