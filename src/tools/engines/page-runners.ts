import type { EngineId } from "@/tools/registry/schema";
import type { EngineContext, EngineResult, MediaInfo } from "./types";

export type PageRunner = (
  file: File,
  info: MediaInfo,
  options: unknown,
  ctx: EngineContext,
) => Promise<EngineResult>;

/** A page-side runner for a multi-file engine (spec.multiple with a `route` to the page). */
export type PageManyRunner = (
  inputs: { file: File; info: MediaInfo }[],
  options: unknown,
  ctx: EngineContext,
) => Promise<EngineResult>;

/** Multi-file engines that can run on the page thread (merge audio: ffmpeg.wasm encodes MP3). */
export const pageRunnersMany: Partial<Record<EngineId, () => Promise<PageManyRunner>>> = {
  "join-audio": async () => {
    const { joinAudioOnPage } = await import("./join-audio/page");
    return (inputs, options, ctx) => joinAudioOnPage(inputs, options, ctx);
  },
};

/** Engines (or engine paths) that run on the page thread instead of the engine worker. */
export const pageRunners: Partial<Record<EngineId, () => Promise<PageRunner>>> = {
  "video-to-gif": async () => {
    const [{ gifWithFfmpeg }, { VideoToGifOptions }] = await Promise.all([
      import("./video-to-gif/ffmpeg"),
      import("./video-to-gif/options"),
    ]);
    return (file, info, options, ctx) =>
      gifWithFfmpeg(file, info, VideoToGifOptions.parse(options), ctx);
  },
  "convert-video": async () => {
    const [{ convertWithFfmpeg }, { planConversion }, { ConvertVideoOptions }] = await Promise.all([
      import("./ffmpeg"),
      import("./convert-video/plan"),
      import("./convert-video"),
    ]);
    return (file, info, options, ctx) => {
      const o = ConvertVideoOptions.parse(options);
      const forceVideoTranscode = o.videoCodec === "avc";
      return convertWithFfmpeg(
        file,
        planConversion(info, file.name, o.to, forceVideoTranscode),
        ctx,
        { info, forceVideoTranscode },
      );
    };
  },
  speed: async () => {
    const [{ speedWithFfmpeg }, { SpeedOptions }] = await Promise.all([
      import("./speed/ffmpeg"),
      import("./speed"),
    ]);
    return (file, info, options, ctx) =>
      speedWithFfmpeg(file, info, SpeedOptions.parse(options), ctx);
  },
  "video-to-audio": async () => {
    const [{ extractAudioWithFfmpeg }, { planExtraction }, { VideoToAudioOptions, noAudioError }] =
      await Promise.all([
        import("./ffmpeg"),
        import("./video-to-audio/plan"),
        import("./video-to-audio"),
      ]);
    return (file, info, options, ctx) => {
      const o = VideoToAudioOptions.parse(options);
      const plan = planExtraction(info, file.name, o.to, o.bitrate);
      if (!plan.hasAudio) throw noAudioError();
      return extractAudioWithFfmpeg(file, plan, o, info, ctx);
    };
  },
  // Audio → audio re-encodes to MP3, AAC, FLAC, Vorbis and AIFF, and WMA or AIFF sources.
  "convert-audio": async () => {
    const [
      { extractAudioWithFfmpeg },
      { planExtraction },
      { noAudioError },
      { ConvertAudioOptions, sourceBitDepth },
    ] = await Promise.all([
      import("./ffmpeg"),
      import("./video-to-audio/plan"),
      import("./video-to-audio"),
      import("./convert-audio"),
    ]);
    return async (file, info, options, ctx) => {
      const o = ConvertAudioOptions.parse(options);
      const bitDepth = await sourceBitDepth(file, info);
      const plan = planExtraction(info, file.name, o.to, o.bitrate, {
        bitDepth,
        channels: o.channels,
        sampleRate: o.sampleRate,
      });
      if (!plan.hasAudio) throw noAudioError();
      return extractAudioWithFfmpeg(
        file,
        plan,
        { ...o, range: false, start: 0, end: 0 },
        info,
        ctx,
        "Try another format, or check that the file plays in a media player.",
      );
    };
  },
  // Crop and aspect ratio: only for files the native reader cannot open (the panel's `route`).
  crop: async () => {
    const [{ geometryWithFfmpeg }, { CropOptions, cropRect }] = await Promise.all([
      import("./crop/ffmpeg"),
      import("./crop/options"),
    ]);
    return (file, info, options, ctx) => {
      const v = info.video ?? { width: 0, height: 0 };
      const rect = cropRect(CropOptions.parse(options), v);
      return geometryWithFfmpeg(file, info, { kind: "crop", rect }, "cropped", ctx);
    };
  },
  "aspect-ratio": async () => {
    const [{ geometryWithFfmpeg }, { AspectRatioOptions, aspectPlan, aspectSuffix }] =
      await Promise.all([import("./crop/ffmpeg"), import("./aspect-ratio/options")]);
    return (file, info, options, ctx) => {
      const o = AspectRatioOptions.parse(options);
      const v = info.video ?? { width: 0, height: 0 };
      return geometryWithFfmpeg(file, info, aspectPlan(o, v), aspectSuffix(o), ctx);
    };
  },
  // GIF → video where the browser has no ImageDecoder (the panel's `route`).
  "gif-to-video": async () => {
    const [{ gifToVideoWithFfmpeg }, { GifToVideoOptions }] = await Promise.all([
      import("./gif-to-video/ffmpeg"),
      import("./gif-to-video/options"),
    ]);
    return (file, info, options, ctx) =>
      gifToVideoWithFfmpeg(file, info, GifToVideoOptions.parse(options), ctx);
  },
  // Add subtitles: mov_text in MP4/MOV, SRT/ASS in MKV and libass burn-in (the panel's `route`).
  "subtitles-add": async () => {
    const [{ addSubtitlesWithFfmpeg }, { AddSubtitlesOptions }] = await Promise.all([
      import("./subtitles-add/ffmpeg"),
      import("./subtitles-add/options"),
    ]);
    return (file, info, options, ctx) =>
      addSubtitlesWithFfmpeg(file, info, AddSubtitlesOptions.parse(options), ctx);
  },
  // Watermark: every run comes here. The mark PNG is redrawn if the panel has not caught up with the
  // last change, then files ffmpeg alone reads use the overlay filter and the rest go to the worker.
  watermark: async () => {
    const [
      { watermarkWithFfmpeg },
      { WatermarkOptions },
      { rasterize, rasterKey },
      { needsFfmpeg },
    ] = await Promise.all([
      import("./watermark/ffmpeg"),
      import("./watermark/options"),
      import("./watermark/raster"),
      import("./crop/plan"),
    ]);
    return async (file, info, options, ctx) => {
      let o = WatermarkOptions.parse(options);
      const v = { width: info.video?.width ?? 0, height: info.video?.height ?? 0 };
      if (v.width > 0 && (!o.mark || o.markKey !== rasterKey(o, v))) {
        const r = await rasterize(o, v);
        if (r)
          o = {
            ...o,
            mark: r.blob,
            markWidth: r.width,
            markHeight: r.height,
            markKey: rasterKey(o, v),
          };
      }
      if (needsFfmpeg(info, file.name)) return watermarkWithFfmpeg(file, info, o, ctx);
      const { EngineClient } = await import("@/tools/workers/client");
      const client = new EngineClient();
      try {
        const r = await client.run("watermark", file, o, {
          info,
          signal: ctx.signal,
          onProgress: ctx.onProgress,
        });
        return { blob: r.blob, filename: r.filename, ffmpegCommand: r.ffmpegCommand, meta: r.meta };
      } finally {
        client.dispose();
      }
    };
  },
  // Edit metadata: every run. The output is new tag bytes around slices of the source File, so on
  // the page nothing is copied into memory (the worker would have to hand the whole file back).
  "edit-metadata": async () => {
    const [{ editMetadata }, { EditMetadataOptions }] = await Promise.all([
      import("./edit-metadata"),
      import("./edit-metadata/fields"),
    ]);
    return (file, _info, options, ctx) =>
      editMetadata(file, EditMetadataOptions.parse(options), ctx);
  },
  cover: async () => {
    const [{ editMetadata }, { EditMetadataOptions }] = await Promise.all([
      import("./edit-metadata"),
      import("./edit-metadata/fields"),
    ]);
    return (file, _info, options, ctx) =>
      editMetadata(file, EditMetadataOptions.parse(options), ctx);
  },
  // Volume, normalise and fades: every run starts on the page, which picks the worker alone or adds
  // the ffmpeg.wasm decode and encode stages for formats the browser cannot write (../sound/page).
  volume: async () => {
    const { runSoundPage } = await import("./sound/page");
    return (file, info, options, ctx) =>
      runSoundPage("volume", file, info, options as Record<string, unknown>, ctx);
  },
  "audio-fade": async () => {
    const { runSoundPage } = await import("./sound/page");
    return (file, info, options, ctx) =>
      runSoundPage("audio-fade", file, info, options as Record<string, unknown>, ctx);
  },
  "remove-silence": async () => {
    const { runSoundPage } = await import("./sound/page");
    return (file, info, options, ctx) =>
      runSoundPage("remove-silence", file, info, options as Record<string, unknown>, ctx);
  },
  // Ringtone maker: every run (native AAC, or WAV from the worker and ffmpeg.wasm for MP3 and OGG).
  ringtone: async () => {
    const { runRingtone } = await import("./ringtone/page");
    return (file, info, options, ctx) => runRingtone(file, info, options, ctx);
  },
  // Change pitch: the same page runner as volume (worker alone, or with the ffmpeg.wasm stages).
  pitch: async () => {
    const { runSoundPage } = await import("./sound/page");
    return (file, info, options, ctx) =>
      runSoundPage("pitch", file, info, options as Record<string, unknown>, ctx);
  },
  // Fast start: every run. Box headers and the index are read from the File; the output is slices
  // of the File around the new index, so nothing is decoded or copied into memory.
  faststart: async () => {
    const { faststartOnPage } = await import("./faststart");
    return (file, _info, _options, ctx) => faststartOnPage(file, ctx);
  },
  // Frame rate, filters, fades and borders: only for files the native reader cannot open (the
  // panel's `route`); ffmpeg's fps, colour, fade and pad filters on the page.
  framerate: async () => {
    const [{ pictureWithFfmpeg }, { FramerateOptions }, { formatFps, outputFrames }] =
      await Promise.all([
        import("./video-filter/ffmpeg"),
        import("./framerate"),
        import("./framerate/math"),
      ]);
    return (file, info, options, ctx) => {
      const o = FramerateOptions.parse(options);
      return pictureWithFfmpeg({
        file,
        info,
        vf: `fps=${Number(o.fps.toFixed(3))},format=yuv420p`,
        fps: o.fps,
        suffix: `${String(Number(o.fps.toFixed(3))).replace(".", "_")}fps`,
        what: `${formatFps(info.video?.fps ?? 0)} → ${formatFps(o.fps)}`,
        frames: outputFrames(info.durationSec, o.fps),
        ctx,
      });
    };
  },
  filter: async () => {
    const [
      { pictureWithFfmpeg },
      { FilterOptions, filterSuffix, filterTransform, filterWhat },
      { ffmpegColorFilter },
    ] = await Promise.all([
      import("./video-filter/ffmpeg"),
      import("./video-filter/options"),
      import("./video-filter/color"),
    ]);
    return (file, info, options, ctx) => {
      const o = FilterOptions.parse(options);
      const vf = ffmpegColorFilter(filterTransform(o));
      return pictureWithFfmpeg({
        file,
        info,
        vf: `${vf || "null"},format=yuv420p`,
        suffix: filterSuffix(o),
        what: filterWhat(o),
        frames: Math.max(1, Math.round(info.durationSec * (info.video?.fps || 30))),
        ctx,
      });
    };
  },
  "video-fade": async () => {
    const [{ pictureWithFfmpeg }, { FadeOptions }, { fadeFilters, fadeWhat }] = await Promise.all([
      import("./video-filter/ffmpeg"),
      import("./video-filter/options"),
      import("./video-fade/math"),
    ]);
    return (file, info, options, ctx) => {
      const o = FadeOptions.parse(options);
      const f = fadeFilters(o, info.durationSec);
      return pictureWithFfmpeg({
        file,
        info,
        vf: f.vf,
        af: o.audio && f.af ? f.af : undefined,
        suffix: "faded",
        what: fadeWhat(o, info.durationSec),
        frames: Math.max(1, Math.round(info.durationSec * (info.video?.fps || 30))),
        ctx,
      });
    };
  },
  pad: async () => {
    const [{ geometryWithFfmpeg }, { PadOptions, borderPlan, borderWhat }] = await Promise.all([
      import("./crop/ffmpeg"),
      import("./pad/options"),
    ]);
    return (file, info, options, ctx) => {
      const o = PadOptions.parse(options);
      return geometryWithFfmpeg(file, info, borderPlan(o, info), "border", ctx, {
        what: borderWhat(o, info),
      });
    };
  },
  // Audio to video: every run. The still is drawn on the page (UI font, image decoders) when the
  // panel's copy no longer matches this file and these options, then the worker encodes.
  "audio-to-video": async () => {
    const [{ AudioToVideoOptions, stillKey }, { renderStill }] = await Promise.all([
      import("./audio-to-video/options"),
      import("./audio-to-video/still"),
    ]);
    return async (file, info, options, ctx) => {
      let o = AudioToVideoOptions.parse(options);
      const facts = { name: file.name, title: info.tags?.title, artist: info.tags?.artist };
      if (!o.still || o.stillKey !== stillKey(o, facts)) {
        ctx.onProgress({ phase: "loading", ratio: 0, detail: "Drawing the picture" });
        const r = await renderStill(o, facts);
        if (r) o = { ...o, still: r.blob, stillKey: r.key };
      }
      const { EngineClient } = await import("@/tools/workers/client");
      const client = new EngineClient();
      try {
        const r = await client.run("audio-to-video", file, o, {
          info,
          signal: ctx.signal,
          onProgress: ctx.onProgress,
        });
        return { blob: r.blob, filename: r.filename, ffmpegCommand: r.ffmpegCommand, meta: r.meta };
      } finally {
        client.dispose();
      }
    };
  },
  // Add text: every run. The text PNG is redrawn if the panel has not caught up with the last change,
  // then files ffmpeg alone reads use the fade and overlay filters and the rest go to the worker.
  "text-overlay": async () => {
    const [
      { textWithFfmpeg },
      { TextOverlayOptions },
      { rasterizeText, textKey },
      { needsFfmpeg },
    ] = await Promise.all([
      import("./text-overlay/ffmpeg"),
      import("./text-overlay/options"),
      import("./text-overlay/raster"),
      import("./crop/plan"),
    ]);
    return async (file, info, options, ctx) => {
      let o = TextOverlayOptions.parse(options);
      const v = { width: info.video?.width ?? 0, height: info.video?.height ?? 0 };
      if (v.width > 0 && (!o.mark || o.markKey !== textKey(o, v))) {
        const r = await rasterizeText(o, v);
        if (r)
          o = {
            ...o,
            mark: r.blob,
            markWidth: r.width,
            markHeight: r.height,
            markKey: textKey(o, v),
          };
      }
      if (needsFfmpeg(info, file.name)) return textWithFfmpeg(file, info, o, ctx);
      const { EngineClient } = await import("@/tools/workers/client");
      const client = new EngineClient();
      try {
        const r = await client.run("text-overlay", file, o, {
          info,
          signal: ctx.signal,
          onProgress: ctx.onProgress,
        });
        return { blob: r.blob, filename: r.filename, ffmpegCommand: r.ffmpegCommand, meta: r.meta };
      } finally {
        client.dispose();
      }
    };
  },
};
