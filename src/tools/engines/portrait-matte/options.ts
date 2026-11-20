/**
 * Background without a green screen (feature G14, ADR-0118): options and the pure maths every path
 * shares (ADR-0035). Used by the panel, the live preview, the engine worker and the unit tests.
 *
 * A small person-segmentation model (MediaPipe Selfie Segmentation, ./segmenter) gives the chance
 * that each pixel of a 256-wide copy of the frame is a person. That coarse mask is
 * 1. steadied over time where the model is unsure (./smooth, MediaPipe's uncertainty-weighted blend,
 *    with the next frame's mask too when a file is processed, since the future is known),
 * 2. brought to the picture's own edges with a guided filter that uses the frame as the guide
 *    (./render), so the outline follows hair and shoulders instead of the model's blocky grid,
 * 3. shaped by the edge controls (`edge`, `shift`), and the background is blurred (with the person
 *    left out of the blur, so no halo of them smears into it) or replaced by a colour, a picture or
 *    a video (the green screen's backgrounds, ../chroma-key/background).
 */
import { z } from "zod";
import { shellQuote } from "@/lib/format";
import { Background, Rgb } from "../chroma-key/options";
import { withEvenCropOut } from "../crop/math";
import { ffmpegSoundEncoder, type VideoSoundCodec } from "../sound-codec";

export { Background, Rgb };

/**
 * The two models: the 144×256 one for wide pictures, the 256×256 one for square and vertical.
 * `bytes` is each model's two files as stored, the one size figure the page states (the loading
 * line) and the prose rounds ("about 330 kB"). The runtime comes on top (about 155 kB gzip).
 */
export const MODELS = {
  landscape: { width: 256, height: 144, bytes: 123_195 + 212_980 },
  general: { width: 256, height: 256, bytes: 119_532 + 212_900 },
} as const;
export type ModelKind = keyof typeof MODELS;

/**
 * Which model suits a picture of this shape: the frame is stretched to the model's input, so the
 * one whose shape is nearer (on a log scale; the boundary is √(16/9) ≈ 4:3) distorts it least.
 */
export function modelFor(width: number, height: number): ModelKind {
  return width / Math.max(1, height) >= 4 / 3 ? "landscape" : "general";
}

export const PortraitMatteOptions = z.object({
  /** What goes behind the person. */
  effect: z.enum(["blur", "color", "image", "video"]).default("blur"),
  /** Blur strength, 1 to 100 (./options `blurSigma`). */
  blur: z.number().min(1).max(100).default(40),
  /** The colour behind the person ("color"), and around a contained picture. */
  color: Rgb.default([255, 255, 255]),
  /** The picture or video for "image" and "video" (the green screen's shape). */
  background: Background.default({ kind: "color" }),
  fit: z.enum(["cover", "contain"]).default("cover"),
  /** A background video shorter than the foreground loops or holds its last frame. */
  bgEnd: z.enum(["loop", "hold"]).default("loop"),
  /** 0 to 100: how wide the person's edge fades (0 crisp, 100 soft). */
  edge: z.number().min(0).max(100).default(35),
  /** −50 to 50: moves the edge in (negative, tighter) or out (positive, looser). */
  shift: z.number().min(-50).max(50).default(0),
  /** "mask" writes the person mask itself (white person on black) instead of the result. */
  output: z.enum(["result", "mask"]).default("result"),
  sound: z.enum(["keep", "none"]).default("keep"),
  /**
   * Engine internals for the measurements (tests/e2e), not offered on the page: the steadying over
   * time, the next frame's mask in it, and the guided filter (off: the mask is only enlarged).
   */
  steady: z.boolean().default(true),
  lookahead: z.boolean().default(true),
  refine: z.boolean().default(true),
});
export type PortraitMatteOptions = z.infer<typeof PortraitMatteOptions>;

export interface Size {
  width: number;
  height: number;
}

/** Blur strength as a Gaussian sigma in output pixels: up to 5% of the picture's shorter edge. */
export function blurSigma(strength: number, frame: Size): number {
  const short = Math.min(frame.width, frame.height);
  return Math.max(0.5, (short * 0.05 * Math.min(100, Math.max(1, strength))) / 100);
}

/** Where the edge sits at Edge in or out 0, on the refined mask's 0 to 1 scale. */
export const EDGE_CENTRE = 0.56;

/** The edge ramp on the refined mask: transparent below `lo`, opaque above `hi`. */
export function edgeRamp(o: Pick<PortraitMatteOptions, "edge" | "shift">) {
  const half = 0.02 + (Math.min(100, Math.max(0, o.edge)) / 100) * 0.38;
  // Tighter (negative) needs more certainty for the person, so the centre moves up. At 0 it sits a
  // little above ½: the model's mask runs slightly wide of people, and on the person fixtures this
  // centre gave the cleanest edge over a new background (ADR-0120).
  const centre = EDGE_CENTRE - (Math.min(50, Math.max(-50, o.shift)) / 50) * 0.3;
  return { lo: centre - half, hi: centre + half };
}

/** The ramp applied to one refined value; the shader computes the same (smoothstep). */
export function applyRamp(q: number, r: { lo: number; hi: number }): number {
  const t = Math.min(1, Math.max(0, (q - r.lo) / Math.max(1e-3, r.hi - r.lo)));
  return t * t * (3 - 2 * t);
}

/**
 * Words for the summary line. The background file's name and the loop choice are not repeated:
 * the panel shows both.
 */
export function effectWords(o: PortraitMatteOptions): string {
  if (o.output === "mask") return "Person mask only";
  if (o.effect === "blur") return `Background blurred, ${blurWord(o.blur)}`;
  if (o.effect === "color") return `Background removed, on ${hex(o.color).toUpperCase()}`;
  return `Background replaced with ${o.effect === "image" ? "a picture" : "a video"}`;
}

/** The done state's title, echoing the button. */
export function resultTitle(o: PortraitMatteOptions): string {
  if (o.output === "mask") return "Mask made";
  if (o.effect === "blur") return "Background blurred";
  return o.effect === "color" ? "Background removed" : "Background replaced";
}

export function blurWord(strength: number): string {
  return strength < 25 ? "light" : strength < 60 ? "medium" : "strong";
}

export const hex = (c: Rgb) => `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;

/** The page's choice of background, whether its file has been picked or not. */
export function backgroundReady(o: PortraitMatteOptions): boolean {
  if (o.output === "mask") return true;
  if (o.effect === "image") return o.background.kind === "image";
  if (o.effect === "video") return o.background.kind === "video";
  return true;
}

// ffmpeg command ----------------------------------------------------------------------------------

/**
 * FFmpeg has no person finder in a standard build, so the command is the compositing half: given
 * the person mask as a video (`mask.mp4`, which this page writes with Output: Mask only), it blurs or
 * replaces the background the same way. The mask itself has no FFmpeg equivalent.
 */
export function matteCommand(
  o: PortraitMatteOptions,
  input: string,
  output: string,
  frame: Size,
  durationSec: number,
  kbps: number,
  audio: "copy" | "none" | VideoSoundCodec,
): string {
  const W = frame.width;
  const H = frame.height;
  const a =
    audio === "none"
      ? "-an"
      : audio === "copy"
        ? "-map '0:a?' -c:a copy"
        : `-map '0:a?' -c:a ${ffmpegSoundEncoder(audio)}`;
  const mask = `[1:v]format=gray,scale=${W}:${H}[m]`;
  if (o.output === "mask")
    return `# The person mask has no FFmpeg equivalent; this page writes it as ${shellQuote(output)}.`;
  const bgColor = `0x${hex(o.color).slice(1)}`;
  const fit =
    o.fit === "cover"
      ? `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`
      : `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=${bgColor}`;
  let extra = "";
  let bg: string;
  if (o.effect === "blur") {
    bg = `[0:v]split[a][b];[b]gblur=sigma=${blurSigma(o.blur, frame).toFixed(1)}[bg]`;
  } else if (o.effect === "color" || o.background.kind === "color") {
    extra = ` -f lavfi -i color=c=${bgColor}:s=${W}x${H}:d=${durationSec.toFixed(3)}`;
    bg = "[0:v]null[a];[2:v]null[bg]";
  } else if (o.background.kind === "image") {
    extra = ` -loop 1 -i ${shellQuote(o.background.name)}`;
    bg = `[0:v]null[a];[2:v]${fit}[bg]`;
  } else {
    extra = ` ${o.bgEnd === "loop" ? "-stream_loop -1 " : ""}-i ${shellQuote(o.background.name)}`;
    bg = `[0:v]null[a];[2:v]${fit}${o.bgEnd === "hold" ? `,tpad=stop_mode=clone:stop_duration=${durationSec.toFixed(3)}` : ""}[bg]`;
  }
  const graph = withEvenCropOut(
    frame,
    `${bg};${mask};[a][m]alphamerge[fg];[bg][fg]overlay=shortest=1,format=yuv420p[v]`,
  );
  return `ffmpeg -i ${shellQuote(input)} -i mask.mp4${extra} -filter_complex "${graph}" -map "[v]" ${a} -c:v libx264 -b:v ${kbps}k -t ${durationSec.toFixed(3)} ${shellQuote(output)}`;
}
