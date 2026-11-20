/**
 * Add images to a video (feature G7): pictures and stickers as layers, each placed, sized and
 * turned on the picture, shown for its own time, see-through as chosen, stacked in list order (the
 * last is on top). Pure; the panel, the layer editor on the preview, the worker and the ffmpeg
 * command all place a layer with these functions (ADR-0064).
 *
 * Placement is relative to the picture so it fits the preview and the full-size frame alike: the
 * centre as shares of the width and height, the width as a share of the picture's width, the height
 * from the image's own shape. Animated GIF, WebP and PNG layers loop from the moment they appear.
 */
import { z } from "zod";
import { shellQuote } from "@/lib/format";
import { ffmpegSoundEncoder, type VideoSoundCodec } from "../sound-codec";

export const MAX_LAYERS = 8;
/** The image types the page takes. SVG is drawn to a PNG on the page before it is used. */
export const IMAGE_ACCEPT =
  "image/png,image/jpeg,image/webp,image/gif,image/avif,image/svg+xml,.png,.apng,.jpg,.jpeg,.webp,.gif,.avif,.svg";

export const ImageLayer = z.object({
  id: z.number().int().min(1),
  /** The file name, for the list and the command. */
  name: z.string(),
  /** The image (an SVG arrives already drawn as PNG). */
  blob: z.instanceof(Blob),
  /** MIME type of `blob`, for the decoder. */
  type: z.string(),
  /** Natural size. */
  width: z.number().positive(),
  height: z.number().positive(),
  /** More than one frame (GIF, animated WebP, APNG). */
  animated: z.boolean().default(false),
  x: z.number().min(-1).max(2).default(0.5),
  y: z.number().min(-1).max(2).default(0.5),
  /** Width as a share of the picture's width. */
  w: z.number().min(0.01).max(3).default(0.3),
  /** Degrees, clockwise. */
  rotation: z.number().min(-180).max(180).default(0),
  opacity: z.number().min(0.05).max(1).default(1),
  start: z.number().min(0).default(0),
  /** Absent: to the end of the video. */
  end: z.number().min(0).optional(),
});
export type ImageLayer = z.infer<typeof ImageLayer>;

export const ImageOverlayOptions = z.object({
  /** Bottom first: the last layer is drawn on top. */
  layers: z.array(ImageLayer).max(MAX_LAYERS).default([]),
  /** Page only: the layer the panel and the timeline edit. The engine ignores it. */
  selected: z.number().int().optional(),
});
export type ImageOverlayOptions = z.infer<typeof ImageOverlayOptions>;

export interface Size {
  width: number;
  height: number;
}

/** A layer's box in picture pixels, unrotated (its centre is the turning point). */
export function layerRect(l: Pick<ImageLayer, "x" | "y" | "w" | "width" | "height">, src: Size) {
  const width = Math.max(2, l.w * src.width);
  const height = Math.max(2, (width * l.height) / l.width);
  return { x: l.x * src.width - width / 2, y: l.y * src.height - height / 2, width, height };
}

/** The centre and width of a box, as shares (the inverse of `layerRect`). */
export function placeFromRect(
  rect: { x: number; y: number; width: number; height: number },
  src: Size,
) {
  return {
    x: (rect.x + rect.width / 2) / src.width,
    y: (rect.y + rect.height / 2) / src.height,
    w: rect.width / src.width,
  };
}

export const showsAt = (l: Pick<ImageLayer, "start" | "end">, t: number) =>
  t >= l.start && (l.end === undefined || t < l.end);

export const layerRange = (l: Pick<ImageLayer, "start" | "end">, durationSec: number) => ({
  start: Math.min(l.start, durationSec),
  end: Math.min(l.end ?? durationSec, durationSec),
});

export const wholeVideo = (l: Pick<ImageLayer, "start" | "end">, durationSec: number) =>
  l.start <= 0 && (l.end === undefined || l.end >= durationSec);

/** Where a new layer goes: centred at 30% of the width, the next ones stepped down and right. */
export function newPlacement(count: number) {
  const step = (count % 4) * 0.05;
  return { x: 0.5 + step, y: 0.5 + step, w: 0.3, rotation: 0, opacity: 1, start: 0 };
}

export const nextLayerId = (o: Pick<ImageOverlayOptions, "layers">) =>
  o.layers.reduce((m, l) => Math.max(m, l.id), 0) + 1;

/** Moves the layer one step up (towards the top) or down the stack. */
export function restack(
  o: Pick<ImageOverlayOptions, "layers">,
  id: number,
  dir: 1 | -1,
): ImageLayer[] {
  const i = o.layers.findIndex((l) => l.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= o.layers.length) return o.layers;
  const next = [...o.layers];
  [next[i], next[j]] = [next[j] as ImageLayer, next[i] as ImageLayer];
  return next;
}

// Animation timing --------------------------------------------------------------------------------

/**
 * Frame delays as browsers play them: a GIF delay of 10 ms or less is shown as 100 ms (what Chrome,
 * Firefox and Safari all do with 0 and 1 hundredths), anything else as written.
 */
export const playedDelay = (seconds: number) => (seconds <= 0.01 ? 0.1 : seconds);

/** Index of the frame showing `localSec` after the layer appears, looping. `ends` are cumulative. */
export function frameAt(ends: number[], localSec: number): number {
  const total = ends[ends.length - 1] ?? 0;
  if (ends.length <= 1 || total <= 0) return 0;
  const t = ((localSec % total) + total) % total;
  let lo = 0;
  let hi = ends.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((ends[mid] as number) > t) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/** Cumulative end times of frames with these delays. */
export function frameEnds(delays: number[]): number[] {
  let t = 0;
  return delays.map((d) => {
    t += playedDelay(d);
    return t;
  });
}

/**
 * Whether the bytes hold more than one frame, read from the container without decoding: a GIF with
 * two image descriptors, a PNG with an animation control chunk (APNG), a WebP with an ANIM chunk.
 * For the page's notice where the browser cannot decode animation (no `ImageDecoder`).
 */
export function looksAnimated(bytes: Uint8Array): boolean {
  const ascii = (i: number, s: string) => [...s].every((c, k) => bytes[i + k] === c.charCodeAt(0));
  if (ascii(0, "GIF8")) {
    // Count graphic control extensions (0x21 0xF9): one per frame in practice.
    let n = 0;
    for (let i = 13; i < bytes.length - 1; i++)
      if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9 && ++n > 1) return true;
    return false;
  }
  if (bytes[0] === 0x89 && ascii(1, "PNG")) {
    for (let i = 8; i + 8 <= bytes.length; ) {
      const len =
        ((bytes[i] ?? 0) << 24) |
        ((bytes[i + 1] ?? 0) << 16) |
        ((bytes[i + 2] ?? 0) << 8) |
        (bytes[i + 3] ?? 0);
      if (ascii(i + 4, "acTL")) return true;
      if (ascii(i + 4, "IDAT")) return false;
      i += 12 + (len >>> 0);
    }
    return false;
  }
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) {
    for (let i = 12; i + 8 <= bytes.length; ) {
      if (ascii(i, "ANIM")) return true;
      const len =
        (bytes[i + 4] ?? 0) |
        ((bytes[i + 5] ?? 0) << 8) |
        ((bytes[i + 6] ?? 0) << 16) |
        ((bytes[i + 7] ?? 0) << 24);
      i += 8 + (len >>> 0) + ((len >>> 0) % 2);
    }
  }
  return false;
}

// ffmpeg command ----------------------------------------------------------------------------------

const n3 = (v: number) => Number(v.toFixed(3)).toString();

/** The filter graph for the same layers over input 0; layer k is input k + 1. */
export function overlayGraph(o: ImageOverlayOptions, src: Size, durationSec: number): string {
  if (o.layers.length === 0) return "[0:v]null[v]";
  const parts: string[] = [];
  o.layers.forEach((l, i) => {
    const r = layerRect(l, src);
    const w = Math.max(2, Math.round(r.width));
    const h = Math.max(2, Math.round(r.height));
    const turn = l.rotation
      ? `,rotate=${n3((l.rotation * Math.PI) / 180)}:c=none:ow=rotw(${n3((l.rotation * Math.PI) / 180)}):oh=roth(${n3((l.rotation * Math.PI) / 180)})`
      : "";
    const alpha = l.opacity < 1 ? `,colorchannelmixer=aa=${n3(l.opacity)}` : "";
    parts.push(`[${i + 1}:v]scale=${w}:${h},format=rgba${turn}${alpha}[l${i}]`);
    const cx = Math.round(r.x + r.width / 2);
    const cy = Math.round(r.y + r.height / 2);
    const enable = wholeVideo(l, durationSec)
      ? ""
      : `:enable='between(t,${n3(l.start)},${n3(Math.min(l.end ?? durationSec, durationSec))})'`;
    const from = i === 0 ? "[0:v]" : `[v${i - 1}]`;
    const to = i === o.layers.length - 1 ? "[v]" : `[v${i}]`;
    parts.push(
      `${from}[l${i}]overlay=x=${cx}-w/2:y=${cy}-h/2:shortest=0:eof_action=pass${enable}${to}`,
    );
  });
  return parts.join(";");
}

export function overlayCommand(
  input: string,
  o: ImageOverlayOptions,
  graph: string,
  output: string,
  kbps: number,
  audio: "copy" | "none" | VideoSoundCodec,
): string {
  const inputs = o.layers
    .map((l) =>
      l.animated
        ? `-ignore_loop 0 -i ${shellQuote(l.name)}`
        : `-loop 1 -i ${shellQuote(l.name.replace(/\.svg$/i, ".png"))}`,
    )
    .join(" ");
  const a =
    audio === "none"
      ? "-an"
      : audio === "copy"
        ? "-map '0:a?' -c:a copy"
        : `-map '0:a?' -c:a ${ffmpegSoundEncoder(audio)}`;
  return `ffmpeg -i ${shellQuote(input)} ${inputs} -filter_complex "${graph}" -map "[v]" ${a} -c:v libx264 -b:v ${kbps}k -pix_fmt yuv420p -shortest ${shellQuote(output)}`;
}
