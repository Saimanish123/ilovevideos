/**
 * Draws a title card: the colour across the whole frame and the text centred on it, bold, wrapped
 * to 80% of the width and sized down until it fits inside 60% of the height. The worker draws it
 * once per run at the output size; the page draws the same card for its preview. Works on an
 * OffscreenCanvas or a DOM canvas context.
 */
import { titleInk } from "./options";

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function wrap(ctx: Ctx, text: string, max: number): string[] {
  const out: string[] = [];
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const words = raw.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
    let line = "";
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (!line || ctx.measureText(next).width <= max) line = next;
      else {
        out.push(line);
        line = w;
      }
    }
    out.push(line);
  }
  return out;
}

export function drawTitle(
  ctx: Ctx,
  size: { width: number; height: number },
  card: { text: string; background: string },
  family: string,
) {
  const { width, height } = size;
  ctx.save();
  ctx.fillStyle = card.background;
  ctx.fillRect(0, 0, width, height);
  const text = card.text.trim();
  if (text) {
    const short = Math.min(width, height);
    const maxW = width * 0.8;
    let px = Math.max(12, Math.round(short * 0.11));
    let lines: string[] = [];
    // Smaller until the block fits 60% of the height and no single word is wider than the line.
    for (;;) {
      ctx.font = `700 ${px}px ${family}`;
      lines = wrap(ctx, text, maxW);
      const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
      if ((lines.length * px * 1.2 <= height * 0.6 && widest <= maxW) || px <= 12) break;
      px = Math.max(12, Math.floor(px * 0.9));
    }
    ctx.fillStyle = titleInk(card.background);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.direction = "inherit";
    const lineH = px * 1.2;
    const top = height / 2 - ((lines.length - 1) * lineH) / 2;
    lines.forEach((l, i) => {
      ctx.fillText(l, width / 2, top + i * lineH);
    });
  }
  ctx.restore();
}
