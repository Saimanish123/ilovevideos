/**
 * Drawing a picture into a video frame: fit inside on black or on a blurred copy of itself, or crop
 * to fill; and the plain title card. Works on a page canvas and on an OffscreenCanvas in a worker,
 * so audio to video (drawn on the page) and images to video (drawn in the worker) look the same.
 * No DOM beyond the canvas it is handed; no network.
 */

export type Fit = "blur" | "black" | "fill";
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;

export interface Size {
  width: number;
  height: number;
}
export interface Rect extends Size {
  x: number;
  y: number;
}

export function makeCanvas(width: number, height: number): AnyCanvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return c;
}

/** The largest rect of the source's shape inside the frame, centred. */
export function containRect(src: Size, frame: Size): Rect {
  const scale = Math.min(frame.width / src.width, frame.height / src.height);
  const width = src.width * scale;
  const height = src.height * scale;
  return { x: (frame.width - width) / 2, y: (frame.height - height) / 2, width, height };
}

/** The smallest rect of the source's shape covering the frame, centred (parts fall outside). */
export function coverRect(src: Size, frame: Size): Rect {
  const scale = Math.max(frame.width / src.width, frame.height / src.height);
  const width = src.width * scale;
  const height = src.height * scale;
  return { x: (frame.width - width) / 2, y: (frame.height - height) / 2, width, height };
}

/**
 * A blurred, darkened copy of the picture covering the frame. Drawn small and scaled up, which
 * blurs on every browser; where the canvas has a blur filter it is used as well for a smoother look.
 */
export function blurredBackdrop(img: CanvasImageSource, src: Size, frame: Size): AnyCanvas {
  const small = makeCanvas(
    Math.max(2, Math.round(frame.width / 16)),
    Math.max(2, Math.round(frame.height / 16)),
  );
  const s = small.getContext("2d") as Ctx | null;
  const out = makeCanvas(frame.width, frame.height);
  const o = out.getContext("2d") as Ctx | null;
  if (!s || !o) return out;
  const r = coverRect(src, { width: small.width, height: small.height });
  s.imageSmoothingQuality = "high";
  s.drawImage(img, r.x, r.y, r.width, r.height);
  o.imageSmoothingQuality = "high";
  if ("filter" in o) o.filter = `blur(${Math.round(frame.width / 120)}px)`;
  // Drawn slightly larger than the frame so the blur has no light edge.
  const pad = Math.round(frame.width / 40);
  o.drawImage(small, -pad, -pad, frame.width + 2 * pad, frame.height + 2 * pad);
  if ("filter" in o) o.filter = "none";
  o.fillStyle = "rgb(0 0 0 / 0.35)";
  o.fillRect(0, 0, frame.width, frame.height);
  return out;
}

/** Draws the picture into the whole frame with the given fit. `backdrop` is reused for "blur". */
export function drawFitted(
  c: Ctx,
  img: CanvasImageSource,
  src: Size,
  frame: Rect,
  fit: Fit,
  backdrop?: CanvasImageSource,
): void {
  c.imageSmoothingQuality = "high";
  if (fit === "fill") {
    const r = coverRect(src, frame);
    c.save();
    c.beginPath();
    c.rect(frame.x, frame.y, frame.width, frame.height);
    c.clip();
    c.drawImage(img, frame.x + r.x, frame.y + r.y, r.width, r.height);
    c.restore();
    return;
  }
  if (fit === "blur" && backdrop)
    c.drawImage(backdrop, frame.x, frame.y, frame.width, frame.height);
  else {
    c.fillStyle = "rgb(0 0 0)";
    c.fillRect(frame.x, frame.y, frame.width, frame.height);
  }
  const r = containRect(src, frame);
  c.drawImage(img, frame.x + r.x, frame.y + r.y, r.width, r.height);
}

export const CARD_FONT =
  'Geist, system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif';

const cardColours = {
  dark: { bg: "rgb(18 18 18)", fg: "rgb(244 244 244)", muted: "rgb(168 168 168)" },
  light: { bg: "rgb(246 244 239)", fg: "rgb(22 22 22)", muted: "rgb(104 104 104)" },
};

/** Greedy word wrap to `max` width, at most `lines` lines, the last cut with an ellipsis. */
export function wrap(c: Ctx, text: string, max: number, lines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (c.measureText(next).width <= max || !line) line = next;
    else {
      out.push(line);
      line = w;
    }
  }
  if (line) out.push(line);
  if (out.length <= lines) return out.map((l) => cut(c, l, max));
  const kept = out.slice(0, lines);
  kept[lines - 1] = cut(c, `${kept[lines - 1]}…`, max);
  return kept;
}

function cut(c: Ctx, s: string, max: number): string {
  if (c.measureText(s).width <= max) return s;
  let t = s.replace(/…$/, "");
  while (t.length > 1 && c.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}

/** A plain card: the title large in the middle, a second line under it. */
export function drawCard(
  c: Ctx,
  frame: Size,
  text: { title: string; line: string },
  theme: "dark" | "light",
  font = CARD_FONT,
): void {
  const col = cardColours[theme];
  c.fillStyle = col.bg;
  c.fillRect(0, 0, frame.width, frame.height);
  const base = Math.min(frame.width, frame.height);
  const titlePx = Math.round(base * 0.075);
  const linePx = Math.round(titlePx * 0.5);
  const max = frame.width * 0.8;
  c.textAlign = "center";
  c.textBaseline = "alphabetic";
  c.font = `600 ${titlePx}px ${font}`;
  const titleLines = wrap(c, text.title, max, 3);
  c.font = `400 ${linePx}px ${font}`;
  const lineLines = text.line ? wrap(c, text.line, max, 2) : [];
  const titleH = titleLines.length * titlePx * 1.2;
  const gap = lineLines.length ? titlePx * 0.6 : 0;
  const lineH = lineLines.length * linePx * 1.35;
  let y = (frame.height - (titleH + gap + lineH)) / 2;
  c.fillStyle = col.fg;
  c.font = `600 ${titlePx}px ${font}`;
  for (const l of titleLines) {
    y += titlePx * 1.2;
    c.fillText(l, frame.width / 2, y - titlePx * 0.25);
  }
  y += gap;
  c.fillStyle = col.muted;
  c.font = `400 ${linePx}px ${font}`;
  for (const l of lineLines) {
    y += linePx * 1.35;
    c.fillText(l, frame.width / 2, y - linePx * 0.3);
  }
}
