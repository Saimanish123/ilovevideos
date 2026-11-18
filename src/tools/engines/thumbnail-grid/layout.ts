/**
 * Contact sheet geometry and drawing, shared by the worker (the real sheet, from decoded frames) and
 * the page (the live preview, from the preview's own frames), so the two agree to the pixel. Pure
 * apart from drawing on the 2D context it is given; no DOM, no decoder.
 */
import { z } from "zod";
import { formatDuration } from "@/lib/format";

export const imageFormats = ["jpg", "png", "webp"] as const;
export type SheetFormat = (typeof imageFormats)[number];

export const gridPresets = [
  { columns: 3, rows: 3 },
  { columns: 4, rows: 4 },
  { columns: 4, rows: 6 },
  { columns: 6, rows: 8 },
] as const;
export const widthPresets = [1280, 1920, 3840] as const;

/** Largest sheet in pixels: what every current browser, iOS Safari included, can draw on one canvas. */
export const MAX_SHEET_PIXELS = 16_777_216;

export const ThumbnailGridOptions = z.object({
  columns: z.number().int().min(1).max(12).default(4),
  rows: z.number().int().min(1).max(20).default(4),
  /** Width of the whole sheet in pixels; the tiles take the video's shape. */
  width: z.number().int().min(320).max(7680).default(1920),
  timestamps: z.boolean().default(true),
  /** File name and facts across the top. */
  header: z.boolean().default(true),
  background: z.enum(["light", "dark"]).default("light"),
  format: z.enum(imageFormats).default("jpg"),
  /** 0–100, JPG and WebP only. */
  quality: z.number().min(1).max(100).default(90),
});
export type ThumbnailGridOptions = z.infer<typeof ThumbnailGridOptions>;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SheetLayout {
  width: number;
  height: number;
  margin: number;
  gap: number;
  /** Header text box (empty when there is no header). */
  header: Rect;
  titlePx: number;
  factsPx: number;
  labelPx: number;
  tiles: Rect[];
}

/** Times of the frames: the middle of each of N equal slices, so no tile shows a first black frame. */
export function tileTimes(count: number, durationSec: number): number[] {
  if (!(durationSec > 0)) return Array.from({ length: count }, () => 0);
  return Array.from({ length: count }, (_, i) => ((i + 0.5) / count) * durationSec);
}

/** "0:07", "0:00.6", "1:02.25": a clock time with `digits` decimals of a second. */
export function clockLabel(seconds: number, digits: 0 | 1 | 2): string {
  if (digits === 0) return formatDuration(seconds);
  const scale = 10 ** digits;
  const units = Math.round(Math.max(0, seconds) * scale);
  const whole = Math.floor(units / scale);
  return `${formatDuration(whole)}.${String(units % scale).padStart(digits, "0")}`;
}

/**
 * Tile labels at the precision the spacing needs: whole seconds when that tells every tile apart,
 * else tenths (tiles under a second apart: a 2 s clip in 9 tiles is 0:00.1, 0:00.3, ...), else
 * hundredths. Shared by the sheet and its preview, so both print the same labels.
 */
export function tileLabels(times: number[]): string[] {
  for (const digits of [0, 1] as const) {
    const labels = times.map((t) => clockLabel(t, digits));
    if (new Set(labels).size === labels.length) return labels;
  }
  return times.map((t) => clockLabel(t, 2));
}

export function sheetLayout(
  o: Pick<ThumbnailGridOptions, "columns" | "rows" | "width" | "header">,
  video: { width: number; height: number },
): SheetLayout {
  const W = o.width;
  const margin = Math.max(8, Math.round(W * 0.0125));
  const gap = Math.max(4, Math.round(W * 0.005));
  const tileW = Math.max(16, Math.floor((W - 2 * margin - (o.columns - 1) * gap) / o.columns));
  const aspect = video.width > 0 && video.height > 0 ? video.height / video.width : 9 / 16;
  const tileH = Math.max(9, Math.round(tileW * aspect));
  const titlePx = Math.max(12, Math.round(W * 0.0145));
  const factsPx = Math.max(10, Math.round(titlePx * 0.78));
  const headerH = o.header ? Math.round(titlePx * 1.3 + factsPx * 1.6 + margin * 0.6) : 0;
  // The grid is centred when the tiles do not fill the width exactly.
  const gridW = o.columns * tileW + (o.columns - 1) * gap;
  const left = Math.round((W - gridW) / 2);
  const top = margin + headerH;
  const tiles: Rect[] = [];
  for (let r = 0; r < o.rows; r++)
    for (let c = 0; c < o.columns; c++)
      tiles.push({
        x: left + c * (tileW + gap),
        y: top + r * (tileH + gap),
        width: tileW,
        height: tileH,
      });
  const height = top + o.rows * tileH + (o.rows - 1) * gap + margin;
  return {
    width: W,
    height,
    margin,
    gap,
    header: { x: left, y: margin, width: gridW, height: headerH },
    titlePx,
    factsPx,
    labelPx: Math.min(40, Math.max(10, Math.round(tileW * 0.055))),
    tiles,
  };
}

export const tooLarge = (l: SheetLayout) => l.width * l.height > MAX_SHEET_PIXELS;

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export const SHEET_FONT =
  'Geist, system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif';

const palette = {
  light: {
    bg: "rgb(255 255 255)",
    fg: "rgb(20 20 20)",
    muted: "rgb(96 96 96)",
    empty: "rgb(232 232 232)",
  },
  dark: {
    bg: "rgb(16 16 16)",
    fg: "rgb(240 240 240)",
    muted: "rgb(160 160 160)",
    empty: "rgb(40 40 40)",
  },
};

/** Cuts text to fit a width, with an ellipsis. */
function fit(c: Ctx, text: string, max: number): string {
  if (c.measureText(text).width <= max) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (c.measureText(`${text.slice(0, mid)}…`).width <= max) lo = mid;
    else hi = mid - 1;
  }
  return `${text.slice(0, lo)}…`;
}

/**
 * Draws the whole sheet. `frames[i]` is drawn into tile i (undefined draws an empty tile, for a
 * preview still waiting for its frame); `times[i]` is its label.
 */
export function drawSheet(
  c: Ctx,
  l: SheetLayout,
  o: Pick<ThumbnailGridOptions, "timestamps" | "header" | "background">,
  frames: (CanvasImageSource | undefined)[],
  times: number[],
  header: { title: string; facts: string },
  font = SHEET_FONT,
): void {
  const p = palette[o.background];
  c.fillStyle = p.bg;
  c.fillRect(0, 0, l.width, l.height);
  if (o.header && l.header.height > 0) {
    c.textBaseline = "alphabetic";
    c.textAlign = "left";
    c.fillStyle = p.fg;
    c.font = `600 ${l.titlePx}px ${font}`;
    c.fillText(fit(c, header.title, l.header.width), l.header.x, l.header.y + l.titlePx);
    c.fillStyle = p.muted;
    c.font = `400 ${l.factsPx}px ${font}`;
    c.fillText(
      fit(c, header.facts, l.header.width),
      l.header.x,
      l.header.y + l.titlePx * 1.3 + l.factsPx * 1.25,
    );
  }
  const labels = tileLabels(times.slice(0, l.tiles.length));
  l.tiles.forEach((t, i) => {
    const f = frames[i];
    if (f) c.drawImage(f, t.x, t.y, t.width, t.height);
    else {
      c.fillStyle = p.empty;
      c.fillRect(t.x, t.y, t.width, t.height);
    }
    if (!o.timestamps) return;
    const label = labels[i] ?? clockLabel(times[i] ?? 0, 0);
    c.font = `500 ${l.labelPx}px ${font}`;
    const w = c.measureText(label).width;
    const padX = Math.round(l.labelPx * 0.4);
    const padY = Math.round(l.labelPx * 0.25);
    const bw = Math.ceil(w + 2 * padX);
    const bh = Math.ceil(l.labelPx * 1.2 + 2 * padY);
    const bx = t.x + t.width - bw - padY;
    const by = t.y + t.height - bh - padY;
    c.fillStyle = "rgb(0 0 0 / 0.6)";
    c.fillRect(bx, by, bw, bh);
    c.fillStyle = "rgb(255 255 255)";
    c.textBaseline = "middle";
    c.textAlign = "left";
    c.fillText(label, bx + padX, by + bh / 2);
  });
}

/** "sample-contact-sheet.jpg" */
export const sheetName = (base: string, format: SheetFormat) => `${base}-contact-sheet.${format}`;

export const formatLabel: Record<SheetFormat, string> = { jpg: "JPG", png: "PNG", webp: "WebP" };
export const formatMime: Record<SheetFormat, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/** Seconds between frames, for the summary ("one every 11.3 s"). */
export const interval = (count: number, durationSec: number) =>
  count > 0 ? durationSec / count : 0;

/** Header text: the file name, then duration, size, codec, frame rate and file size. */
export function sheetHeader(
  fileName: string,
  info: {
    durationSec: number;
    sizeBytes: number;
    video?: { width: number; height: number; fps: number; codec: string };
  },
  codecName: (c: string | undefined) => string | undefined,
  formatBytes: (n: number) => string,
): { title: string; facts: string } {
  const v = info.video;
  const fps = v && v.fps > 0 ? `${Number(v.fps.toFixed(2))} fps` : undefined;
  const facts = [
    formatDuration(info.durationSec),
    v && `${v.width}×${v.height}`,
    codecName(v?.codec),
    fps,
    formatBytes(info.sizeBytes),
  ]
    .filter(Boolean)
    .join("  ·  ");
  return { title: fileName, facts };
}
