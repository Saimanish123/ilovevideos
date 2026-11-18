/**
 * Add text to video (feature F6): a title or caption drawn over the picture where the user placed
 * it, for the time chosen on the timeline, fading in and out. Built on the overlay engine: the page
 * draws the text as a PNG (./raster), and the WebCodecs composite (../overlay/composite) paints it
 * over every frame with the opacity from ../overlay/fade, then encodes H.264 once; the sound is
 * copied when the container allows. Containers only ffmpeg reads go through ./ffmpeg on the page.
 */
import { EngineError } from "../errors";
import { compositeSupported, runComposite } from "../overlay/composite";
import { fadeAlpha } from "../overlay/fade";
import type { Engine } from "../types";
import { placeName } from "../watermark/options";
import { needText, TextOverlayOptions, textCommand, textRange, textRect } from "./options";

export { TextOverlayOptions };

export const textOverlayEngine: Engine<TextOverlayOptions> = {
  id: "text-overlay",
  backends: ["webcodecs", "ffmpeg-wasm"],
  optionsSchema: TextOverlayOptions,
  async supports(backend, input) {
    return backend === "webcodecs" && compositeSupported(input.info);
  },
  async run(_backend, inputs, o, ctx) {
    const input = inputs[0];
    const info = input?.info;
    const v = info?.video;
    if (!input || !info || !v)
      throw new EngineError(
        "unsupported-input",
        "This file has no video track to put text on.",
        "Choose a video file.",
      );
    const mark = needText(o);
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(mark);
    } catch {
      throw new EngineError("internal", "The text could not be drawn.", "Try again.");
    }
    const range = textRange(o, info.durationSec);
    const block = { width: o.markWidth ?? bitmap.width, height: o.markHeight ?? bitmap.height };
    try {
      return await runComposite({
        file: input.file,
        info,
        layer: (size) => {
          const rect = textRect(o, block, size);
          return {
            draw: (c2d, t) => {
              const a = fadeAlpha(range, o.fade, t);
              if (a <= 0) return;
              c2d.globalAlpha = a;
              c2d.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height);
              c2d.globalAlpha = 1;
            },
          };
        },
        suffix: "text",
        copySound: true,
        what: `text ${placeName(o)}`,
        ffmpegCommand: ({ outputName, kbps, copyAudio }) =>
          textCommand(
            input.file.name,
            outputName,
            textRect(o, block, v),
            o,
            info.durationSec,
            kbps,
            copyAudio,
            v,
          ),
        ctx,
      });
    } finally {
      bitmap.close();
    }
  },
};
