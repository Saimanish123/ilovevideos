/**
 * Draws the progress bar and the timer on a 2D canvas: the worker draws them over every frame at
 * the picture's size, and the page's preview draws them with the same calls, scaled to the screen,
 * so both show the same pixels (ADR-0035). Works with an OffscreenCanvas or a DOM canvas context.
 */
import type { Rect } from "../watermark/options";
import { cellEm, isLight, timerPad, trackColor } from "./options";

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** The bar: the track across the whole width (when on), then the fill from the left. */
export function drawBar(ctx: Ctx, rect: Rect, progress: number, color: string, track: boolean) {
  ctx.save();
  if (track) {
    ctx.fillStyle = trackColor(color);
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  }
  // A fractional width: the edge is anti-aliased, so the bar moves smoothly at any length.
  const w = rect.width * Math.min(1, Math.max(0, progress));
  if (w > 0) {
    ctx.fillStyle = color;
    ctx.fillRect(rect.x, rect.y, w, rect.height);
  }
  ctx.restore();
}

/** Geist Bold's cap height, in em: where the digits' tops sit above the baseline. */
const CAP_EM = 0.71;

/**
 * The timer text inside its block, one glyph centred per fixed cell. `family` is the font family
 * the context can use: "Geist" in the worker (loaded from /wasm/fonts), the page's own sans on the
 * page.
 */
export function drawTimer(
  ctx: Ctx,
  text: string,
  rect: Rect,
  px: number,
  o: { color: string; style: "shadow" | "outline" | "box"; align: "left" | "center" | "right" },
  family: string,
) {
  const pad = timerPad(px);
  const chars = Array.from(text);
  const width = chars.reduce((w, ch) => w + cellEm(ch) * px, 0);
  const light = isLight(o.color);
  ctx.save();
  if (o.style === "box") {
    ctx.fillStyle = light ? "rgb(0 0 0 / 0.6)" : "rgb(255 255 255 / 0.8)";
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.width, rect.height, Math.round(px * 0.18));
    ctx.fill();
  }
  ctx.font = `700 ${px}px ${family}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const inner = rect.width - 2 * pad.x;
  let x =
    rect.x +
    pad.x +
    (o.align === "left" ? 0 : o.align === "right" ? inner - width : (inner - width) / 2);
  const baseline = rect.y + rect.height / 2 + (CAP_EM * px) / 2;
  const cells = chars.map((ch) => {
    const w = cellEm(ch) * px;
    const cx = x + w / 2;
    x += w;
    return { ch, cx };
  });
  if (o.style === "outline") {
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(2, Math.round(px * 0.08)) * 2;
    ctx.strokeStyle = light ? "rgb(0 0 0)" : "rgb(255 255 255)";
    for (const c of cells) ctx.strokeText(c.ch, c.cx, baseline);
  }
  if (o.style === "shadow") {
    ctx.shadowColor = light ? "rgb(0 0 0 / 0.55)" : "rgb(255 255 255 / 0.55)";
    ctx.shadowBlur = Math.max(2, px * 0.12);
    ctx.shadowOffsetY = Math.max(1, Math.round(px * 0.03));
  }
  ctx.fillStyle = o.color;
  for (const c of cells) ctx.fillText(c.ch, c.cx, baseline);
  ctx.restore();
}
