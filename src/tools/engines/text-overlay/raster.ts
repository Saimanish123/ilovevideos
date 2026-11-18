/**
 * Page thread only (it needs the DOM canvas and the UI font): draws the text block as a PNG at its
 * exact size in output pixels. The panel draws it for the preview a moment after each change; the
 * page runner draws it once more before a run if the options moved on. The worker and ffmpeg only
 * composite these pixels, so preview, WebCodecs path and ffmpeg path show the same text.
 */
import type { Size } from "../watermark/options";
import { alignOf, fontPx, type TextOverlayOptions } from "./options";

type O = TextOverlayOptions;

function uiFont(): string {
  if (typeof document === "undefined") return "sans-serif";
  return (
    getComputedStyle(document.documentElement).getPropertyValue("--font-sans").trim() ||
    "sans-serif"
  );
}

/** Lines as typed, each wrapped to `max` pixels by words. */
function layoutLines(c: CanvasRenderingContext2D, text: string, max: number): string[] {
  const out: string[] = [];
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const words = raw.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      out.push("");
      continue;
    }
    let line = "";
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (!line || c.measureText(next).width <= max) line = next;
      else {
        out.push(line);
        line = w;
      }
    }
    out.push(line);
  }
  // Blank lines at the ends are not part of the block.
  while (out.length && !out[0]) out.shift();
  while (out.length && !out[out.length - 1]) out.pop();
  return out;
}

/** What the raster is drawn from and at which size; the panel redraws when it no longer matches. */
export const textKey = (o: O, video: Size) =>
  `${o.text.trim()}|${o.size}|${o.style}|${o.color}|${alignOf(o)}|${video.width}x${video.height}`;

export interface TextRaster {
  blob: Blob;
  width: number;
  height: number;
}

export async function rasterizeText(o: O, video: Size): Promise<TextRaster | undefined> {
  if (!o.text.trim() || video.width <= 0) return undefined;
  const px = fontPx(o, video);
  const font = `600 ${px}px ${uiFont()}`;
  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) return undefined;
  probe.font = font;
  const lines = layoutLines(probe, o.text, video.width * 0.9);
  if (lines.length === 0) return undefined;
  const lineH = Math.round(px * 1.25);
  const stroke = Math.max(2, Math.round(px * 0.1));
  const padX =
    o.style === "box"
      ? Math.round(px * 0.5)
      : o.style === "outline"
        ? stroke * 2
        : Math.round(px * 0.3);
  const padY =
    o.style === "box"
      ? Math.round(px * 0.3)
      : o.style === "outline"
        ? stroke * 2
        : Math.round(px * 0.3);
  const widths = lines.map((l) => probe.measureText(l).width);
  const width = Math.min(video.width, Math.ceil(Math.max(...widths) + 2 * padX));
  const height = Math.min(video.height, Math.ceil(lines.length * lineH + 2 * padY));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const c = canvas.getContext("2d");
  if (!c) return undefined;
  const white = o.color === "white";
  if (o.style === "box") {
    c.fillStyle = white ? "rgb(0 0 0 / 0.62)" : "rgb(255 255 255 / 0.85)";
    const r = Math.round(px * 0.2);
    c.beginPath();
    c.roundRect(0, 0, width, height, r);
    c.fill();
  }
  c.font = font;
  c.textBaseline = "middle";
  const align = alignOf(o);
  c.textAlign = align;
  const x = align === "left" ? padX : align === "right" ? width - padX : width / 2;
  lines.forEach((line, i) => {
    const y = padY + i * lineH + lineH / 2;
    if (o.style === "outline") {
      c.lineJoin = "round";
      c.lineWidth = stroke * 2;
      c.strokeStyle = white ? "rgb(0 0 0)" : "rgb(255 255 255)";
      c.strokeText(line, x, y);
    }
    if (o.style === "shadow") {
      c.shadowColor = white ? "rgb(0 0 0 / 0.55)" : "rgb(255 255 255 / 0.55)";
      c.shadowBlur = Math.max(2, px * 0.12);
      c.shadowOffsetY = Math.max(1, Math.round(px * 0.03));
    }
    c.fillStyle = white ? "rgb(255 255 255)" : "rgb(0 0 0)";
    c.fillText(line, x, y);
    c.shadowColor = "transparent";
  });
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  return blob ? { blob, width, height } : undefined;
}
