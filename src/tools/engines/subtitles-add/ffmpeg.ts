/**
 * Add subtitles with ffmpeg.wasm on the page: a soft mov_text track in MP4/MOV, an SRT or ASS track
 * in MKV (also for containers only ffmpeg reads), and burn-in with libass. Soft tracks are stream
 * copies (`-c copy`): only the new subtitle stream is written. libass has no fontconfig in this core,
 * so the bundled Geist files go into /fonts and every style is forced to that family.
 */
import { GEIST_FONTS, loadFontFile } from "@/tools/workers/assets";
import { geometryBitrate } from "../crop/plan";
import { totalFrames } from "../crop/progress";
import { EngineError } from "../errors";
import { runFfmpeg } from "../overlay/ffmpeg";
import { languageByCode } from "../subtitles/languages";
import type { EngineContext, EngineResult, MediaInfo } from "../types";
import {
  type AddSubtitlesOptions,
  missingGlyph,
  outputFileName,
  planSubtitles,
  subtitleCommand,
} from "./options";
import { burnCues } from "./phrases";
import { assForceStyle, isPlain } from "./style";
import { allText, needSubtitle, trackText } from "./track";

const formats = { mp4: "mp4", mov: "mov", mkv: "matroska", webm: "webm" } as const;
/** Display names of the same containers, for failure messages. */
const containerNames = { mp4: "MP4", mov: "MOV", mkv: "MKV", webm: "WebM" } as const;
/** ASS font sizes on the default 384×288 script for the three size choices. */
const assSize = { small: 13, medium: 16, large: 20 } as const;

export async function addSubtitlesWithFfmpeg(
  file: File,
  info: MediaInfo,
  o: AddSubtitlesOptions,
  ctx: EngineContext,
): Promise<EngineResult> {
  const { sub, track } = needSubtitle(o, info.durationSec);
  const missing = missingGlyph(allText(track));
  const plan = planSubtitles(info, file.name, o, track.doc.format, missing === undefined);
  const outputName = outputFileName(file.name, plan);
  const inPath = `input.${file.name.split(".").pop()?.toLowerCase() ?? "bin"}`;
  const outPath = `output.${plan.ext}`;
  const cues = `${track.doc.cues.length.toLocaleString("en")} ${track.doc.cues.length === 1 ? "cue" : "cues"}`;

  if (plan.mode === "soft") {
    if (plan.backend !== "ffmpeg")
      throw new EngineError("internal", "This file is handled in the worker.", "Try again.");
    const as = plan.codec === "ass" ? "ass" : plan.codec === "webvtt" ? "vtt" : "srt";
    const subPath = `subs.${as}`;
    const lang =
      o.language === "und"
        ? undefined
        : plan.ext === "mkv"
          ? (languageByCode.get(o.language)?.bib ?? o.language)
          : o.language;
    const data = await runFfmpeg({
      files: [
        { path: inPath, data: file },
        {
          path: subPath,
          data: new TextEncoder().encode(trackText(track, as)),
        },
      ],
      inputArgs: ["-i", inPath, "-i", subPath],
      // The new track is mapped first so it is subtitle stream 0; existing tracks (and MKV fonts) follow.
      outputArgs: [
        "-map",
        "0:v",
        "-map",
        "0:a?",
        "-map",
        "1:0",
        "-map",
        "0:s?",
        ...(plan.ext === "mkv" ? ["-map", "0:t?"] : []),
        "-c",
        "copy",
        "-c:s:0",
        plan.codec,
        ...(lang ? ["-metadata:s:s:0", `language=${lang}`] : []),
        "-disposition:s:0",
        o.showByDefault ? "default" : "0",
        ...(plan.ext === "mp4" || plan.ext === "mov" ? ["-movflags", "+faststart"] : []),
        "-f",
        formats[plan.ext],
      ],
      outPath,
      readingLabel: "Reading the video",
      container: containerNames[plan.ext],
      failureHint: "Try Burn in instead, or convert the video to MP4 first.",
      ctx,
    });
    return {
      blob: new Blob([data as BlobPart], { type: plan.mime }),
      filename: outputName,
      ffmpegCommand: subtitleCommand(file.name, sub.name, outputName, plan, o),
      meta: `Soft track · ${plan.codec === "mov_text" ? "mov_text" : plan.codec === "webvtt" ? "WebVTT" : plan.codec.toUpperCase()} · ${cues} · nothing re-encoded`,
    };
  }

  if (plan.renderer !== "libass")
    throw new EngineError("internal", "This file is handled in the worker.", "Try again.");
  if (missing !== undefined)
    throw new EngineError(
      "unsupported-input",
      `The subtitle font cannot draw “${missing}”, so these subtitles cannot be burned into this file.`,
      "Add them as a soft track instead, or convert the video to MP4 first and burn them in there.",
    );
  const v = info.video;
  if (!v)
    throw new EngineError(
      "unsupported-input",
      "This file has no video track.",
      "Choose a video file.",
    );
  ctx.onProgress({ phase: "loading", ratio: 0, detail: "Loading the subtitle font" });
  const fonts = await Promise.all(
    GEIST_FONTS.map(async (f) => ({ path: `/fonts/${f.file}`, data: await loadFontFile(f.file) })),
  );
  const ass = track.doc.format === "ass" && o.keepStyling;
  // An ASS script keeps its own sizes, colours and positions; other files get the chosen look,
  // the plain one exactly as before the looks existed (./style).
  const force = ass
    ? "FontName=Geist"
    : isPlain(o)
      ? `FontName=Geist,Fontsize=${assSize[o.size]}`
      : assForceStyle(o, v);
  const burned = ass
    ? track
    : { ...track, doc: { ...track.doc, cues: burnCues(track.doc.cues, o) } };
  const filter = `subtitles=subs.ass:fontsdir=/fonts:force_style='${force}'`;
  const kbps = Math.round(geometryBitrate({ width: v.width, height: v.height }, v.fps) / 1000);
  const a = info.audio?.[0]?.codec;
  const copyAudio = !a || plan.ext === "mkv" || a === "aac" || a === "mp3";
  const data = await runFfmpeg({
    files: [
      { path: inPath, data: file },
      { path: "subs.ass", data: new TextEncoder().encode(trackText(burned, "ass")) },
      ...fonts,
    ],
    inputArgs: ["-i", inPath],
    outputArgs: [
      "-vf",
      filter,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-b:v",
      `${kbps}k`,
      "-pix_fmt",
      "yuv420p",
      ...(info.audio?.length
        ? copyAudio
          ? ["-c:a", "copy"]
          : ["-c:a", "aac", "-b:a", "160k"]
        : ["-an"]),
      ...(plan.ext === "mp4" || plan.ext === "mov" ? ["-movflags", "+faststart"] : []),
      "-f",
      formats[plan.ext],
    ],
    outPath,
    frames: totalFrames(info.durationSec, v.fps),
    readingLabel: "Reading the video",
    container: containerNames[plan.ext],
    failureHint: "Add the subtitles as a soft track instead, or convert the video to MP4 first.",
    ctx,
  });
  const sound = !info.audio?.length ? "no sound" : copyAudio ? "sound copied" : "sound in AAC";
  return {
    blob: new Blob([data as BlobPart], { type: plan.mime }),
    filename: outputName,
    ffmpegCommand: subtitleCommand(file.name, sub.name, outputName, plan, o, kbps),
    meta: `${v.width}×${v.height} · ${cues} burned in${ass ? " with the ASS styling" : ""} · H.264, re-encoded · ${sound}`,
  };
}
