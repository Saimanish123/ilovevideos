/**
 * A timed layer that fades in and out: its opacity at a moment, and the same thing as an ffmpeg
 * filter. Shared by the layers drawn over video (text overlay); the watermark's hard on/off range is
 * the special case with no fade. Pure.
 */

export interface TimedRange {
  start: number;
  end: number;
}

/**
 * Opacity at `t` seconds: 0 outside the range, rising linearly over `fade` seconds after the start
 * and falling over `fade` seconds before the end (each fade at most half the range).
 */
export function fadeAlpha(range: TimedRange, fade: number, t: number): number {
  if (t < range.start || t >= range.end) return 0;
  const f = Math.min(fade, (range.end - range.start) / 2);
  if (f <= 0) return 1;
  return Math.max(0, Math.min(1, (t - range.start) / f, (range.end - t) / f));
}

/**
 * ffmpeg's filter graph for a still layer (input 1, a looped PNG) over the video (input 0): alpha
 * fades on the layer, shown only inside the range, placed at x, y.
 */
export function fadeOverlayFilter(
  range: TimedRange,
  fade: number,
  x: number,
  y: number,
  videoDurationSec: number,
): string {
  const f = Math.min(fade, (range.end - range.start) / 2);
  const fades =
    f > 0
      ? `,fade=t=in:st=${range.start.toFixed(3)}:d=${f.toFixed(3)}:alpha=1,fade=t=out:st=${(range.end - f).toFixed(3)}:d=${f.toFixed(3)}:alpha=1`
      : "";
  const whole = range.start <= 0 && range.end >= videoDurationSec;
  const enable = whole
    ? ""
    : `:enable='between(t,${range.start.toFixed(3)},${range.end.toFixed(3)})'`;
  return `[1:v]format=rgba${fades}[m];[0:v][m]overlay=${x}:${y}:shortest=1${enable}[v]`;
}
