/**
 * Progress bar and timer on the picture (feature G8), the worker half: drawn over every frame by
 * the shared 2D composite (../overlay/composite `layer`, page time), then the picture is encoded
 * once to H.264; the sound is copied packet for packet where the container allows. The timer's
 * digits are drawn with the bundled Geist Bold (the font the page's preview uses), the bar is a
 * rectangle with an anti-aliased end. Runs in the engine worker; no network access apart from our
 * own font file.
 */
import { GEIST_FONTS, loadFontFile } from "@/tools/workers/assets";
import { EngineError } from "../errors";
import { pictureDecodes } from "../mediabunny/shared";
import { compositeSupported, runComposite } from "../overlay/composite";
import { loadWorkerFonts } from "../overlay/text";
import type { Engine } from "../types";
import { drawBar, drawTimer } from "./draw";
import {
  barProgress,
  barRect,
  frameSec,
  showsAt,
  TimeOverlayOptions,
  timeCommand,
  timeRange,
  timerAlign,
  timerPx,
  timerRect,
  timerText,
} from "./options";

export { TimeOverlayOptions };

const WORKER_FAMILY = 'Geist, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export const timeOverlayEngine: Engine<TimeOverlayOptions> = {
  id: "time-overlay",
  backends: ["webcodecs"],
  optionsSchema: TimeOverlayOptions,
  async supports(backend, input) {
    return backend === "webcodecs" && pictureDecodes(input.info) && compositeSupported(input.info);
  },
  async run(_backend, inputs, o, ctx) {
    const input = inputs[0];
    const info = input?.info;
    const v = info?.video;
    if (!input || !info || !v)
      throw new EngineError(
        "unsupported-input",
        `This file has no video track to put a ${o.kind === "progress" ? "progress bar" : "timer"} on.`,
        "Choose a video file.",
      );
    const range = timeRange(o, info.durationSec);
    const frame = frameSec(v.fps);
    if (o.kind === "timer") {
      ctx.onProgress({ phase: "loading", ratio: 0, detail: "Loading the timer font" });
      // Geist Bold for the digits; without it the system sans draws them in the same cells.
      const bold = GEIST_FONTS.find((f) => f.weight === "700" && f.style === "normal");
      const fonts = bold
        ? await loadFontFile(bold.file)
            .then((bytes) => [{ bytes, weight: bold.weight, style: bold.style }])
            .catch(() => [])
        : [];
      await loadWorkerFonts(fonts);
    }
    const audio = !info.audio?.length ? "none" : undefined;
    return runComposite({
      file: input.file,
      info,
      pageTime: true,
      copySound: true,
      suffix: o.kind === "progress" ? "progress-bar" : "timer",
      what:
        o.kind === "progress" ? `bar along the ${o.edge}` : `counting ${o.direction}, ${o.format}`,
      layer: (size) => {
        if (o.kind === "progress") {
          const rect = barRect(o, size);
          return {
            draw: (c2d, t) => {
              if (!showsAt(range, t)) return;
              drawBar(c2d, rect, barProgress(range, frame, t), o.color, o.track);
            },
          };
        }
        const rect = timerRect(o, range, frame, size);
        const px = timerPx(o, size);
        const look = { color: o.color, style: o.style, align: timerAlign(o) };
        return {
          draw: (c2d, t) => {
            if (!showsAt(range, t)) return;
            drawTimer(c2d, timerText(o, range, frame, t), rect, px, look, WORKER_FAMILY);
          },
        };
      },
      ffmpegCommand: ({ outputName, kbps, copyAudio }) =>
        timeCommand(
          o,
          { name: input.file.name, durationSec: info.durationSec, fps: v.fps, video: v },
          outputName,
          kbps,
          audio ?? (copyAudio ? "copy" : "aac"),
        ),
      ctx,
    });
  },
};
