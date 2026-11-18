/**
 * Two videos in one frame (C10): picture in picture, side by side and stacked. Options, the output
 * frame, where each picture goes, the timing of the second clip and the ffmpeg command, shared by the
 * live preview, the panel and the engine so they agree to the pixel (the ADR-0035 pattern). Pure;
 * safe to import on the page.
 *
 * The first clip is the main one ("A"), the second the inset or the right or lower picture ("B");
 * `swap` exchanges them. The second clip starts `offset` seconds after the first (negative: its first
 * seconds are skipped), so two recordings of one event can be lined up.
 */
import { z } from "zod";
import { shellQuote } from "@/lib/format";
import { reencodeBitrate } from "../crop/plan";
import type { MediaInfo } from "../types";

export const layoutIds = ["pip", "side", "stack"] as const;
export type LayoutId = (typeof layoutIds)[number];
export const frameIds = ["auto", "16:9", "9:16", "1:1"] as const;
export type FrameId = (typeof frameIds)[number];

/** Longest edge of the output frame. Two 4K pictures are written at 1080p class, not 8K. */
export const MAX_LONG_EDGE = 3840;
/** Shortest edge of a fixed frame (16:9 is 1920×1080 at most). */
export const MAX_SHORT_EDGE = 1080;
export const MIN_INSET = 0.15;
export const MAX_INSET = 0.6;
export const MAX_OFFSET = 3600;

export const LayoutOptions = z.object({
  layout: z.enum(layoutIds).default("pip"),
  frame: z.enum(frameIds).default("auto"),
  /** How a picture fills a cell of another shape: cut to fill, or shown whole with bars. */
  fit: z.enum(["cover", "contain"]).default("cover"),
  /** Picture in picture: the inset's centre (0–1 of the frame) and width (share of the frame's width). */
  inset: z
    .object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      width: z.number().min(MIN_INSET).max(MAX_INSET),
      /** Set: the inset sits in this corner (`insetAtCorner`), whatever `x` and `y` say. */
      corner: z.enum(["tl", "tr", "bl", "br"]).optional(),
    })
    .default({ x: 0.82, y: 0.79, width: 0.33, corner: "br" }),
  /** Corner radius, as a share of the inset's shorter edge (0–0.5). */
  radius: z.number().min(0).max(0.5).default(0.08),
  /** Border round the inset, or the gap between two pictures, as a share of the frame's shorter edge. */
  border: z.number().min(0).max(0.04).default(0),
  borderColor: z.enum(["white", "black"]).default("white"),
  offset: z.number().min(-MAX_OFFSET).max(MAX_OFFSET).default(0),
  sound: z.enum(["main", "second", "both"]).default("main"),
  /** A clip that is not playing (not started yet, or over): its nearest frame held, or nothing shown. */
  ended: z.enum(["hold", "hide"]).default("hold"),
  swap: z.boolean().default(false),
});
export type LayoutOptions = z.infer<typeof LayoutOptions>;

export interface Size {
  width: number;
  height: number;
}
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
const ratioOf = (f: Exclude<FrameId, "auto">) => {
  const [w, h] = f.split(":").map(Number) as [number, number];
  return w / h;
};

/** A size scaled down (never up) so its long edge is at most `long`, even edges. */
function capped(s: Size, long = MAX_LONG_EDGE): Size {
  const k = Math.min(1, long / Math.max(s.width, s.height));
  return { width: even(s.width * k), height: even(s.height * k) };
}

/** The output frame for two pictures of sizes `a` and `b` (as shown, rotation applied). */
export function frameSize(o: Pick<LayoutOptions, "layout" | "frame">, a: Size, b: Size): Size {
  if (o.frame !== "auto") {
    const r = ratioOf(o.frame);
    const shortest = Math.min(
      MAX_SHORT_EDGE,
      Math.max(Math.min(a.width, a.height), Math.min(b.width, b.height)),
    );
    const short = even(Math.max(240, shortest));
    return r >= 1
      ? { width: even(short * r), height: short }
      : { width: short, height: even(short / r) };
  }
  if (o.layout === "pip") return capped(a, 1920);
  if (o.layout === "side") {
    // One height for both, the smaller of the two (never enlarged), widths by their shapes.
    const h = Math.min(a.height, b.height, MAX_SHORT_EDGE);
    return capped({ width: h * (a.width / a.height) + h * (b.width / b.height), height: h });
  }
  const w = Math.min(a.width, b.width, MAX_SHORT_EDGE);
  return capped({ width: w, height: w * (a.height / a.width) + w * (b.height / b.width) });
}

/** Where a picture of size `src` lands in `cell`: the part of it drawn and the box it is drawn into. */
export function placeIn(src: Size, cell: Box, fit: LayoutOptions["fit"]): { from: Box; to: Box } {
  const rs = src.width / src.height;
  const rc = cell.width / cell.height;
  if (fit === "cover") {
    // Cut the picture to the cell's shape, centred.
    const from =
      rs > rc
        ? { x: (src.width - src.height * rc) / 2, y: 0, width: src.height * rc, height: src.height }
        : { x: 0, y: (src.height - src.width / rc) / 2, width: src.width, height: src.width / rc };
    return { from, to: cell };
  }
  const to =
    rs > rc
      ? {
          x: cell.x,
          y: cell.y + (cell.height - cell.width / rs) / 2,
          width: cell.width,
          height: cell.width / rs,
        }
      : {
          x: cell.x + (cell.width - cell.height * rs) / 2,
          y: cell.y,
          width: cell.height * rs,
          height: cell.height,
        };
  return { from: { x: 0, y: 0, ...src }, to };
}

export interface Placement {
  frame: Size;
  /** The main picture's cell (the whole frame for picture in picture). */
  main: Box;
  /** The second picture's cell (the inset for picture in picture). */
  second: Box;
  /** Border or gap width in pixels. */
  border: number;
  /** Inset corner radius in pixels (picture in picture only). */
  radius: number;
}

/**
 * Every box of the layout, in output pixels. `main` and `second` are the pictures as `swap` puts
 * them. The inset keeps the second picture's shape and stays inside the frame.
 */
export function placement(o: LayoutOptions, main: Size, second: Size): Placement {
  const frame = frameSize(o, main, second);
  const border = Math.round(o.border * Math.min(frame.width, frame.height));
  if (o.layout === "pip") {
    const inset = o.inset.corner
      ? insetAtCorner(o.inset.corner, o.inset.width, frame, second)
      : o.inset;
    const w = inset.width * frame.width;
    const h = w * (second.height / second.width);
    const x = Math.min(frame.width - w, Math.max(0, inset.x * frame.width - w / 2));
    const y = Math.min(frame.height - h, Math.max(0, inset.y * frame.height - h / 2));
    return {
      frame,
      main: { x: 0, y: 0, ...frame },
      second: { x, y, width: w, height: h },
      border,
      radius: o.radius * Math.min(w, h),
    };
  }
  if (o.layout === "side") {
    const auto = o.frame === "auto";
    const wa = auto
      ? Math.round(
          ((frame.height * (main.width / main.height)) /
            (frame.height * (main.width / main.height) +
              frame.height * (second.width / second.height))) *
            frame.width,
        )
      : frame.width / 2;
    const half = border / 2;
    return {
      frame,
      main: { x: 0, y: 0, width: wa - half, height: frame.height },
      second: { x: wa + half, y: 0, width: frame.width - wa - half, height: frame.height },
      border,
      radius: 0,
    };
  }
  const auto = o.frame === "auto";
  const ha = auto
    ? Math.round(
        ((frame.width * (main.height / main.width)) /
          (frame.width * (main.height / main.width) +
            frame.width * (second.height / second.width))) *
          frame.height,
      )
    : frame.height / 2;
  const half = border / 2;
  return {
    frame,
    main: { x: 0, y: 0, width: frame.width, height: ha - half },
    second: { x: 0, y: ha + half, width: frame.width, height: frame.height - ha - half },
    border,
    radius: 0,
  };
}

/** The inset centre for a box dragged to `box` (picture in picture), kept inside the frame. */
export function insetFromBox(box: Box, frame: Size, width: number): LayoutOptions["inset"] {
  const x = Math.min(frame.width - box.width, Math.max(0, box.x));
  const y = Math.min(frame.height - box.height, Math.max(0, box.y));
  return {
    x: (x + box.width / 2) / frame.width,
    y: (y + box.height / 2) / frame.height,
    width,
  };
}

/** The inset in a corner, `margin` (share of the shorter edge) from both edges. */
export function insetAtCorner(
  corner: "tl" | "tr" | "bl" | "br",
  width: number,
  frame: Size,
  second: Size,
  margin = 0.04,
): LayoutOptions["inset"] {
  const m = margin * Math.min(frame.width, frame.height);
  const w = width * frame.width;
  const h = w * (second.height / second.width);
  const x = corner.endsWith("l") ? m + w / 2 : frame.width - m - w / 2;
  const y = corner.startsWith("t") ? m + h / 2 : frame.height - m - h / 2;
  return { x: x / frame.width, y: y / frame.height, width, corner };
}

/** Output length: the main clip's for picture in picture, the later end of the two otherwise. */
export function outputLength(o: LayoutOptions, mainSec: number, secondSec: number): number {
  if (o.layout === "pip") return mainSec;
  return Math.max(mainSec, secondSec + o.offset);
}

/**
 * The second clip's time at output time `t`, and whether it is playing then. Outside its run it
 * shows its nearest frame (`hold`) or nothing (`hide`).
 */
export function secondTime(
  o: Pick<LayoutOptions, "offset" | "ended">,
  t: number,
  secondSec: number,
): { time: number; visible: boolean } {
  const local = t - o.offset;
  const playing = local >= 0 && local < secondSec;
  return {
    time: Math.min(Math.max(0, local), secondSec),
    visible: playing || o.ended === "hold",
  };
}

/** The main clip at output time `t` (it can end before a longer second clip in side by side). */
export function mainVisible(o: Pick<LayoutOptions, "ended">, t: number, mainSec: number): boolean {
  return t < mainSec || o.ended === "hold";
}

const n = (v: number) => Number(v.toFixed(3)).toString();

/**
 * The ffmpeg command for the same frame. Each input is scaled into its cell (cut to fill, or padded),
 * placed on a black canvas with `overlay`; the second input is delayed with `setpts` and `adelay` or
 * trimmed with `-ss`. Sound from the main input, the second, or both mixed then limited at −1 dBTP.
 * Rounded corners have no simple ffmpeg filter and are left out of the command (it says so).
 */
export function layoutCommand(o: {
  options: LayoutOptions;
  mainName: string;
  secondName: string;
  output: string;
  place: Placement;
  fps: number;
  kbps: number;
  durationSec: number;
  sound: { main: boolean; second: boolean };
}): string {
  const { options: op, place: p } = o;
  const { frame } = p;
  const cell = (b: Box, input: string, label: string) => {
    const w = even(b.width);
    const h = even(b.height);
    const fit =
      op.fit === "cover" || op.layout === "pip"
        ? `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`
        : `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2`;
    return `[${input}:v]${fit},setsar=1[${label}]`;
  };
  const late = op.offset > 0 ? `,setpts=PTS+${n(op.offset)}/TB` : "";
  const parts = [
    `color=black:s=${frame.width}x${frame.height}:r=${n(o.fps)}:d=${n(o.durationSec)}[bg]`,
    cell(p.main, "0", "m"),
    `${cell(p.second, "1", "s0")}`.replace("[s0]", `${late}[s0]`),
  ];
  let second = "[s0]";
  if (op.layout === "pip" && p.border > 0) {
    const bw = even(p.second.width) + 2 * p.border;
    const bh = even(p.second.height) + 2 * p.border;
    parts.push(`[s0]pad=${bw}:${bh}:${p.border}:${p.border}:${op.borderColor}[s1]`);
    second = "[s1]";
  }
  const sx = Math.round(p.second.x) - (op.layout === "pip" ? p.border : 0);
  const sy = Math.round(p.second.y) - (op.layout === "pip" ? p.border : 0);
  const eof = op.ended === "hold" ? "repeatlast=1" : "repeatlast=0";
  parts.push(
    `[bg][m]overlay=${Math.round(p.main.x)}:${Math.round(p.main.y)}:eof_action=${op.ended === "hold" ? "repeat" : "pass"}[b0]`,
  );
  parts.push(
    `[b0]${second}overlay=${sx}:${sy}:${eof}:eof_action=${op.ended === "hold" ? "repeat" : "pass"}[v]`,
  );
  const audio: string[] = [];
  let map = "";
  const ms = Math.max(0, Math.round(op.offset * 1000));
  if (op.sound === "both" && o.sound.main && o.sound.second) {
    audio.push(
      `[1:a]adelay=${ms}:all=1[a1]`,
      `[0:a][a1]amix=inputs=2:normalize=0:duration=longest,alimiter=limit=0.891[a]`,
    );
    map = `-map "[a]"`;
  } else if ((op.sound === "second" || !o.sound.main) && o.sound.second) {
    audio.push(`[1:a]adelay=${ms}:all=1[a]`);
    map = `-map "[a]"`;
  } else if (o.sound.main) map = "-map 0:a";
  const skip = op.offset < 0 ? `-ss ${n(-op.offset)} ` : "";
  const graph = [...parts, ...audio].join(";");
  return `ffmpeg -i ${shellQuote(o.mainName)} ${skip}-i ${shellQuote(o.secondName)} -filter_complex "${graph}" -map "[v]" ${map}${map ? " " : ""}-t ${n(o.durationSec)} -c:v libx264 -b:v ${o.kbps}k -pix_fmt yuv420p${map ? " -c:a aac -b:a 192k" : ""} -movflags +faststart ${shellQuote(o.output)}`;
}

type Video = NonNullable<MediaInfo["video"]>;

/**
 * Video bitrate of the combined frame: each picture costs what a re-encode of it at its drawn size
 * would (the density, capped by its own source's bitrate on that share, ../crop/plan
 * `reencodeBitrate`), the two added. An inset hidden behind nothing costs nothing extra.
 */
export function layoutBitrate(o: LayoutOptions, main: Video, second: Video, fps: number): number {
  const p = placement(o, main, second);
  const size = (b: Box) => ({
    width: Math.max(2, Math.round(b.width)),
    height: Math.max(2, Math.round(b.height)),
  });
  return (
    reencodeBitrate({ size: size(p.main), fps, source: main }) +
    reencodeBitrate({ size: size(p.second), fps, source: second })
  );
}
