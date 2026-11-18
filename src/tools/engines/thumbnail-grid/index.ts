/**
 * Contact sheet (feature H2): N×M frames at even intervals on one image, with timestamps and a
 * header of file facts. Each frame is decoded with WebCodecs through a mediabunny CanvasSink at the
 * tile's size (the decoder output is scaled once, rotation applied), drawn by the shared layout
 * (./layout) on an OffscreenCanvas and encoded once as JPG, PNG or WebP. Runs in the engine worker.
 */
import { CanvasSink } from "mediabunny";
import { baseName, formatBytes, formatDimensions, shellQuote } from "@/lib/format";
import { GEIST_FONTS, loadFontFile } from "@/tools/workers/assets";
import { codecName } from "../convert-video/plan";
import { classifyError, EngineError } from "../errors";
import { ffmpegQscale } from "../frame-extract/math";
import { openInput, pictureDecodes } from "../mediabunny/shared";
import { loadWorkerFonts } from "../overlay/text";
import type { Engine } from "../types";
import {
  drawSheet,
  formatLabel,
  formatMime,
  sheetHeader,
  sheetLayout,
  sheetName,
  ThumbnailGridOptions,
  tileTimes,
  tooLarge,
} from "./layout";

export { ThumbnailGridOptions };

const noVideo = () =>
  new EngineError(
    "unsupported-input",
    "This file has no video track to take frames from.",
    "Choose a video file.",
  );

/** The equivalent ffmpeg filter chain: N evenly spaced frames, scaled, tiled, with timestamps. */
export function sheetCommand(
  name: string,
  out: string,
  o: ThumbnailGridOptions,
  durationSec: number,
  tileWidth: number,
): string {
  const n = o.columns * o.rows;
  const rate = durationSec > 0 ? (n / durationSec).toPrecision(4) : "1";
  const label = o.timestamps
    ? ",drawtext=text='%{pts\\:hms}':x=w-tw-8:y=h-th-8:fontcolor=white:box=1:boxcolor=black@0.6"
    : "";
  const q = o.format === "jpg" ? ` -q:v ${ffmpegQscale(o.quality)}` : "";
  return `ffmpeg -i ${shellQuote(name)} -vf "fps=${rate},scale=${tileWidth}:-2${label},tile=${o.columns}x${o.rows}" -frames:v 1${q} ${shellQuote(out)}`;
}

export const thumbnailGridEngine: Engine<ThumbnailGridOptions> = {
  id: "thumbnail-grid",
  backends: ["webcodecs"],
  optionsSchema: ThumbnailGridOptions,
  async supports(backend, input) {
    return (
      backend === "webcodecs" &&
      typeof VideoDecoder !== "undefined" &&
      typeof OffscreenCanvas !== "undefined" &&
      !!input.info?.video &&
      pictureDecodes(input.info)
    );
  },
  async run(_backend, inputs, o, ctx) {
    const input = inputs[0];
    const info = input?.info;
    const v = info?.video;
    if (!input || !info || !v) throw noVideo();
    const layout = sheetLayout(o, v);
    if (tooLarge(layout))
      throw new EngineError(
        "resource",
        `A ${formatDimensions(layout.width, layout.height)} sheet is larger than a browser can draw.`,
        "Choose fewer rows or a narrower sheet.",
      );
    const count = o.columns * o.rows;
    const times = tileTimes(count, info.durationSec);
    const tile = layout.tiles[0] ?? { width: 16, height: 9 };

    ctx.onProgress({ phase: "loading", ratio: 0, detail: "Loading the label font" });
    // The font is a nicety: without it the system sans draws the labels.
    const fonts = await Promise.all(
      GEIST_FONTS.filter((f) => f.style === "normal").map(async (f) => ({
        bytes: await loadFontFile(f.file),
        weight: f.weight,
        style: f.style,
      })),
    ).catch(() => []);
    await loadWorkerFonts(fonts);

    ctx.onProgress({ phase: "analyzing", ratio: 0, detail: "Reading the file" });
    const media = openInput(input.file);
    try {
      const track = await media.getPrimaryVideoTrack();
      if (!track) throw noVideo();
      if (!(await track.canDecode()))
        throw new EngineError(
          "unsupported-input",
          "This file uses a codec your browser cannot decode.",
          "Convert it to MP4 first, or try desktop Chrome.",
        );
      const sink = new CanvasSink(track, { width: tile.width, height: tile.height, fit: "fill" });
      const first = await track.getFirstTimestamp();
      const frames: OffscreenCanvas[] = [];
      let i = 0;
      // Page times run from the file's start; the source's own clock may not (MPEG-TS: 1.4 s).
      const t0 = info.startSec ?? 0;
      for await (const wrapped of sink.canvasesAtTimestamps(
        times.map((t) => Math.max(t + t0, first)),
      )) {
        if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
        let canvas = wrapped?.canvas as OffscreenCanvas | undefined;
        if (!canvas) canvas = (await sink.getCanvas(first))?.canvas as OffscreenCanvas | undefined;
        // The sink reuses nothing (no pool), but copy anyway: the sheet is drawn once all are in.
        const copy = new OffscreenCanvas(tile.width, tile.height);
        if (canvas) copy.getContext("2d")?.drawImage(canvas, 0, 0);
        frames.push(copy);
        i++;
        ctx.onProgress({
          phase: "processing",
          ratio: (i / count) * 0.95,
          detail: `Frame ${i.toLocaleString("en")} of ${count.toLocaleString("en")}`,
        });
      }
      ctx.onProgress({
        phase: "finishing",
        ratio: 0.96,
        detail: `Encoding ${formatLabel[o.format]}`,
      });
      const sheet = new OffscreenCanvas(layout.width, layout.height);
      const c = sheet.getContext("2d", { alpha: false });
      if (!c)
        throw new EngineError(
          "resource",
          "The browser could not create the sheet.",
          "Choose a smaller sheet.",
        );
      drawSheet(
        c,
        layout,
        o,
        frames,
        times,
        sheetHeader(input.file.name, info, codecName, formatBytes),
      );
      const blob = await sheet.convertToBlob({
        type: formatMime[o.format],
        quality: o.format === "png" ? undefined : o.quality / 100,
      });
      if (blob.type !== formatMime[o.format])
        throw new EngineError(
          "unsupported-output",
          `Your browser cannot encode ${formatLabel[o.format]} images.`,
          "Choose JPG or PNG instead.",
        );
      const filename = sheetName(baseName(input.file.name), o.format);
      return {
        blob,
        filename,
        ffmpegCommand: sheetCommand(input.file.name, filename, o, info.durationSec, tile.width),
        meta: `${o.columns}×${o.rows} frames · ${formatDimensions(layout.width, layout.height)} · ${formatLabel[o.format]}`,
      };
    } catch (e) {
      if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
      throw classifyError(e);
    } finally {
      media.dispose();
    }
  },
};
