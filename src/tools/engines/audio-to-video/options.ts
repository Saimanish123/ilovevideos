/**
 * Audio to video options and the geometry both sides share. Pure; used by the panel, the hero, the
 * page runner (which draws the still) and the worker engine.
 *
 * The still reaches the engine as a PNG already drawn at the output size (`still`), like the
 * watermark's mark: the page has the UI font and every image decoder, the worker only encodes.
 */
import { z } from "zod";
import { shellQuote } from "@/lib/format";

export const shapes = ["16:9", "1:1", "9:16", "image"] as const;
export type Shape = (typeof shapes)[number];

/** The picture does not move, so one frame a second is enough; key frames every 10 seconds. */
export const STILL_FPS = 1;
export const STILL_KEY_INTERVAL = 10;
/** Enough for a sharp still at 1080p when nearly every frame repeats the one before. */
export const STILL_BITRATE = 1_500_000;
/** AAC bitrate when the sound has to be encoded. */
export const SOUND_KBPS = 192;
/** Longest side of the image's own shape. */
export const MAX_EDGE = 1920;

export const PickedImage = z.object({
  name: z.string(),
  blob: z.instanceof(Blob),
  width: z.number().positive(),
  height: z.number().positive(),
});
export type PickedImage = z.infer<typeof PickedImage>;

export const AudioToVideoOptions = z.object({
  picture: z.enum(["card", "image"]).default("card"),
  image: PickedImage.optional(),
  /** Card title; each file's own title tag (or name) when absent. */
  title: z.string().max(200).optional(),
  /** Card second line; the artist tag when absent. */
  line: z.string().max(200).optional(),
  theme: z.enum(["dark", "light"]).default("dark"),
  shape: z.enum(shapes).default("16:9"),
  /** An image in a frame of another shape: on a blurred copy of itself, on black, or cropped to fill. */
  fit: z.enum(["blur", "black", "fill"]).default("blur"),
  /** The still as a PNG at the output size, drawn by the page. Required to run. */
  still: z.instanceof(Blob).optional(),
  stillKey: z.string().optional(),
});
export type AudioToVideoOptions = z.infer<typeof AudioToVideoOptions>;

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** Output size in pixels for a shape (the image's own shape: long side at most MAX_EDGE, even). */
export function frameSize(
  shape: Shape,
  image?: { width: number; height: number },
): { width: number; height: number } {
  if (shape === "1:1") return { width: 1080, height: 1080 };
  if (shape === "9:16") return { width: 1080, height: 1920 };
  if (shape === "image" && image) {
    const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
    return { width: even(image.width * scale), height: even(image.height * scale) };
  }
  return { width: 1920, height: 1080 };
}

export const shapeOf = (o: Pick<AudioToVideoOptions, "shape" | "picture" | "image">): Shape =>
  o.shape === "image" && !(o.picture === "image" && o.image) ? "16:9" : o.shape;

export const sizeOf = (o: Pick<AudioToVideoOptions, "shape" | "picture" | "image">) =>
  frameSize(shapeOf(o), o.picture === "image" ? o.image : undefined);

/** The card's text for one file: what was typed, else the file's own title and artist. */
export function cardText(
  o: Pick<AudioToVideoOptions, "title" | "line">,
  file: { name: string; title?: string; artist?: string },
): { title: string; line: string } {
  const base = file.name.replace(/\.[^.]+$/, "");
  return {
    title: o.title?.trim() || file.title?.trim() || base,
    line: o.line !== undefined ? o.line.trim() : (file.artist?.trim() ?? ""),
  };
}

/** What the still was drawn from and at which size; a run redraws when it no longer matches. */
export function stillKey(
  o: AudioToVideoOptions,
  file: { name: string; title?: string; artist?: string },
): string {
  const { width, height } = sizeOf(o);
  const what =
    o.picture === "image" && o.image
      ? `i:${o.image.name}:${o.image.blob.size}:${o.fit}`
      : `c:${o.theme}:${JSON.stringify(cardText(o, file))}`;
  return `${what}|${width}x${height}`;
}

/** ffmpeg's filter for the same picture: a card is already drawn; an image is fitted to the frame. */
export function pictureFilter(o: AudioToVideoOptions): string {
  const { width: w, height: h } = sizeOf(o);
  if (o.picture !== "image" || !o.image || shapeOf(o) === "image")
    return `[0:v]scale=${w}:${h},format=yuv420p[v]`;
  if (o.fit === "fill")
    return `[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},format=yuv420p[v]`;
  const fg = `scale=${w}:${h}:force_original_aspect_ratio=decrease`;
  if (o.fit === "black") return `[0:v]${fg},pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,format=yuv420p[v]`;
  return `[0:v]split[a][b];[a]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},boxblur=40[bg];[b]${fg}[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,format=yuv420p[v]`;
}

export function audioToVideoCommand(
  audioName: string,
  outName: string,
  o: AudioToVideoOptions,
  copy: boolean,
): string {
  const picture = o.picture === "image" && o.image ? o.image.name : "card.png";
  return `ffmpeg -loop 1 -framerate ${STILL_FPS} -i ${shellQuote(picture)} -i ${shellQuote(audioName)} -filter_complex "${pictureFilter(o)}" -map "[v]" -map 1:a -c:v libx264 -tune stillimage -g ${STILL_FPS * STILL_KEY_INTERVAL} -c:a ${copy ? "copy" : "aac -b:a 192k"} -shortest -movflags +faststart ${shellQuote(outName)}`;
}
