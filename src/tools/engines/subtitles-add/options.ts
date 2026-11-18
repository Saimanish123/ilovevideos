/**
 * Add subtitles to a video: options and the plan that decides, before anything runs, which path a
 * file takes. Pure; shared by the panel, the worker engine and the ffmpeg runner.
 *
 * Soft track (default, no re-encode, viewers switch it on and off):
 *  - MP4, M4V, MOV: ffmpeg.wasm writes a mov_text (3GPP timed text) track, the subtitle format MP4
 *    players have long read. mediabunny can only write WebVTT (wvtt) into MP4, a later mapping, so
 *    it is not used there.
 *  - MKV: ffmpeg.wasm writes SRT, or the ASS script as it is when the file is ASS.
 *  - WebM: ffmpeg.wasm writes WebVTT (codec D_WEBVTT/SUBTITLES), the only subtitle format WebM
 *    allows. mediabunny 1.55 writes the Matroska id S_TEXT/WEBVTT there instead, which ffmpeg 9 (and
 *    players built on it) report as an unknown codec, so it is not used (checked 2026-09-30).
 *  - Containers only ffmpeg reads (AVI, WMV, FLV, MPEG-TS, ...): copied into MKV with SRT or ASS.
 * Burned in (re-encodes the picture to H.264, the sound is copied where it can be):
 *  - canvas: frames drawn with WebCodecs, white text with a black outline; any script the device
 *    has fonts for.
 *  - libass: ffmpeg's subtitles filter with the bundled Geist font, which keeps ASS styling
 *    (colours, positions, sizes) but covers Latin and Cyrillic only. Used for ASS files when asked,
 *    and for containers only ffmpeg reads.
 */
import { z } from "zod";
import { containerFromFormatName } from "@/content/formats/containers";
import { baseName, shellQuote } from "@/lib/format";
import type { MediaInfo } from "../types";
import { GEIST_RANGES } from "./geist-coverage";

export const AddSubtitlesOptions = z.object({
  /** The subtitle file as text, read on the page. Required to run. */
  subtitle: z.object({ name: z.string(), text: z.string() }).optional(),
  mode: z.enum(["soft", "burn"]).default("soft"),
  /** ISO 639-2/T, or "und". */
  language: z
    .string()
    .regex(/^[a-z]{3}$/)
    .default("und"),
  /** Soft track: mark it as the one players show by default. */
  showByDefault: z.boolean().default(true),
  /** Burn-in text size. */
  size: z.enum(["small", "medium", "large"]).default("medium"),
  /** Burn-in of an ASS file: draw it with libass and keep its styling. */
  keepStyling: z.boolean().default(true),
  /**
   * Burn-in look (./style): Classic is the plain player look and draws exactly as before these
   * options existed; Boxed puts a translucent box behind each line; Bold social is large, bold and
   * placed clear of a vertical feed's interface. The fields below override the look's defaults.
   */
  look: z.enum(["classic", "boxed", "social"]).default("classic"),
  /** Font size as a share of √(width × height), overriding `size`. */
  fontShare: z.number().min(0.01).max(0.15).optional(),
  /** Bottom edge of the text as a share of the picture's height, overriding the look's place. */
  position: z.number().min(0.1).max(1).optional(),
  /** Text colour, #rrggbb. */
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .default("#ffffff"),
  /** Box behind each line, 0 (none) to 1 (solid), overriding the look's. */
  boxOpacity: z.number().min(0).max(1).optional(),
  /** Lines wrap at this share of the picture's width, overriding the look's. */
  lineWidth: z.number().min(0.3).max(1).optional(),
  /** Split long cues into short phrases, timed by their share of the characters (./phrases). */
  phrases: z.boolean().default(false),
});
export type AddSubtitlesOptions = z.infer<typeof AddSubtitlesOptions>;

export type SoftCodec = "mov_text" | "srt" | "ass" | "webvtt";

export type SubtitlePlan =
  | {
      mode: "soft";
      backend: "ffmpeg";
      codec: SoftCodec;
      /** Output extension. */
      ext: "mp4" | "mov" | "mkv" | "webm";
      mime: string;
    }
  | { mode: "burn"; renderer: "canvas" | "libass"; ext: "mp4" | "mov" | "mkv"; mime: string };

const mimes = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
  webm: "video/webm",
} as const;

const extOf = (name: string) => name.toLowerCase().split(".").pop() ?? "";

/** True when only ffmpeg.wasm can read this file (AVI, WMV, FLV, ...). */
export function ffmpegOnly(info: MediaInfo, fileName: string): boolean {
  return containerFromFormatName(info.container, fileName)?.read === "ffmpeg";
}

/**
 * Which path the run takes. `subtitleFormat` is the detected format of the subtitle file;
 * `libassCovers` says whether the bundled font has every character of the text (`missingGlyph`).
 */
export function planSubtitles(
  info: MediaInfo,
  fileName: string,
  o: Pick<AddSubtitlesOptions, "mode" | "keepStyling">,
  subtitleFormat: string | undefined,
  libassCovers: boolean,
): SubtitlePlan {
  const ext = extOf(fileName);
  const onlyFfmpeg = ffmpegOnly(info, fileName);
  const ass = subtitleFormat === "ass";
  if (o.mode === "soft") {
    if (onlyFfmpeg)
      return {
        mode: "soft",
        backend: "ffmpeg",
        codec: ass ? "ass" : "srt",
        ext: "mkv",
        mime: mimes.mkv,
      };
    if (ext === "webm")
      return {
        mode: "soft",
        backend: "ffmpeg",
        codec: "webvtt",
        ext: "webm",
        mime: mimes.webm,
      };
    if (ext === "mkv")
      return {
        mode: "soft",
        backend: "ffmpeg",
        codec: ass ? "ass" : "srt",
        ext: "mkv",
        mime: mimes.mkv,
      };
    const out = ext === "mov" ? "mov" : "mp4";
    return { mode: "soft", backend: "ffmpeg", codec: "mov_text", ext: out, mime: mimes[out] };
  }
  const out = onlyFfmpeg ? "mp4" : ext === "mov" ? "mov" : ext === "mkv" ? "mkv" : "mp4";
  const libass = onlyFfmpeg || (ass && o.keepStyling && libassCovers);
  return { mode: "burn", renderer: libass ? "libass" : "canvas", ext: out, mime: mimes[out] };
}

/** The route the stage takes: ffmpeg paths run on the page, the canvas burn-in in the worker. */
export const planRoute = (p: SubtitlePlan): "page" | "worker" =>
  (p.mode === "soft" && p.backend === "ffmpeg") || (p.mode === "burn" && p.renderer === "libass")
    ? "page"
    : "worker";

export const outputFileName = (fileName: string, p: SubtitlePlan) =>
  `${baseName(fileName)}-subtitled.${p.ext}`;

/**
 * The first character the bundled Geist font has no glyph for, or undefined when libass can draw the
 * whole text with it. Exact, from the font's own character map (geist-coverage.ts): Latin with
 * Vietnamese and Cyrillic are covered, Greek, Arabic, Hebrew, Indic scripts, Thai, CJK and Hangul are
 * not, and neither are some symbols such as ♪. Spaces and invisible formatting marks are ignored.
 */
export function missingGlyph(text: string): string | undefined {
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if (
      /\s/.test(ch) ||
      (c >= 0x200b && c <= 0x200f) ||
      (c >= 0x202a && c <= 0x202e) ||
      c === 0xfeff
    )
      continue;
    let lo = 0;
    let hi = GEIST_RANGES.length - 1;
    let found = false;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const r = GEIST_RANGES[mid];
      if (!r) break;
      if (c < r[0]) hi = mid - 1;
      else if (c > r[1]) lo = mid + 1;
      else {
        found = true;
        break;
      }
    }
    if (!found) return ch;
  }
  return undefined;
}

/** The ffmpeg command for the same job, shown to the user (feature L7). */
export function subtitleCommand(
  videoName: string,
  subName: string,
  outName: string,
  p: SubtitlePlan,
  o: Pick<AddSubtitlesOptions, "language" | "showByDefault">,
  kbps?: number,
): string {
  const v = shellQuote(videoName);
  const s = shellQuote(subName);
  const out = shellQuote(outName);
  if (p.mode === "soft") {
    const lang = o.language !== "und" ? ` -metadata:s:s:0 language=${o.language}` : "";
    const disp = o.showByDefault ? " -disposition:s:0 default" : "";
    return `ffmpeg -i ${v} -i ${s} -map 0:v -map '0:a?' -map 1:0 -map '0:s?' -c copy -c:s:0 ${p.codec}${lang}${disp}${p.ext === "mp4" || p.ext === "mov" ? " -movflags +faststart" : ""} ${out}`;
  }
  const filter =
    p.renderer === "libass" ? `subtitles=${s}:force_style='FontName=Geist'` : `subtitles=${s}`;
  return `ffmpeg -i ${v} -vf "${filter}" -c:v libx264 -b:v ${kbps ?? 0}k -pix_fmt yuv420p -c:a copy ${out}`;
}
