/**
 * Progress bar and timer on the picture (feature G8): options and every number the preview, the
 * worker and the ffmpeg command share. Pure.
 *
 * Time. Both are drawn from the frame's page time `t` (from 0 at the file's start, ADR-0055) inside
 * a range (the whole video by default). The span runs from the range's start to the start of its
 * last frame (`end − one frame`), so the first frame shows an empty bar and 0:00 and the last frame
 * a full bar, and a countdown reaches 0:00 on the last frame instead of one frame after it.
 *
 * Timer digits are laid out in fixed cells (a digit cell is wider than Geist Bold's widest digit,
 * 0.693 em) and each glyph is centred in its cell: tabular by construction, so the numbers never
 * shuffle sideways, and the block's size is known without measuring a font. The block is sized for
 * the widest value the range will show, so it does not grow when 9:59 becomes 10:00.
 */
import { z } from "zod";
import { shellQuote } from "@/lib/format";
import { withEvenCropOut } from "../crop/math";
import { ffmpegSoundEncoder, type VideoSoundCodec } from "../sound-codec";
import { anchors, markRect, type Rect, type Size } from "../watermark/options";

export const timerFormats = ["m:ss", "h:mm:ss", "s.t"] as const;
export type TimerFormat = (typeof timerFormats)[number];

/** Bar thickness presets, as a share of the picture's shorter side (5, 11 and 22 px at 1080p). */
export const barThickness = { thin: 0.005, medium: 0.01, thick: 0.02 } as const;
/** Timer digit size presets, as a share of the picture's shorter side (54, 81, 119 px at 1080p). */
export const timerSizes = { small: 0.05, medium: 0.075, large: 0.11 } as const;

const hex = z
  .string()
  .regex(/^#[0-9a-f]{6}$/i)
  .transform((s) => s.toLowerCase());

export const TimeOverlayOptions = z.object({
  kind: z.enum(["progress", "timer"]).default("progress"),
  /** When it shows (seconds of page time); the whole video when absent. */
  range: z.object({ start: z.number().min(0), end: z.number().min(0) }).optional(),
  /** Bar or digit colour. */
  color: hex.default("#ffffff"),

  // Progress bar.
  edge: z.enum(["bottom", "top"]).default("bottom"),
  /** Bar height as a share of the picture's shorter side. */
  thickness: z.number().min(0.001).max(0.1).default(barThickness.medium),
  /** A translucent track under the whole bar, so its end is visible. */
  track: z.boolean().default(true),
  /** Gap between the bar and the picture's edge, as a share of the shorter side. */
  inset: z.number().min(0).max(0.2).default(0),

  // Timer.
  direction: z.enum(["up", "down"]).default("up"),
  /**
   * The value shown on the range's first frame, in seconds. Absent: 0:00 counting up, the range's
   * length counting down (so it reaches 0:00 on the last frame).
   */
  from: z.number().min(0).max(359_999).optional(),
  format: z.enum(timerFormats).default("m:ss"),
  /** Digit height as a share of the picture's shorter side. */
  size: z.number().min(0.02).max(0.3).default(timerSizes.medium),
  style: z.enum(["shadow", "outline", "box"]).default("shadow"),
  anchor: z.enum([...anchors, "custom"]).default("tr"),
  fx: z.number().min(0).max(1).default(1),
  fy: z.number().min(0).max(1).default(0),
  /** Distance from the edge for the nine positions, as a share of the shorter side. */
  margin: z.number().min(0).max(0.25).default(0.04),
});
export type TimeOverlayOptions = z.infer<typeof TimeOverlayOptions>;
type O = TimeOverlayOptions;

export interface Span {
  start: number;
  end: number;
}

/** The range that applies, inside the video; the whole video when absent. */
export function timeRange(o: Pick<O, "range">, durationSec: number): Span {
  const r = o.range;
  if (!r) return { start: 0, end: durationSec };
  const start = Math.max(0, Math.min(r.start, durationSec));
  return { start, end: Math.max(start, Math.min(r.end, durationSec)) };
}

export const isWhole = (r: Span, durationSec: number) => r.start <= 0 && r.end >= durationSec;

/** One frame's length; 1/30 s when the rate is unknown. */
export const frameSec = (fps: number | undefined) =>
  fps && Number.isFinite(fps) && fps > 0 ? 1 / fps : 1 / 30;

/** From the range's start to the start of its last frame. */
export const spanSec = (r: Span, frame: number) => Math.max(0, r.end - r.start - frame);

/** True when the overlay is drawn on the frame at `t`. */
export const showsAt = (r: Span, t: number) => t >= r.start - 1e-6 && t < r.end - 1e-6;

/** The bar's fill, 0 to 1, for the frame at `t`. */
export function barProgress(r: Span, frame: number, t: number): number {
  const span = spanSec(r, frame);
  if (span <= 1e-6) return 1;
  return Math.min(1, Math.max(0, (t - r.start) / span));
}

const shorter = (v: Size) => Math.min(v.width, v.height);

/** H.264 needs even edges: the output frame the bar is placed on (../crop/math `encodedSize`). */
export const evenFrame = (v: Size): Size => ({
  width: Math.max(2, v.width - (v.width % 2)),
  height: Math.max(2, v.height - (v.height % 2)),
});

/** The whole bar (track) in picture pixels, on the even output frame, so it ends on the edge. */
export function barRect(o: Pick<O, "edge" | "thickness" | "inset">, video: Size): Rect {
  const f = evenFrame(video);
  const s = shorter(f);
  const height = Math.max(1, Math.min(f.height, Math.round(s * o.thickness)));
  const inset = Math.round(s * o.inset);
  const y = o.edge === "top" ? inset : f.height - inset - height;
  return { x: 0, y: Math.max(0, Math.min(f.height - height, y)), width: f.width, height };
}

/** The first value shown, in seconds. */
export function timerFrom(o: Pick<O, "direction" | "from">, r: Span, frame: number): number {
  if (o.from !== undefined) return o.from;
  return o.direction === "down" ? spanSec(r, frame) : 0;
}

/** The raw timer value, in seconds, for the frame at `t` (never below 0). */
export function timerValue(o: Pick<O, "direction" | "from">, r: Span, frame: number, t: number) {
  const from = timerFrom(o, r, frame);
  const elapsed = Math.max(0, t - r.start);
  return Math.max(0, o.direction === "down" ? from - elapsed : from + elapsed);
}

/**
 * The shown value in whole steps of the format (seconds, or tenths for s.t): counting up rounds
 * down (0:09 until ten seconds have passed), counting down rounds up (0:10 for the first second),
 * as stopwatches and kitchen timers do. A millionth of a second absorbs float error in frame times.
 */
export function shownSteps(value: number, format: TimerFormat, direction: O["direction"]) {
  const per = format === "s.t" ? 10 : 1;
  const x = value * per;
  return Math.max(0, direction === "down" ? Math.ceil(x - 1e-6) : Math.floor(x + 1e-6));
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** The text for a value in steps: "1:05", "0:01:05", "65.0". */
export function formatSteps(steps: number, format: TimerFormat): string {
  if (format === "s.t") return `${Math.floor(steps / 10)}.${steps % 10}`;
  const h = Math.floor(steps / 3600);
  const m = Math.floor((steps % 3600) / 60);
  const s = steps % 60;
  if (format === "h:mm:ss") return `${h}:${pad2(m)}:${pad2(s)}`;
  return `${h * 60 + m}:${pad2(s)}`;
}

/** What the timer shows on the frame at `t`. */
export function timerText(o: O, r: Span, frame: number, t: number): string {
  return formatSteps(shownSteps(timerValue(o, r, frame, t), o.format, o.direction), o.format);
}

/** The largest value the range shows (the block is sized for it). */
export function timerMax(o: Pick<O, "direction" | "from">, r: Span, frame: number): number {
  const from = timerFrom(o, r, frame);
  return o.direction === "down" ? from : from + spanSec(r, frame);
}

/** Cell widths in em: a digit cell holds Geist Bold's widest digit (0 at 0.693 em) with room. */
export const DIGIT_EM = 0.72;
const SEP_EM: Record<string, number> = { ":": 0.36, ".": 0.3 };
export const cellEm = (ch: string) => SEP_EM[ch] ?? DIGIT_EM;

/** The widest text the range can show, with every digit as 0 (cells make all digits alike). */
export function timerTemplate(o: O, r: Span, frame: number): string {
  const max = shownSteps(timerMax(o, r, frame), o.format, "down");
  return formatSteps(max, o.format).replace(/\d/g, "0");
}

export const timerPx = (o: Pick<O, "size">, video: Size) =>
  Math.max(10, Math.round(shorter(video) * o.size));

/** Padding inside the block: room for the outline, the shadow or the box around the digits. */
export const timerPad = (px: number) => ({ x: Math.round(px * 0.3), y: Math.round(px * 0.18) });

/** The timer block's size for a text template. */
export function timerBlock(template: string, px: number): Size {
  const pad = timerPad(px);
  const cells = Array.from(template).reduce((w, ch) => w + cellEm(ch), 0);
  return {
    width: Math.ceil(cells * px + 2 * pad.x),
    height: Math.ceil(px * 1.0 + 2 * pad.y),
  };
}

/** Where the timer block goes, in picture pixels (the watermark's nine positions or a drag). */
export function timerRect(o: O, r: Span, frame: number, video: Size): Rect {
  const block = timerBlock(timerTemplate(o, r, frame), timerPx(o, video));
  const w = Math.max(2, Math.min(block.width, video.width));
  return markRect(
    {
      anchor: o.anchor,
      fx: o.fx,
      fy: o.fy,
      margin: o.margin,
      size: w / video.width,
      aspect: w / Math.max(1, Math.min(block.height, video.height)),
    },
    video,
  );
}

/** Digits line up with the side of the picture the timer is anchored to. */
export const timerAlign = (o: Pick<O, "anchor">): "left" | "center" | "right" =>
  o.anchor === "custom"
    ? "center"
    : o.anchor[1] === "l"
      ? "left"
      : o.anchor[1] === "r"
        ? "right"
        : "center";

/** Relative luminance (0–1) of a #rrggbb colour, for picking a contrasting track or outline. */
export function luminance(color: string): number {
  const n = Number.parseInt(color.slice(1), 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

/** Light colours get a dark track, outline and shadow; dark colours a light one. */
export const isLight = (color: string) => luminance(color) > 0.3;

export const trackColor = (color: string) =>
  isLight(color) ? "rgb(0 0 0 / 0.4)" : "rgb(255 255 255 / 0.4)";

/** Parses "1:05", "0:01:05", "65" or "65.5" into seconds; undefined when it is not a time. */
export function parseClock(text: string): number | undefined {
  const s = text.trim();
  if (!/^\d+(:\d{1,2}){0,2}(\.\d+)?$/.test(s)) return undefined;
  const parts = s.split(":");
  let total = 0;
  for (const [i, p] of parts.entries()) {
    const n = Number(p);
    if (!Number.isFinite(n) || (i > 0 && n >= 60)) return undefined;
    total = total * 60 + n;
  }
  return total;
}

const f3 = (n: number) => Number(n.toFixed(3)).toString();
const ffColor = (c: string) => `0x${c.slice(1).toUpperCase()}`;

/**
 * The nearest FFmpeg command, shown to the user (feature L7): a colour strip slid in by `overlay`
 * for the bar, `drawtext` with an `eif` expression for the timer.
 */
export function timeCommand(
  o: O,
  input: { name: string; durationSec: number; fps: number; video: Size },
  outName: string,
  kbps: number,
  sound: "copy" | "none" | VideoSoundCodec,
): string {
  const r = timeRange(o, input.durationSec);
  const frame = frameSec(input.fps);
  const span = Math.max(frame, spanSec(r, frame));
  const enable = isWhole(r, input.durationSec)
    ? ""
    : `:enable='between(t,${f3(r.start)},${f3(r.end)})'`;
  let graph: string;
  if (o.kind === "progress") {
    const b = barRect(o, input.video);
    const track = o.track
      ? `drawbox=x=0:y=${b.y}:w=iw:h=${b.height}:color=${isLight(o.color) ? "black" : "white"}@0.4:t=fill${enable},`
      : "";
    graph = `[0:v]${track}null[base];color=c=${ffColor(o.color)}:s=${b.width}x${b.height}:r=${Math.round(input.fps || 30)}[bar];[base][bar]overlay=x='-w+w*clip((t-${f3(r.start)})/${f3(span)},0,1)':y=${b.y}:shortest=1${enable}[v]`;
  } else {
    const rect = timerRect(o, r, frame, input.video);
    const px = timerPx(o, input.video);
    const from = f3(timerFrom(o, r, frame));
    const v =
      o.direction === "down"
        ? `max(0,${from}-(t-${f3(r.start)}))`
        : `${from}+max(0,t-${f3(r.start)})`;
    const round = o.direction === "down" ? "ceil" : "floor";
    const text =
      o.format === "s.t"
        ? `%{eif\\:${round}(${v}*10)/10\\:d}.%{eif\\:mod(${round}(${v}*10),10)\\:d}`
        : o.format === "h:mm:ss"
          ? `%{eif\\:${round}(${v})/3600\\:d}\\:%{eif\\:mod(${round}(${v})/60,60)\\:d\\:2}\\:%{eif\\:mod(${round}(${v}),60)\\:d\\:2}`
          : `%{eif\\:${round}(${v})/60\\:d}\\:%{eif\\:mod(${round}(${v}),60)\\:d\\:2}`;
    const look =
      o.style === "box"
        ? `:box=1:boxcolor=${isLight(o.color) ? "black" : "white"}@0.6:boxborderw=${timerPad(px).x}`
        : o.style === "outline"
          ? `:borderw=${Math.max(2, Math.round(px * 0.08))}:bordercolor=${isLight(o.color) ? "black" : "white"}`
          : `:shadowx=0:shadowy=${Math.max(1, Math.round(px * 0.03))}:shadowcolor=black@0.55`;
    graph = `[0:v]drawtext=fontfile=Geist-Bold.ttf:text='${text}':fontsize=${px}:fontcolor=${ffColor(o.color)}${look}:x=${rect.x}+(${rect.width}-tw)/2:y=${rect.y}+(${rect.height}-th)/2${enable}[v]`;
  }
  const full = withEvenCropOut(input.video, graph);
  const audio =
    sound === "none"
      ? " -an"
      : ` -map '0:a?' -c:a ${sound === "copy" ? "copy" : ffmpegSoundEncoder(sound)}`;
  return `ffmpeg -i ${shellQuote(input.name)} -filter_complex "${full}" -map "[v]" -c:v libx264 -b:v ${kbps}k -pix_fmt yuv420p${audio} ${shellQuote(outName)}`;
}
