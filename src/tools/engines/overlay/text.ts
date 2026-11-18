/**
 * Draws subtitle cues onto video frames with a 2D canvas (the burn-in path on WebCodecs). The plain
 * look is the one players use by default: white text with a black outline, centred, near the bottom
 * (or the top for cues placed there), wrapped to 90% of the width; a `CueStyle` changes size, weight,
 * colour, outline, a box behind each line, wrap width and position (../subtitles-add/style). Italic,
 * bold and underline from the cue text are honoured; a line whose first strong letter is Hebrew or
 * Arabic is laid out right to left. Fonts: Geist when it could be loaded into the worker, then the
 * system sans, so any script the device can show is drawn. Each cue is laid out once and cached as
 * a bitmap. The same code draws the page's live preview.
 */
import type { Cue } from "../subtitles/model";

export type TextSize = "small" | "medium" | "large";

/** Font size as a share of √(width × height): about 5% of the height of a 16:9 frame at "medium". */
const sizeFactor: Record<TextSize, number> = { small: 0.032, medium: 0.04, large: 0.05 };

export const FONT_STACK =
  'Geist, system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif';

export function fontPx(width: number, height: number, size: TextSize): number {
  return Math.max(12, Math.round(Math.sqrt(width * height) * sizeFactor[size]));
}

interface Run {
  text: string;
  i: boolean;
  b: boolean;
  u: boolean;
}

/** Normal-form cue text → lines of styled runs. */
export function toRuns(text: string): Run[][] {
  const lines: Run[][] = [[]];
  const st = { i: false, b: false, u: false };
  for (const part of text.split(/(<\/?[ibu]>|\n)/)) {
    if (!part) continue;
    const tag = /^<(\/?)([ibu])>$/.exec(part);
    if (tag) {
      st[tag[2] as "i" | "b" | "u"] = tag[1] !== "/";
      continue;
    }
    if (part === "\n") {
      lines.push([]);
      continue;
    }
    lines[lines.length - 1]?.push({ text: part, ...st });
  }
  return lines.filter((l) => l.some((r) => r.text.trim() !== ""));
}

type Ctx2D = OffscreenCanvasRenderingContext2D;

const fontOf = (r: Pick<Run, "i" | "b">, px: number) =>
  `${r.i ? "italic " : ""}${r.b ? 700 : 400} ${px}px ${FONT_STACK}`;

/**
 * Greedy word wrap across runs. Words longer than the line (or scripts written without spaces) are
 * broken between characters.
 */
export function wrapRuns(
  ctx: Ctx2D,
  lines: Run[][],
  px: number,
  maxWidth: number,
  font: (r: Pick<Run, "i" | "b">) => string = (r) => fontOf(r, px),
): Run[][] {
  const out: Run[][] = [];
  const measure = (r: Run, s: string) => {
    ctx.font = font(r);
    return ctx.measureText(s).width;
  };
  for (const line of lines) {
    let current: Run[] = [];
    let width = 0;
    const push = (r: Run, s: string) => {
      const last = current[current.length - 1];
      if (last && last.i === r.i && last.b === r.b && last.u === r.u) last.text += s;
      else current.push({ ...r, text: s });
      width += measure(r, s);
    };
    const breakLine = () => {
      const last = current[current.length - 1];
      if (last) last.text = last.text.replace(/\s+$/, "");
      if (current.length) out.push(current);
      current = [];
      width = 0;
    };
    for (const run of line) {
      for (const token of run.text.split(/(\s+)/)) {
        if (!token) continue;
        const w = measure(run, token);
        if (/^\s+$/.test(token)) {
          if (width > 0) push(run, " ");
          continue;
        }
        if (width + w <= maxWidth || width === 0) {
          if (w <= maxWidth) {
            push(run, token);
            continue;
          }
          // One word wider than the line: break between characters.
          for (const ch of Array.from(token)) {
            if (width + measure(run, ch) > maxWidth && width > 0) breakLine();
            push(run, ch);
          }
          continue;
        }
        breakLine();
        if (w <= maxWidth) push(run, token);
        else
          for (const ch of Array.from(token)) {
            if (width + measure(run, ch) > maxWidth && width > 0) breakLine();
            push(run, ch);
          }
      }
    }
    breakLine();
  }
  return out;
}

interface Block {
  canvas: OffscreenCanvas;
  width: number;
  height: number;
}

/**
 * How cues look and where they sit, in output pixels. Without one, `CueRenderer` draws the plain
 * look players use (`plainCueStyle`); the styled burn-in (../subtitles-add/style) resolves one from
 * the page's choices, and the page's preview resolves the same one.
 */
export interface CueStyle {
  /** Font size in pixels. */
  px: number;
  /** Weight of plain text; <b> runs are always 700. The worker has Geist at 400 and 700. */
  weight: 400 | 700;
  /** Text colour (CSS). */
  color: string;
  /** Outline width in pixels (drawn as a stroke twice as wide, under the fill); 0 for none. */
  outline: number;
  outlineColor: string;
  /** A box behind each line: its colour with alpha (CSS), or undefined for none. */
  box?: string;
  /** Lines wrap at this width, in pixels. */
  maxWidth: number;
  /** Bottom edge of the lowest cue (cues stack upwards from it), in pixels from the top. */
  bottom: number;
  /** Top edge of cues marked for the top of the picture, in pixels from the top. */
  top: number;
  /** Space between stacked cues, in pixels. */
  gap: number;
  /** Font family list. */
  family: string;
}

/** The plain look: white text, black outline, wrapped to 90% of the width, 6% from the edge. */
export function plainCueStyle(width: number, height: number, size: TextSize): CueStyle {
  const px = fontPx(width, height, size);
  const outline = Math.max(2, Math.round(px * 0.09));
  const margin = Math.round(height * 0.06);
  return {
    px,
    weight: 400,
    color: "rgb(255 255 255)",
    outline,
    outlineColor: "rgb(0 0 0)",
    maxWidth: width * 0.9 - outline * 2,
    bottom: height - margin,
    top: margin,
    gap: Math.round(px * 0.2),
    family: FONT_STACK,
  };
}

/** First strong character right-to-left (Hebrew, Arabic, Syriac, Thaana, N'Ko and their forms). */
const RTL = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
const LTR =
  /[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF\u0900-\u0DFF\u0E00-\u0FFF\u1100-\u11FF\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/;
export function isRtlLine(text: string): boolean {
  for (const ch of text) {
    if (RTL.test(ch)) return true;
    if (LTR.test(ch)) return false;
  }
  return false;
}

/** Lays out and draws one cue into its own transparent bitmap. */
function renderCue(cue: Cue, style: CueStyle): Block | null {
  const { px, outline } = style;
  const lineHeight = Math.round(px * 1.25);
  const probe = new OffscreenCanvas(1, 1).getContext("2d");
  if (!probe) return null;
  const font = (r: Pick<Run, "i" | "b">) =>
    `${r.i ? "italic " : ""}${r.b ? 700 : style.weight} ${px}px ${style.family}`;
  const lines = wrapRuns(probe, toRuns(cue.text), px, style.maxWidth, font);
  if (lines.length === 0) return null;
  const widths = lines.map((l) =>
    l.reduce((w, r) => {
      probe.font = font(r);
      return w + probe.measureText(r.text).width;
    }, 0),
  );
  // Room for a box's side padding when there is a box; the outline's otherwise (as before).
  const padX = style.box ? Math.round(px * 0.35) : 0;
  const width = Math.ceil(Math.max(...widths) + outline * 4 + padX * 2);
  const height = Math.ceil(lines.length * lineHeight + outline * 4);
  const canvas = new OffscreenCanvas(width, height);
  const c = canvas.getContext("2d");
  if (!c) return null;
  c.textBaseline = "alphabetic";
  c.lineJoin = "round";
  c.miterLimit = 2;
  if (style.box) {
    c.fillStyle = style.box;
    lines.forEach((_, li) => {
      const w = (widths[li] ?? 0) + padX * 2;
      const x = (width - w) / 2;
      const y = outline * 2 + li * lineHeight + px * 0.95 - lineHeight * 0.8;
      c.beginPath();
      c.roundRect(x, y, w, lineHeight, Math.round(px * 0.12));
      c.fill();
    });
  }
  lines.forEach((line, li) => {
    const lineWidth = widths[li] ?? 0;
    const rtl = isRtlLine(line.map((r) => r.text).join(""));
    const y = outline * 2 + li * lineHeight + px;
    // Runs go left to right, or right to left on a right-to-left line; each run is drawn with that
    // base direction so the browser's bidi keeps numbers and Latin words inside it in order.
    let x = rtl ? (width + lineWidth) / 2 : (width - lineWidth) / 2;
    c.direction = rtl ? "rtl" : "ltr";
    c.textAlign = "left";
    for (const r of line) {
      c.font = font(r);
      const w = c.measureText(r.text).width;
      const left = rtl ? x - w : x;
      if (outline > 0) {
        c.strokeStyle = style.outlineColor;
        c.lineWidth = outline * 2;
        c.strokeText(r.text, left, y);
      }
      c.fillStyle = style.color;
      c.fillText(r.text, left, y);
      if (r.u) {
        const t = Math.max(1, Math.round(px * 0.06));
        if (outline > 0) {
          c.fillStyle = style.outlineColor;
          c.fillRect(left - outline / 2, y + t - outline / 2, w + outline, t + outline);
        }
        c.fillStyle = style.color;
        c.fillRect(left, y + t, w, t);
      }
      x = rtl ? x - w : x + w;
    }
  });
  return { canvas, width, height };
}

type AnyCtx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

/**
 * Finds the cues showing at a time and draws them, stacked from the edge inwards in start order (as
 * browsers stack overlapping cues). Cues are sorted once; lookup is a binary search.
 */
export class CueRenderer {
  private cues: Cue[];
  private cache = new Map<Cue, Block | null>();
  private readonly style: CueStyle;

  constructor(
    cues: Cue[],
    private readonly width: number,
    height: number,
    size: TextSize,
    /** The styled look; the plain one when absent. */
    style?: CueStyle,
  ) {
    this.cues = [...cues].filter((c) => c.end > c.start).sort((a, b) => a.start - b.start);
    this.style = style ?? plainCueStyle(width, height, size);
  }

  /** Cues on screen at `ms`. Long cues are found by scanning back from the last one to start. */
  active(ms: number): Cue[] {
    let lo = 0;
    let hi = this.cues.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((this.cues[mid]?.start ?? 0) <= ms) lo = mid + 1;
      else hi = mid;
    }
    const out: Cue[] = [];
    for (let i = lo - 1; i >= 0 && i >= lo - 64; i--) {
      const c = this.cues[i];
      if (c && c.end > ms) out.unshift(c);
    }
    return out;
  }

  /** Draws the cues showing at `timeSec` (a worker frame or the page's preview canvas). */
  draw(ctx: AnyCtx, timeSec: number) {
    const on = this.active(Math.round(timeSec * 1000));
    for (const [cue] of this.cache) if (!on.includes(cue)) this.cache.delete(cue);
    let bottom = this.style.bottom;
    let top = this.style.top;
    for (const cue of on) {
      let block = this.cache.get(cue);
      if (block === undefined) {
        block = renderCue(cue, this.style);
        this.cache.set(cue, block);
      }
      if (!block) continue;
      const x = Math.round((this.width - block.width) / 2);
      if (cue.top) {
        ctx.drawImage(block.canvas, x, top);
        top += block.height + this.style.gap;
      } else {
        bottom -= block.height;
        ctx.drawImage(block.canvas, x, bottom);
        bottom -= this.style.gap;
      }
    }
  }
}

/** Loads the Geist files into the worker's font set so the canvas can use them. Silent if unsupported. */
export async function loadWorkerFonts(
  files: { bytes: Uint8Array; weight: string; style: string }[],
): Promise<boolean> {
  const scope = globalThis as unknown as { fonts?: { add(f: FontFace): void } };
  if (typeof FontFace === "undefined" || !scope.fonts) return false;
  try {
    for (const f of files) {
      const face = new FontFace("Geist", f.bytes.slice().buffer as ArrayBuffer, {
        weight: f.weight,
        style: f.style,
      });
      await face.load();
      scope.fonts.add(face);
    }
    return true;
  } catch {
    return false;
  }
}
