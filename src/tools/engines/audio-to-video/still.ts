/**
 * Page thread only (it needs the UI font and the page's image decoders): draws the still of an audio
 * to video run, for the hero's live preview and, at full size, as the PNG the engine encodes. The
 * page runner draws it once more before a run when the options have moved on since the last draw.
 */
import { blurredBackdrop, drawCard, drawFitted } from "./draw";
import { type AudioToVideoOptions, cardText, shapeOf, sizeOf, stillKey } from "./options";

export interface FileFacts {
  name: string;
  title?: string;
  artist?: string;
}

/** The UI typeface as the canvas needs it (the next/font family names behind --font-sans). */
export function uiFont(): string {
  if (typeof document === "undefined") return "sans-serif";
  return (
    getComputedStyle(document.documentElement).getPropertyValue("--font-sans").trim() ||
    "sans-serif"
  );
}

const bitmaps = new WeakMap<Blob, Promise<ImageBitmap>>();
/** Decodes a picked image once per blob. */
export function bitmapOf(blob: Blob): Promise<ImageBitmap> {
  let p = bitmaps.get(blob);
  if (!p) {
    p = createImageBitmap(blob);
    p.catch(() => bitmaps.delete(blob));
    bitmaps.set(blob, p);
  }
  return p;
}

/**
 * Paints the still into `c` at `scale` of the output size (1 for the real still, less for a preview).
 */
export async function paintStill(
  c: CanvasRenderingContext2D,
  o: AudioToVideoOptions,
  file: FileFacts,
  scale = 1,
): Promise<void> {
  const size = sizeOf(o);
  const w = Math.max(1, Math.round(size.width * scale));
  const h = Math.max(1, Math.round(size.height * scale));
  if (o.picture === "image" && o.image) {
    const bitmap = await bitmapOf(o.image.blob);
    const src = { width: bitmap.width, height: bitmap.height };
    const frame = { x: 0, y: 0, width: w, height: h };
    if (shapeOf(o) === "image") {
      c.imageSmoothingQuality = "high";
      c.drawImage(bitmap, 0, 0, w, h);
    } else
      drawFitted(
        c,
        bitmap,
        src,
        frame,
        o.fit,
        o.fit === "blur" ? blurredBackdrop(bitmap, src, { width: w, height: h }) : undefined,
      );
    return;
  }
  drawCard(c, { width: w, height: h }, cardText(o, file), o.theme, uiFont());
}

/** The still as a PNG at the output size, with the key it was drawn for. */
export async function renderStill(
  o: AudioToVideoOptions,
  file: FileFacts,
): Promise<{ blob: Blob; key: string } | undefined> {
  const size = sizeOf(o);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const c = canvas.getContext("2d", { alpha: false });
  if (!c) return undefined;
  await paintStill(c, o, file, 1);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  return blob ? { blob, key: stillKey(o, file) } : undefined;
}
