/**
 * Add an intro and outro (feature G11): options and the timeline every part shares. Pure.
 *
 * The main video sets the output: its display size (less an odd edge, ADR-0060) and its frame rate.
 * An intro or outro is a clip (fitted inside the frame with bars, or filling it), a still picture
 * shown for a time, or a title card drawn here (text on a colour). With a crossfade the cards
 * overlap the video by the fade's length, so the whole is shorter than the parts by the fades.
 *
 *   intro  [0, Li)          main [m0, m1)  with m0 = Li − d1, m1 = m0 + D
 *   outro  [o0, o0 + Lo)    with o0 = m1 − d2,  total T = o0 + Lo (or m1 without an outro)
 *
 * Frames: the intro before the video and the outro after it are made on the main video's frame
 * grid (k / fps); each of the main video's own frames (shifted by m0) takes the nearest free slot
 * on that grid, so the result is one constant rate. In a crossfade, the incoming part is drawn over
 * the outgoing one at the share of the fade that has passed.
 */
import { z } from "zod";
import { shellQuote } from "@/lib/format";

/** Longest intro or outro clip: past this the job is joining videos (merge videos). */
export const MAX_CARD_SEC = 300;
/** Default time a still or a title card shows. */
export const CARD_SEC = 3;

const hex = z.string().regex(/^#[0-9a-f]{6}$/i);

export const Card = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("title"),
    text: z.string().max(200).default(""),
    background: hex.default("#000000"),
    durationSec: z.number().min(0.5).max(30).default(CARD_SEC),
  }),
  z.object({
    kind: z.literal("image"),
    file: z.instanceof(Blob),
    name: z.string(),
    width: z.number().positive(),
    height: z.number().positive(),
    durationSec: z.number().min(0.5).max(30).default(CARD_SEC),
  }),
  z.object({
    kind: z.literal("clip"),
    file: z.instanceof(Blob),
    name: z.string(),
    width: z.number().positive(),
    height: z.number().positive(),
    /** Its length, read on the page. */
    durationSec: z.number().positive().max(MAX_CARD_SEC),
    hasAudio: z.boolean().default(false),
  }),
]);
export type Card = z.infer<typeof Card>;

export const IntroOutroOptions = z.object({
  intro: Card.optional(),
  outro: Card.optional(),
  transition: z.enum(["cut", "crossfade"]).default("crossfade"),
  /** Crossfade length in seconds (each fade at most half of either side). */
  fadeSec: z.number().min(0.1).max(2).default(0.5),
  /** How a clip or picture of another shape goes in the frame. */
  fit: z.enum(["contain", "cover"]).default("contain"),
  /** Colour of the bars around a contained clip or picture. */
  bars: hex.default("#000000"),
});
export type IntroOutroOptions = z.infer<typeof IntroOutroOptions>;

export interface Size {
  width: number;
  height: number;
}

export interface Timeline {
  /** Intro and outro lengths (0 when absent). */
  intro: number;
  outro: number;
  /** Crossfade at the intro's end and the outro's start. */
  fadeIn: number;
  fadeOut: number;
  /** The main video's span in the output. */
  mainStart: number;
  mainEnd: number;
  outroStart: number;
  total: number;
}

export const cardLength = (c: Card | undefined) => (c ? c.durationSec : 0);

export function timeline(o: IntroOutroOptions, mainSec: number): Timeline {
  const intro = cardLength(o.intro);
  const outro = cardLength(o.outro);
  const fade = o.transition === "crossfade" ? o.fadeSec : 0;
  const fadeIn = intro > 0 ? Math.min(fade, intro / 2, mainSec / 2) : 0;
  const fadeOut = outro > 0 ? Math.min(fade, outro / 2, mainSec / 2) : 0;
  const mainStart = intro - fadeIn;
  const mainEnd = mainStart + mainSec;
  const outroStart = mainEnd - fadeOut;
  return {
    intro,
    outro,
    fadeIn,
    fadeOut,
    mainStart,
    mainEnd,
    outroStart,
    total: outro > 0 ? outroStart + outro : mainEnd,
  };
}

/** The output frame: the main video's display size, even. */
export const outputSize = (v: Size): Size => ({
  width: Math.max(2, v.width - (v.width % 2)),
  height: Math.max(2, v.height - (v.height % 2)),
});

/** Where a picture of size `src` goes in `frame`: inside it with bars, or filling it. */
export function fitRect(src: Size, frame: Size, fit: "contain" | "cover") {
  const k =
    fit === "contain"
      ? Math.min(frame.width / src.width, frame.height / src.height)
      : Math.max(frame.width / src.width, frame.height / src.height);
  const width = src.width * k;
  const height = src.height * k;
  return { x: (frame.width - width) / 2, y: (frame.height - height) / 2, width, height };
}

/** Share of a crossfade that has passed at `t` (0 before, 1 after). */
export const fadeShare = (t: number, start: number, length: number) =>
  length <= 0 ? (t >= start ? 1 : 0) : Math.min(1, Math.max(0, (t - start) / length));

/** Frame times on the grid from `from` (inclusive) to `to` (exclusive). */
export function gridTimes(from: number, to: number, fps: number): number[] {
  const out: number[] = [];
  const first = Math.ceil(from * fps - 1e-6);
  for (let k = first; k / fps < to - 1e-6; k++) out.push(k / fps);
  return out;
}

/** Equal-power crossfade gains at share `x` of the fade: [outgoing, incoming]. */
export const crossGains = (x: number): [number, number] => [
  Math.cos((x * Math.PI) / 2),
  Math.sin((x * Math.PI) / 2),
];

/** Text colour for a title card: white on dark backgrounds, near black on light ones. */
export function titleInk(background: string): string {
  const n = Number.parseInt(background.slice(1), 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return l > 0.3 ? "#111111" : "#ffffff";
}

/** A title from the file's own title tag or a readable file name; empty for camera names. */
export function suggestedTitle(fileName: string, tagTitle?: string): string {
  if (tagTitle?.trim()) return tagTitle.trim().slice(0, 200);
  const stem = fileName.replace(/\.[^.]+$/, "");
  if (
    /^(img|vid|mov|dsc|dscn|pxl|mvi|gopr|gh\d|dji|screen ?recording|rpreplay)[_ -]?\d/i.test(stem)
  )
    return "";
  if (/^\d|^[\w-]*\d{6,}/.test(stem)) return "";
  const words = stem.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return /[a-z]{3}/i.test(words) ? words.slice(0, 200) : "";
}

/**
 * The nearest FFmpeg command, shown to the user (feature L7): each card made or scaled to the main
 * video's size and rate, then `xfade`/`acrossfade` or `concat`.
 */
export function introOutroCommand(
  o: IntroOutroOptions,
  main: { name: string; size: Size; fps: number; durationSec: number; hasAudio: boolean },
  outName: string,
  kbps: number,
): string {
  const { width: w, height: h } = outputSize(main.size);
  const fps = Math.round(main.fps * 1000) / 1000 || 30;
  const tl = timeline(o, main.durationSec);
  const inputs: string[] = [];
  const parts: { v: string; a: string; len: number }[] = [];
  let filters = "";
  const scale =
    o.fit === "contain"
      ? `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=${o.bars.replace("#", "0x")}`
      : `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`;
  const card = (c: Card, label: string) => {
    const i = inputs.length;
    if (c.kind === "title") {
      inputs.push(
        `-f lavfi -t ${c.durationSec} -i color=c=${c.background.replace("#", "0x")}:s=${w}x${h}:r=${fps}`,
      );
      filters += `[${i}:v]drawtext=fontfile=Geist-Bold.ttf:text=${shellQuote(c.text)}:fontcolor=${titleInk(c.background).replace("#", "0x")}:fontsize=${Math.round(h * 0.09)}:x=(w-tw)/2:y=(h-th)/2,format=yuv420p,setsar=1[${label}v];`;
    } else if (c.kind === "image") {
      inputs.push(`-loop 1 -t ${c.durationSec} -i ${shellQuote(c.name)}`);
      filters += `[${i}:v]${scale},fps=${fps},format=yuv420p,setsar=1[${label}v];`;
    } else {
      inputs.push(`-i ${shellQuote(c.name)}`);
      filters += `[${i}:v]${scale},fps=${fps},format=yuv420p,setsar=1[${label}v];`;
    }
    const a = c.kind === "clip" && c.hasAudio ? `[${i}:a]` : `[${label}s]`;
    if (a === `[${label}s]`)
      filters += `anullsrc=r=48000:cl=stereo,atrim=0:${c.durationSec}[${label}s];`;
    parts.push({ v: `[${label}v]`, a, len: c.durationSec });
  };
  if (o.intro) card(o.intro, "in");
  const m = inputs.length;
  inputs.push(`-i ${shellQuote(main.name)}`);
  filters += `[${m}:v]scale=${w}:${h},setsar=1,format=yuv420p[mv];`;
  if (!main.hasAudio) filters += `anullsrc=r=48000:cl=stereo,atrim=0:${main.durationSec}[ms];`;
  parts.push({ v: "[mv]", a: main.hasAudio ? `[${m}:a]` : "[ms]", len: main.durationSec });
  if (o.outro) card(o.outro, "out");
  let v = parts[0]?.v ?? "";
  let a = parts[0]?.a ?? "";
  let at = parts[0]?.len ?? 0;
  for (let k = 1; k < parts.length; k++) {
    const p = parts[k];
    if (!p) continue;
    const d = k === 1 && o.intro ? tl.fadeIn : tl.fadeOut;
    const vo = `[v${k}]`;
    const ao = `[a${k}]`;
    if (d > 0) {
      filters += `${v}${p.v}xfade=transition=fade:duration=${d}:offset=${(at - d).toFixed(3)}${vo};${a}${p.a}acrossfade=d=${d}${ao};`;
      at += p.len - d;
    } else {
      filters += `${v}${a}${p.v}${p.a}concat=n=2:v=1:a=1${vo}${ao};`;
      at += p.len;
    }
    v = vo;
    a = ao;
  }
  const graph = filters.replace(/;$/, "");
  return `ffmpeg ${inputs.join(" ")} -filter_complex "${graph}" -map "${v}" -map "${a}" -c:v libx264 -b:v ${kbps}k -pix_fmt yuv420p -c:a aac -b:a 160k ${shellQuote(outName)}`;
}

/** "a 3 s title card" for summaries. */
export function cardWords(c: Card | undefined): string {
  if (!c) return "";
  const s = `${Number(c.durationSec.toFixed(1))} s`;
  return c.kind === "title"
    ? `a ${s} title card`
    : c.kind === "image"
      ? `a picture for ${s}`
      : `a ${s} clip`;
}
