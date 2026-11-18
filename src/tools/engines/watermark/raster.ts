/**
 * Page thread only (it needs the DOM for SVG decoding and the UI font): the panel calls it for the
 * preview and the watermark page runner calls it once more before a run, so the engine always
 * gets the mark for the current options.
 *
 * Draws the watermark as a PNG at its exact size in output pixels, on the page, where the logo's
 * decoder (including SVG) and the UI font are available. The worker and ffmpeg then only composite
 * pixels, so the preview, the WebCodecs path and the ffmpeg path show the same mark.
 */
import { markSize, type Size, type WatermarkOptions } from "./options";

type O = WatermarkOptions;

/** The UI typeface as the canvas needs it (the next/font family names behind --font-sans). */
function uiFont(): string {
  if (typeof document === "undefined") return "sans-serif";
  const v = getComputedStyle(document.documentElement).getPropertyValue("--font-sans").trim();
  return v || "sans-serif";
}

const TEXT_PAD = 0.12; // em, left and right
const TEXT_LINE = 1.3; // em, bitmap height

let probe: CanvasRenderingContext2D | null = null;
const measure = (text: string, px: number) => {
  probe ??= document.createElement("canvas").getContext("2d");
  if (!probe) return px * text.length * 0.6;
  probe.font = `600 ${px}px ${uiFont()}`;
  return probe.measureText(text).width;
};

/** Width ÷ height of a text mark, so its size can be set from the picture's width. */
export function textAspect(text: string): number {
  const t = text.trim();
  if (!t) return 4;
  const w = measure(t, 100);
  return (w + 2 * TEXT_PAD * 100) / (TEXT_LINE * 100);
}

/** Reads a picked logo: its natural size, for the aspect ratio. SVG without a size falls back to 300×150, as browsers do. */
export async function readImage(file: File): Promise<{ width: number; height: number }> {
  const img = await loadImage(file);
  return { width: img.naturalWidth || 300, height: img.naturalHeight || 150 };
}

async function loadImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    // Decoded pixels stay usable after the URL is revoked.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export interface Raster {
  blob: Blob;
  width: number;
  height: number;
}

/** The key a raster is valid for: what is drawn and at which pixel size. */
export function rasterKey(o: O, video: Size): string {
  const s = markSize(o, video);
  const what =
    o.kind === "text"
      ? `t:${o.textColor}:${o.text.trim()}`
      : `i:${o.image?.name}:${o.image?.blob.size}`;
  return `${what}|${s.width}x${s.height}`;
}

export async function rasterize(o: O, video: Size): Promise<Raster | undefined> {
  const { width, height } = markSize(o, video);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const c = canvas.getContext("2d");
  if (!c) return undefined;
  if (o.kind === "image") {
    if (!o.image) return undefined;
    const img = await loadImage(o.image.blob);
    c.imageSmoothingQuality = "high";
    c.drawImage(img, 0, 0, width, height);
  } else {
    const text = o.text.trim();
    if (!text) return undefined;
    const px = height / TEXT_LINE;
    c.font = `600 ${px}px ${uiFont()}`;
    c.textBaseline = "middle";
    c.textAlign = "center";
    // A soft shadow of the opposite tone keeps the text readable on busy footage.
    const white = o.textColor === "white";
    c.shadowColor = white ? "rgb(0 0 0 / 0.45)" : "rgb(255 255 255 / 0.45)";
    c.shadowBlur = Math.max(1, px * 0.08);
    c.fillStyle = white ? "rgb(255 255 255)" : "rgb(0 0 0)";
    c.fillText(text, width / 2, height / 2, width - 2 * TEXT_PAD * px);
  }
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  return blob ? { blob, width, height } : undefined;
}
