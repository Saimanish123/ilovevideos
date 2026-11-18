/** Number formatting per README.md#content-guidelines §5. Non-breaking space before units. */
/** Non-breaking space: always between a number and its unit (content guidelines §5). */
export const NBSP = " ";

/**
 * `withUnit(12, "fps")` → "12 fps" with a non-breaking space. A negative number gets a real minus
 * sign (U+2212), not a hyphen: `withUnit(-55, "dBFS")` → "−55 dBFS" (content guidelines §5).
 */
export const withUnit = (value: string | number, unit: string) =>
  `${typeof value === "number" && value < 0 ? `−${-value}` : value}${NBSP}${unit}`;

/**
 * Decimal units (ADR-0024): 1 kB = 1,000 bytes, 1 MB = 1,000,000 bytes, as size targets, platforms
 * and phones count. SI symbols: lowercase k, capital M and G.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return `0${NBSP}B`;
  if (bytes < 1000) return `${Math.round(bytes)}${NBSP}B`;
  const units = ["kB", "MB", "GB", "TB"] as const;
  let v = bytes / 1000;
  let u = 0;
  // Promote when rounding would print "1000 kB" rather than "1 MB".
  while (u < units.length - 1 && Number(round(v)) >= 1000) {
    v /= 1000;
    u++;
  }
  return `${round(v)}${NBSP}${units[u]}`;
}

/** One decimal under 100, whole above. */
function round(n: number): string {
  return n < 100 ? n.toFixed(1).replace(/\.0$/, "") : Math.round(n).toString();
}

/** m:ss under an hour, h:mm:ss above. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

/** m:ss.hh (hundredths) for editing UIs. Matches the decimal seconds shown in inputs. */
export function formatTimecode(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00.00";
  const cs = Math.round(seconds * 100);
  const whole = Math.floor(cs / 100);
  return `${formatDuration(whole)}.${String(cs % 100).padStart(2, "0")}`;
}

export function formatDimensions(width: number, height: number): string {
  return `${width}×${height}`;
}

export function formatPercentChange(before: number, after: number): string {
  if (before <= 0) return "";
  const pct = Math.round(((after - before) / before) * 100);
  // No change is not a loss: no "−0%".
  if (pct === 0) return "";
  return `${pct > 0 ? "+" : "−"}${Math.abs(pct)}%`;
}

/** "clip.mov" → "clip" */
export function baseName(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i > 0 ? filename.slice(0, i) : filename;
}

/** Shell-quote a filename for the displayed ffmpeg command. */
export function shellQuote(s: string): string {
  return /^[\w.-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`;
}

/** "1 frame", "1,200 frames": a count with its noun, singular for one. */
export function formatCount(n: number, noun: string, plural = `${noun}s`): string {
  return `${n.toLocaleString("en")} ${n === 1 ? noun : plural}`;
}
