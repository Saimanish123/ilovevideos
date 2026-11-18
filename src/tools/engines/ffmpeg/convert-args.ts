/**
 * The ffmpeg arguments for a container conversion: which streams go in, and per sound track whether
 * it is copied or re-encoded. Pure; shared by the runner and the command the page shows.
 *
 * Without `-map`, ffmpeg keeps one video and one audio stream. A conversion keeps every sound track
 * the source has (each copied when the target holds its codec, else re-encoded to the target's sound
 * codec), with its language and title, and the first picture that is not cover art (`0:V`; the
 * native path keeps the primary video track too). Matroska output also keeps subtitle streams and
 * attachments, which it holds in any form; MP4, MOV and the rest get none, as on the native path.
 */
import type { ConversionPlan } from "../convert-video/plan";
import { codecName, normalizeCodec, planConversion } from "../convert-video/plan";
import { type Size, withEvenCrop } from "../crop/math";
import type { MediaInfo } from "../types";

export interface SoundTrackPlan {
  /** 0-based among the source's audio streams (ffmpeg's `0:a:N`). */
  index: number;
  codec: string;
  copy: boolean;
  language?: string;
}

/**
 * Each sound track's fate, by the same rule as the plan's first track (`planConversion`), so the
 * panel's "sound copied" stays true for every track. Without `info`, only the plan's first track.
 */
export function soundTracks(
  plan: ConversionPlan,
  info: MediaInfo | undefined,
  fileName: string,
  forceVideoTranscode: boolean,
): SoundTrackPlan[] {
  const audio = info?.audio ?? [];
  if (audio.length === 0) return [];
  return audio.map((a, index) => ({
    index,
    codec: normalizeCodec(a.codec) ?? a.codec,
    copy:
      index === 0
        ? plan.copyAudio
        : planConversion(
            { ...info, audio: [a] } as MediaInfo,
            fileName,
            plan.target.id,
            forceVideoTranscode,
          ).copyAudio,
    language: a.language,
  }));
}

/** FLAC (and TrueHD) in MP4 still count as experimental in FFmpeg 5.1, the wasm build: `-strict -2`. */
const EXPERIMENTAL_IN_MP4 = new Set(["flac"]);

/** ffmpeg encoders under the codec ids ../crop/math knows (only these take even edges only). */
const EVEN_EDGE_ENCODERS: Record<string, string> = { libx264: "avc", libx265: "hevc" };

/**
 * Everything between `-i <input> -threads N` and the output name. `picture` is the source's size:
 * a re-encode to H.264 cuts an odd last column or row (`crop=640:360:0:0`, ADR-0060), as libx264
 * refuses odd 4:2:0 sizes and the native path cuts the same.
 */
export function convertArgs(
  plan: ConversionPlan,
  tracks: SoundTrackPlan[],
  picture?: Size,
): string[] {
  const f = plan.target.ffmpeg;
  if (!f) throw new Error(`no ffmpeg muxer for ${plan.target.id}`);
  const mkv = f.format === "matroska";
  const mp4Family = f.format === "mp4" || f.format === "mov";
  const args = ["-map", "0:V:0?"];
  args.push("-map", "0:a?");
  if (mkv) args.push("-map", "0:s?", "-map", "0:t?");
  const even = EVEN_EDGE_ENCODERS[f.video];
  const cut = !plan.copyVideo && picture && even ? withEvenCrop(picture, "", even) : "";
  if (cut) args.push("-vf", cut);
  args.push("-c:v", plan.copyVideo ? "copy" : f.video);
  // One decision for every track: one option. Mixed: re-encode by default, copy the listed ones.
  const first = tracks[0]?.copy ?? plan.copyAudio;
  if (tracks.every((t) => t.copy === first)) args.push("-c:a", first ? "copy" : f.audio);
  else {
    args.push("-c:a", f.audio);
    for (const t of tracks) if (t.copy) args.push(`-c:a:${t.index}`, "copy");
  }
  if (mkv) args.push("-c:s", "copy");
  if (!plan.copyVideo) args.push(...(f.args ?? []));
  else if (mp4Family) args.push(...faststartOnly(f.args));
  if (mp4Family && tracks.some((t) => t.copy && EXPERIMENTAL_IN_MP4.has(t.codec)))
    args.push("-strict", "-2");
  args.push("-f", f.format);
  return args;
}

/** A stream copy into MP4/MOV keeps the index at the front, without re-encoding options. */
function faststartOnly(fargs: string[] | undefined): string[] {
  const i = fargs?.indexOf("-movflags") ?? -1;
  return i >= 0 && fargs ? ["-movflags", fargs[i + 1] ?? "+faststart"] : [];
}

/**
 * The result line for more than one sound track: "2 sound tracks kept: eng AC-3 → AAC, fra AC-3 → AAC".
 * Undefined for one track or none (the page's own line already describes it).
 */
export function soundTracksMeta(tracks: SoundTrackPlan[], targetAudio: string): string | undefined {
  if (tracks.length < 2) return undefined;
  const to = codecName(targetAudio) ?? targetAudio;
  const each = tracks.map((t) => {
    const from = codecName(t.codec) ?? t.codec;
    return `${t.language ?? `track ${t.index + 1}`} ${t.copy ? `${from} copied` : `${from} → ${to}`}`;
  });
  return `${tracks.length} sound tracks kept: ${each.join(", ")}`;
}
