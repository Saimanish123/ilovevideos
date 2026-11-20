/**
 * Blur part of a video (feature G3): rectangles and ellipses drawn on the picture, still or
 * following a subject through key frames, each shown for its own time range, blurred, pixelated or
 * covered (or everything but them, inverted). The frame is drawn in WebGL (./render, the same
 * renderer the preview uses) inside the shared composite (../overlay/composite `stage`), then
 * encoded once to H.264; the sound is copied where the container allows. Files only ffmpeg reads
 * are refused on the page with a way to convert them first (the region graph has no ffmpeg.wasm
 * path). Runs in the engine worker; no network access.
 */
import { withEvenCropOut } from "../crop/math";
import { EngineError } from "../errors";
import { pictureDecodes } from "../mediabunny/shared";
import { compositeSupported, runComposite } from "../overlay/composite";
import { hasWebgl2 } from "../overlay/gl";
import type { Engine } from "../types";
import { BlurRegionOptions, blurCommand, blurGraph, MAX_REGIONS, placeAll } from "./options";
import { createBlurRenderer } from "./render";

export { BlurRegionOptions };

export const blurRegionEngine: Engine<BlurRegionOptions> = {
  id: "blur-region",
  backends: ["webcodecs"],
  optionsSchema: BlurRegionOptions,
  async supports(backend, input) {
    return (
      backend === "webcodecs" &&
      pictureDecodes(input.info) &&
      hasWebgl2() &&
      compositeSupported(input.info)
    );
  },
  async run(_backend, inputs, o, ctx) {
    const input = inputs[0];
    const info = input?.info;
    const v = info?.video;
    if (!input || !info || !v)
      throw new EngineError(
        "unsupported-input",
        "This file has no video track to blur.",
        "Choose a video file.",
      );
    if (o.regions.length === 0)
      throw new EngineError(
        "internal",
        "There is no region to blur yet.",
        "Draw a region on the picture, then try again.",
      );
    if (!hasWebgl2())
      throw new EngineError(
        "unsupported-output",
        "This browser cannot draw this effect on the video.",
        "Try desktop Chrome, Edge or Firefox, or Safari 17 or newer.",
      );
    const regions = o.regions.slice(0, MAX_REGIONS);
    return runComposite({
      file: input.file,
      info,
      copySound: true,
      suffix: "blurred",
      stage: ({ source, output }) => {
        const canvas = new OffscreenCanvas(output.width, output.height);
        const renderer = createBlurRenderer(canvas, output, 1);
        if (!renderer)
          throw new EngineError(
            "unsupported-output",
            "This browser cannot draw this effect on the video.",
            "Try desktop Chrome, Edge or Firefox, or Safari 17 or newer.",
          );
        return {
          render(frame, t, drawSize) {
            const image = frame.toCanvasImageSource();
            renderer.render(image, drawSize, placeAll({ regions }, t, source), o);
            return canvas;
          },
          dispose: () => renderer.dispose(),
        };
      },
      ffmpegCommand: ({ outputName, kbps, copyAudio }) =>
        blurCommand(
          input.file.name,
          outputName,
          withEvenCropOut(v, blurGraph({ ...o, regions }, v, info.durationSec)),
          kbps,
          !info.audio?.length ? "none" : copyAudio ? "copy" : "aac",
        ),
      ctx,
    });
  },
};
