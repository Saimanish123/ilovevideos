/**
 * GIF → video options and the pure math the panel, the worker engine and the ffmpeg runner share.
 * Safe to import on the page (no mediabunny).
 */
import { z } from "zod";
import { baseName, shellQuote } from "@/lib/format";
import type { MediaInfo } from "../types";
import type { GifFacts } from "./gif";

export const repeatChoices = [1, 2, 3, 5] as const;

export const GifToVideoOptions = z.object({
  to: z.enum(["mp4", "webm"]).default("mp4"),
  /** How many times the animation plays in the file. Lengthens a short loop; 1 = once, as the GIF plays. */
  repeat: z.number().int().min(1).max(10).default(1),
});
export type GifToVideoOptions = z.infer<typeof GifToVideoOptions>;

/** H.264 with 4:2:0 chroma needs even edges: an odd GIF edge is scaled down by one pixel. */
export function evenSize(width: number, height: number) {
  const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);
  return { width: even(width), height: even(height) };
}

/** MediaInfo for the stage (file card, summary), from the parsed header. No decoding. */
export function gifInfo(facts: GifFacts, sizeBytes: number): MediaInfo {
  return {
    container: "GIF",
    durationSec: facts.durationSec,
    sizeBytes,
    video: {
      codec: "gif",
      width: facts.width,
      height: facts.height,
      fps: facts.durationSec > 0 ? facts.delays.length / facts.durationSec : 10,
    },
    audio: [],
  };
}

/** Frames in the GIF, recovered from the average rate the inspector stored. */
export const frameCountOf = (info: MediaInfo) =>
  Math.max(1, Math.round((info.video?.fps ?? 10) * info.durationSec));

export const outputName = (fileName: string, to: GifToVideoOptions["to"]) =>
  `${baseName(fileName)}.${to}`;

/**
 * The command that reproduces the run. The `loop` filter repeats the decoded frames; `scale` makes the
 * edges even; transparent pixels become white, which is ffmpeg's GIF decoder default as well.
 */
export function gifCommand(
  inputName: string,
  o: GifToVideoOptions,
  frames: number,
  output: string,
): string {
  const loop = o.repeat > 1 ? `loop=loop=${o.repeat - 1}:size=${frames}:start=0,` : "";
  const vf = `"${loop}scale=trunc(iw/2)*2:trunc(ih/2)*2"`;
  const codec =
    o.to === "webm"
      ? "-c:v libvpx-vp9 -b:v 0 -crf 32"
      : "-c:v libx264 -crf 20 -pix_fmt yuv420p -movflags +faststart";
  return `ffmpeg -i ${shellQuote(inputName)} -vf ${vf} ${codec} -an ${shellQuote(output)}`;
}
