/** Fade maths for the result line and the ffmpeg command. Pure; safe on the page. */
import { formatTimecode } from "@/lib/format";
import { type FadeOptions, fitFades } from "../video-filter/options";

const seconds = (s: number) => `${Number(s.toFixed(2))} s`;

/** ffmpeg `fade` filters for the picture and `afade` for the sound, over the fitted fades. */
export function fadeFilters(o: FadeOptions, duration: number): { vf: string; af: string } {
  const { fadeIn, fadeOut } = fitFades(o, duration);
  const r = (n: number) => Number(n.toFixed(3));
  const v: string[] = [];
  const a: string[] = [];
  if (fadeIn > 0) {
    v.push(`fade=t=in:st=0:d=${r(fadeIn)}:c=${o.color}`);
    a.push(`afade=t=in:st=0:d=${r(fadeIn)}`);
  }
  if (fadeOut > 0) {
    v.push(`fade=t=out:st=${r(duration - fadeOut)}:d=${r(fadeOut)}:c=${o.color}`);
    a.push(`afade=t=out:st=${r(duration - fadeOut)}:d=${r(fadeOut)}`);
  }
  return { vf: [...v, "format=yuv420p"].join(","), af: a.join(",") };
}

/** "fades 1 s in, 2 s out, from black". */
export function fadeWhat(o: FadeOptions, duration: number): string {
  const { fadeIn, fadeOut } = fitFades(o, duration);
  const parts = [
    fadeIn > 0 ? `${seconds(fadeIn)} in` : "",
    fadeOut > 0 ? `${seconds(fadeOut)} out` : "",
  ].filter(Boolean);
  return `fades ${parts.join(", ")}, ${o.color === "black" ? "black" : "white"}`;
}

/** Where the fade out starts, as a timecode, for the verdict. */
export const fadeOutStart = (o: FadeOptions, duration: number) =>
  formatTimecode(duration - fitFades(o, duration).fadeOut);
