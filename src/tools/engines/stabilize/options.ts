/**
 * Stabilize video (feature D7): options and the numbers the panel, the worker and the ffmpeg
 * command share. Pure; safe to import on the page.
 *
 * Two passes: the motion between every pair of neighbouring frames is measured on a small grey
 * copy (./motion), the camera's path is smoothed and held inside the picture (./path), then every
 * frame is redrawn through its correction (./warp) and encoded once. Strength sets how long a
 * movement must last to be kept (the smoothing window) and how far the correction may reach.
 */
import { z } from "zod";
import { shellQuote } from "@/lib/format";
import { ffmpegSoundEncoder, type VideoSoundCodec } from "../sound-codec";

export const strengths = ["light", "medium", "strong"] as const;
export type Strength = (typeof strengths)[number];

export const StabilizeOptions = z.object({
  strength: z.enum(strengths).default("medium"),
  /** zoom: the picture is enlarged just enough to hide moving edges; borders: size kept, edges show. */
  edges: z.enum(["zoom", "borders"]).default("zoom"),
});
export type StabilizeOptions = z.infer<typeof StabilizeOptions>;

export interface StrengthPlan {
  /** Smoothing window: the Gaussian's sigma, seconds. Movements slower than this are kept. */
  sigmaSec: number;
  /** The most the correction may uncover, as the zoom that would hide it. */
  maxZoom: number;
  label: string;
}

export const strengthPlans: Record<Strength, StrengthPlan> = {
  light: { sigmaSec: 0.33, maxZoom: 1.08, label: "Light" },
  medium: { sigmaSec: 1, maxZoom: 1.15, label: "Medium" },
  strong: { sigmaSec: 2.5, maxZoom: 1.25, label: "Strong" },
};

/** The analysis copy's width: motion is measured at this size (or the source's, if smaller). */
export const ANALYSIS_WIDTH = 320;

/** The analysis size for a picture, even edges, the source's shape. */
export function analysisSize(width: number, height: number): { width: number; height: number } {
  const w = Math.min(ANALYSIS_WIDTH, width);
  const k = w / width;
  return {
    width: Math.max(16, Math.round(w / 2) * 2),
    height: Math.max(16, Math.round((height * k) / 2) * 2),
  };
}

/** Smoothing window in frames for a frame rate. */
export const sigmaFrames = (o: StabilizeOptions, fps: number) =>
  strengthPlans[o.strength].sigmaSec * (fps > 0 && Number.isFinite(fps) ? fps : 30);

/**
 * The two-pass vidstab commands that do the closest thing (its smoothing is a window radius in
 * frames; `optzoom=1` is its fitted zoom). vidstab is in most full FFmpeg builds, not all.
 */
export function stabilizeCommand(
  input: string,
  output: string,
  o: StabilizeOptions,
  fps: number,
  kbps: number,
  audio: "copy" | "none" | VideoSoundCodec,
  evenCut: string,
): string {
  const smoothing = Math.round(sigmaFrames(o, fps) * 2);
  const zoom = o.edges === "zoom" ? "optzoom=1" : "optzoom=0:crop=black";
  const a =
    audio === "none"
      ? "-an"
      : audio === "copy"
        ? "-c:a copy"
        : `-c:a ${ffmpegSoundEncoder(audio)}${audio === "pcm-s16" ? "" : " -b:a 128k"}`;
  const cut = evenCut ? `,${evenCut}` : "";
  return `ffmpeg -i ${shellQuote(input)} -vf vidstabdetect=shakiness=8:result=transforms.trf -f null - && ffmpeg -i ${shellQuote(input)} -vf "vidstabtransform=input=transforms.trf:smoothing=${smoothing}:${zoom}:interpol=bicubic${cut}" -c:v libx264 -b:v ${kbps}k -pix_fmt yuv420p ${a} -movflags +faststart ${shellQuote(output)}`;
}

/** "medium, zoomed 9%" or "light, edges show". */
export function stabilizeWords(o: StabilizeOptions, zoom?: number): string {
  const s = strengthPlans[o.strength].label.toLowerCase();
  if (o.edges === "borders") return `${s}, borders at moving edges`;
  if (zoom === undefined)
    return `${s}, zoomed up to ${Math.round((strengthPlans[o.strength].maxZoom - 1) * 100)}%`;
  return `${s}, zoomed ${Math.round((zoom - 1) * 100)}%`;
}
