/**
 * Slideshow timing and shape: when each picture shows, how crossfades and the slow zoom run, the
 * output size, and the equivalent ffmpeg command. Pure; shared by the panel, the worker engine and
 * the unit tests.
 *
 * Timeline: N pictures of `d` seconds each make N × d seconds. The fade into picture k starts at
 * k × d and lasts `x`, drawn over the picture before it, so the total length never changes with the
 * transition (the same model as ffmpeg's xfade with offsets at k × d).
 */
import { z } from "zod";
import { shellQuote } from "@/lib/format";

export const slideShapes = ["16:9", "1:1", "9:16", "4:5", "first"] as const;
export type SlideShape = (typeof slideShapes)[number];

export const SLIDE_FPS = 30;
/** Crossfade length, at most half a picture's time. */
export const FADE_SEC = 0.6;
/** Slow zoom: each picture grows (or shrinks) by this share while it shows. */
export const ZOOM = 0.08;
/** Music longer than the slideshow is cut and faded out over this long. */
export const MUSIC_FADE_SEC = 2;
export const MAX_IMAGES = 200;
export const MAX_EDGE = 1920;

export const ImagesToVideoOptions = z.object({
  /** Seconds each picture shows (ignored when `fitMusic` and there is music). */
  seconds: z.number().min(0.5).max(60).default(3),
  transition: z.enum(["none", "crossfade"]).default("crossfade"),
  /** Slow zoom, alternating in and out (Ken Burns). */
  motion: z.boolean().default(false),
  shape: z.enum(slideShapes).default("16:9"),
  fit: z.enum(["blur", "black", "fill"]).default("blur"),
  music: z
    .object({ name: z.string(), blob: z.instanceof(Blob), durationSec: z.number().positive() })
    .optional(),
  /** Stretch the pictures' time so the slideshow lasts as long as the music. */
  fitMusic: z.boolean().default(false),
});
export type ImagesToVideoOptions = z.infer<typeof ImagesToVideoOptions>;

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

export function slideSize(
  shape: SlideShape,
  first?: { width: number; height: number },
): { width: number; height: number } {
  if (shape === "1:1") return { width: 1080, height: 1080 };
  if (shape === "9:16") return { width: 1080, height: 1920 };
  if (shape === "4:5") return { width: 1080, height: 1350 };
  if (shape === "first" && first && first.width > 0 && first.height > 0) {
    const scale = Math.min(1, MAX_EDGE / Math.max(first.width, first.height));
    return { width: even(first.width * scale), height: even(first.height * scale) };
  }
  return { width: 1920, height: 1080 };
}

/** Seconds per picture after fitting to the music, if asked. */
export function perImage(o: ImagesToVideoOptions, count: number): number {
  if (o.fitMusic && o.music && count > 0) return Math.max(0.5, o.music.durationSec / count);
  return o.seconds;
}

export const fadeOf = (o: ImagesToVideoOptions, d: number) =>
  o.transition === "crossfade" ? Math.min(FADE_SEC, d / 2) : 0;

export interface Frame {
  /** The picture drawn fully. */
  base: number;
  /** Zoom progress of `base`, 0–1. */
  baseProgress: number;
  /** The picture fading in over it, with its opacity and zoom progress. */
  top?: { index: number; alpha: number; progress: number };
}

/** Which pictures a frame at `t` shows, and how far each is through its zoom. */
export function frameAt(t: number, count: number, d: number, x: number): Frame {
  const total = count * d;
  const k = Math.min(count - 1, Math.max(0, Math.floor(t / d + 1e-9)));
  // A picture is on screen from the start of its fade in to the end of the next one's.
  const progress = (i: number) => {
    const start = i * d;
    const end = i === count - 1 ? total : (i + 1) * d + x;
    return Math.min(1, Math.max(0, (t - start) / Math.max(1e-6, end - start)));
  };
  if (k >= 1 && x > 0 && t - k * d < x)
    return {
      base: k - 1,
      baseProgress: progress(k - 1),
      top: { index: k, alpha: (t - k * d) / x, progress: progress(k) },
    };
  return { base: k, baseProgress: progress(k) };
}

/** Zoom factor of picture `i` at progress `p`: even pictures grow, odd ones shrink. */
export const zoomAt = (i: number, p: number) => (i % 2 === 0 ? 1 + ZOOM * p : 1 + ZOOM * (1 - p));

export function slideshowCommand(
  names: string[],
  o: ImagesToVideoOptions,
  size: { width: number; height: number },
  out: string,
): string {
  const n = names.length;
  const d = perImage(o, n);
  const x = fadeOf(o, d);
  const { width: w, height: h } = size;
  const fg = `scale=${w}:${h}:force_original_aspect_ratio=decrease`;
  const inputs = names
    .map((name, i) => `-loop 1 -t ${(i < n - 1 ? d + x : d).toFixed(3)} -i ${shellQuote(name)}`)
    .join(" ");
  const frames = Math.round((d + x) * SLIDE_FPS);
  const zoom = (i: number) =>
    o.motion
      ? `,zoompan=z='${i % 2 === 0 ? `1+${ZOOM}*on/${frames}` : `${1 + ZOOM}-${ZOOM}*on/${frames}`}':d=${frames}:s=${w}x${h}:fps=${SLIDE_FPS}`
      : "";
  const each = names.map((_, i) => {
    const tail = `setsar=1,fps=${SLIDE_FPS}${zoom(i)},format=yuv420p[v${i}]`;
    if (o.fit === "fill")
      return `[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},${tail}`;
    if (o.fit === "black") return `[${i}:v]${fg},pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,${tail}`;
    return `[${i}:v]split[a${i}][b${i}];[a${i}]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},boxblur=40[g${i}];[b${i}]${fg}[f${i}];[g${i}][f${i}]overlay=(W-w)/2:(H-h)/2,${tail}`;
  });
  let chain = "";
  let last = "v0";
  for (let k = 1; k < n; k++) {
    const next = `x${k}`;
    chain +=
      x > 0
        ? `;[${last}][v${k}]xfade=transition=fade:duration=${x.toFixed(3)}:offset=${(k * d).toFixed(3)}[${next}]`
        : `;[${last}][v${k}]concat=n=2:v=1:a=0[${next}]`;
    last = next;
  }
  const musicIn = o.music ? ` -i ${shellQuote(o.music.name)}` : "";
  const musicOut = o.music
    ? ` -map ${n}:a -c:a aac -b:a 192k -af "afade=t=out:st=${Math.max(0, n * d - MUSIC_FADE_SEC).toFixed(3)}:d=${MUSIC_FADE_SEC}"`
    : "";
  return `ffmpeg ${inputs}${musicIn} -filter_complex "${each.join(";")}${chain}" -map "[${last}]"${musicOut} -t ${(n * d).toFixed(3)} -c:v libx264 -r ${SLIDE_FPS} -pix_fmt yuv420p -movflags +faststart ${shellQuote(out)}`;
}
