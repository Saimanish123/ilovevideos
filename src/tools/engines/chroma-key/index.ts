/**
 * Green screen (feature G12): keys the screen out of a foreground video and lays it over a colour,
 * a picture or another video, in WebGL (./render, the same keyer the page previews with) inside the
 * shared composite (../overlay/composite `stage`); the picture is encoded once to H.264 and the
 * foreground's sound copied where the container allows, or left out. A background video is read in
 * step (../overlay/follow) and loops or holds its last frame. Runs in the engine worker; no network
 * access.
 */
import { EngineError } from "../errors";
import { pictureDecodes } from "../mediabunny/shared";
import { compositeSupported, runComposite } from "../overlay/composite";
import { FrameFollower } from "../overlay/follow";
import { hasWebgl2 } from "../overlay/gl";
import type { Engine } from "../types";
import { drawBackground } from "./background";
import { backgroundTime, ChromaKeyOptions, keyCommand } from "./options";
import { createKeyRenderer } from "./render";

export { ChromaKeyOptions };

const noGl = () =>
  new EngineError(
    "unsupported-output",
    "This browser cannot draw video frames with WebGL 2 in the background.",
    "Try desktop Chrome, Edge or Firefox, or Safari 17 or newer.",
  );

export const chromaKeyEngine: Engine<ChromaKeyOptions> = {
  id: "chroma-key",
  backends: ["webcodecs"],
  optionsSchema: ChromaKeyOptions,
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
        "This file has no video track to key.",
        "Choose a video file.",
      );
    if (!hasWebgl2()) throw noGl();
    const bg = o.background;
    let follower: FrameFollower | undefined;
    let still: ImageBitmap | undefined;
    if (bg.kind === "image") {
      try {
        still = await createImageBitmap(bg.blob);
      } catch {
        throw new EngineError(
          "unsupported-input",
          `${bg.name} could not be read as a picture.`,
          "Use a PNG, JPEG or WebP background.",
        );
      }
    } else if (bg.kind === "video") {
      follower = new FrameFollower(bg.blob, bg.name);
      if (!(await follower.open())) {
        await follower.dispose();
        throw new EngineError(
          "unsupported-input",
          `${bg.name} has no picture this browser can decode.`,
          "Use an MP4 or WebM background video, or convert it to MP4 first.",
        );
      }
    }
    const frameSec = 1 / (v.fps > 0 ? v.fps : 30);
    try {
      return await runComposite({
        file: input.file,
        info,
        copySound: true,
        sound: o.sound === "none" ? "none" : "source",
        suffix: "keyed",
        stage: ({ output }) => {
          const canvas = new OffscreenCanvas(output.width, output.height);
          const keyer = createKeyRenderer(canvas, output, 1);
          if (!keyer) throw noGl();
          const back = new OffscreenCanvas(output.width, output.height);
          const b2d = back.getContext("2d", { alpha: false });
          if (!b2d)
            throw new EngineError("internal", "Could not draw the background.", "Try again.");
          // The background is placed on the full picture, as on the page; an odd edge falls off.
          const frame = { width: v.width, height: v.height };
          let drawn = false;
          return {
            async render(sample, t, drawSize) {
              let changed = false;
              if (bg.kind === "video" && follower) {
                const s = await follower.frameAt(
                  backgroundTime(t, bg.durationSec, o.bgEnd, frameSec),
                );
                if (s) {
                  drawBackground(b2d, frame, o, {
                    width: s.displayWidth,
                    height: s.displayHeight,
                    draw: (c, x, y, w, h) => s.draw(c, x, y, w, h),
                  });
                  changed = true;
                }
              } else if (!drawn) {
                drawBackground(
                  b2d,
                  frame,
                  o,
                  still
                    ? {
                        width: still.width,
                        height: still.height,
                        draw: (c, x, y, w, h) => c.drawImage(still as ImageBitmap, x, y, w, h),
                      }
                    : undefined,
                );
                changed = true;
              }
              drawn = true;
              keyer.render(sample.toCanvasImageSource(), drawSize, back, o, changed);
              return canvas;
            },
            dispose: () => keyer.dispose(),
          };
        },
        ffmpegCommand: ({ outputName, kbps, copyAudio }) =>
          keyCommand(
            o,
            input.file.name,
            outputName,
            v,
            info.durationSec,
            kbps,
            !info.audio?.length || o.sound === "none" ? "none" : copyAudio ? "copy" : "aac",
          ),
        ctx,
      });
    } finally {
      still?.close();
      await follower?.dispose();
    }
  },
};
