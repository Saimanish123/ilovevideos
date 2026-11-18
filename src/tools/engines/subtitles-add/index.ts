/**
 * Add subtitles to a video (feature F1), the worker half: burned-in text drawn on every frame with a
 * canvas and encoded with WebCodecs. Soft tracks (mov_text in MP4/MOV, SRT/ASS in MKV, WebVTT in
 * WebM) and libass burn-in run with ffmpeg.wasm on the page (./ffmpeg via engines/page-runners); see
 * ./options for which file takes which path and why mediabunny's own subtitle muxing is not used.
 */
import { GEIST_FONTS, loadFontFile } from "@/tools/workers/assets";
import { EngineError } from "../errors";
import { compositeSupported, runComposite } from "../overlay/composite";
import { CueRenderer, loadWorkerFonts } from "../overlay/text";
import type { Engine, EngineContext, EngineResult, MediaInfo } from "../types";
import {
  AddSubtitlesOptions,
  missingGlyph,
  planRoute,
  planSubtitles,
  subtitleCommand,
} from "./options";
import { burnCues } from "./phrases";
import { cueStyle } from "./style";
import { allText, needSubtitle, type TrackDoc } from "./track";

const cueCount = (t: TrackDoc) =>
  `${t.doc.cues.length.toLocaleString("en")} ${t.doc.cues.length === 1 ? "cue" : "cues"}`;

/** Burned in with the canvas renderer: every frame re-encoded to H.264 with the text drawn on it. */
async function burnCanvas(
  file: File,
  info: MediaInfo,
  o: AddSubtitlesOptions,
  track: TrackDoc,
  subName: string,
  ctx: EngineContext,
): Promise<EngineResult> {
  ctx.onProgress({ phase: "loading", ratio: 0, detail: "Loading the subtitle font" });
  // The font is a nicety: without it the system sans is used and the text still burns in.
  const fonts = await Promise.all(
    GEIST_FONTS.map(async (f) => ({
      bytes: await loadFontFile(f.file),
      weight: f.weight,
      style: f.style,
    })),
  ).catch(() => []);
  await loadWorkerFonts(fonts);
  const plan = planSubtitles(
    info,
    file.name,
    { ...o, keepStyling: false },
    track.doc.format,
    false,
  );
  const result = await runComposite({
    file,
    info,
    layer: ({ width, height }) => {
      const r = new CueRenderer(
        burnCues(track.doc.cues, o),
        width,
        height,
        o.size,
        cueStyle(o, { width, height }),
      );
      return { draw: (c2d, t) => r.draw(c2d, t) };
    },
    // Cue times are from the video's start, as the page's preview plays them (ADR-0055).
    pageTime: true,
    suffix: "subtitled",
    what: `${cueCount(track)} · ${o.look === "classic" ? "Classic" : o.look === "boxed" ? "Boxed" : "Bold social"}${o.phrases ? ", short phrases" : ""}`,
    ffmpegCommand: ({ outputName, kbps }) =>
      subtitleCommand(file.name, subName, outputName, plan, o, kbps),
    ctx,
  });
  return result;
}

export const addSubtitlesEngine: Engine<AddSubtitlesOptions> = {
  id: "subtitles-add",
  backends: ["webcodecs", "ffmpeg-wasm"],
  optionsSchema: AddSubtitlesOptions,
  async supports(backend, input, options) {
    if (backend !== "webcodecs") return false;
    if (options.mode === "soft") return true;
    return compositeSupported(input.info);
  },
  async run(_backend, inputs, options, ctx) {
    const input = inputs[0];
    const info = input?.info;
    if (!input || !info?.video)
      throw new EngineError(
        "unsupported-input",
        "This file has no video track to add subtitles to.",
        "Choose a video file.",
      );
    const { sub, track } = needSubtitle(options, info.durationSec);
    const plan = planSubtitles(
      info,
      input.file.name,
      options,
      track.doc.format,
      !missingGlyph(allText(track)),
    );
    // mov_text, SRT/ASS in MKV and libass burn-in belong to the page-side ffmpeg runner.
    if (planRoute(plan) === "page")
      throw new EngineError(
        "internal",
        "This file is handled by the ffmpeg engine on the page.",
        "Try again.",
      );
    return burnCanvas(input.file, info, options, track, sub.name, ctx);
  },
};
