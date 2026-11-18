/**
 * Fade gains. A fade-in rises from silence at 0 s to full level at `fadeIn` seconds; a fade-out falls
 * from full level at `duration − fadeOut` to silence at the end. Two shapes, each the same curve as an
 * ffmpeg `afade` so the shown command is exact: "smooth" is a quarter sine (`curve=qsin`, −3 dB at
 * the midpoint), "linear" is a straight line in amplitude (`curve=tri`, −6 dB at the midpoint).
 * Pure: no DOM, no mediabunny. Shared by the engine, the panel's envelope and the tests.
 */

export type FadeCurve = "smooth" | "linear";

export interface FadeSpec {
  /** Seconds of fade-in from the start; 0 for none. */
  fadeIn: number;
  /** Seconds of fade-out to the end; 0 for none. */
  fadeOut: number;
  curve: FadeCurve;
}

/** The ffmpeg `afade` curve name for a shape. */
export const ffmpegCurve = (c: FadeCurve) => (c === "smooth" ? "qsin" : "tri");

const shape = (x: number, c: FadeCurve) => {
  const t = Math.min(1, Math.max(0, x));
  return c === "smooth" ? Math.sin((t * Math.PI) / 2) : t;
};

/**
 * Fades that fit the sound: each is at most the whole length, and when the two together are longer
 * than the sound they meet where the fade-in's share of the total says, so neither is silently lost.
 */
export function fitFades(f: FadeSpec, duration: number): FadeSpec {
  const d = Math.max(0, duration);
  let fadeIn = Math.max(0, f.fadeIn);
  let fadeOut = Math.max(0, f.fadeOut);
  if (fadeIn + fadeOut > d && fadeIn + fadeOut > 0) {
    const k = d / (fadeIn + fadeOut);
    fadeIn *= k;
    fadeOut *= k;
  }
  return { ...f, fadeIn, fadeOut };
}

/** Gain (0–1) at `t` seconds of a sound `duration` seconds long. Assumes fitted fades. */
export function fadeGain(t: number, duration: number, f: FadeSpec): number {
  let g = 1;
  if (f.fadeIn > 0 && t < f.fadeIn) g *= shape(t / f.fadeIn, f.curve);
  if (f.fadeOut > 0 && t > duration - f.fadeOut) g *= shape((duration - t) / f.fadeOut, f.curve);
  return g;
}

/** ffmpeg filter for the same fades, e.g. "afade=t=in:d=2:curve=qsin,afade=t=out:st=58:d=3:curve=qsin". */
export function fadeFilter(f: FadeSpec, duration: number): string {
  const r = (x: number) => Math.round(x * 1000) / 1000;
  const parts: string[] = [];
  if (f.fadeIn > 0) parts.push(`afade=t=in:d=${r(f.fadeIn)}:curve=${ffmpegCurve(f.curve)}`);
  if (f.fadeOut > 0)
    parts.push(
      `afade=t=out:st=${r(Math.max(0, duration - f.fadeOut))}:d=${r(f.fadeOut)}:curve=${ffmpegCurve(f.curve)}`,
    );
  return parts.join(",");
}
