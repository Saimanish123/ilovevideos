/**
 * Images to video (feature B8): a slideshow of the pictures in the order the user set, each for a
 * set time, with crossfades and an optional slow zoom, over optional music, as an H.264 MP4 at
 * 30 fps. Each picture is decoded once (createImageBitmap), laid into the frame (fit on a blurred
 * copy, on black, or cropped to fill; ../audio-to-video/draw) and kept as one frame-sized canvas
 * while it is on screen; frames are drawn from those on an OffscreenCanvas and encoded with
 * WebCodecs through the shared writer (../audio-to-video/mux), which also copies or encodes the
 * music. Runs in the engine worker; no network.
 */
import { canEncodeAudio } from "mediabunny";
import { formatDimensions, formatDuration, withUnit } from "@/lib/format";
import { blurredBackdrop, drawFitted, makeCanvas } from "../audio-to-video/draw";
import { writeVideo } from "../audio-to-video/mux";
import { geometryBitrate } from "../crop/plan";
import { EngineError } from "../errors";
import { canEncodeAvc } from "../mediabunny/shared";
import type { Engine, MediaInput } from "../types";
import {
  fadeOf,
  frameAt,
  ImagesToVideoOptions,
  MAX_IMAGES,
  MUSIC_FADE_SEC,
  perImage,
  SLIDE_FPS,
  slideSize,
  slideshowCommand,
  zoomAt,
} from "./plan";

export { ImagesToVideoOptions };

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;

const firstSize = (inputs: MediaInput[]) => {
  const v = inputs[0]?.info?.video;
  return v ? { width: v.width, height: v.height } : undefined;
};

export const imagesToVideoEngine: Engine<ImagesToVideoOptions> = {
  id: "images-to-video",
  backends: ["webcodecs"],
  optionsSchema: ImagesToVideoOptions,
  async supports(backend, _input, o, inputs = []) {
    if (backend !== "webcodecs" || typeof OffscreenCanvas === "undefined") return false;
    if (typeof createImageBitmap === "undefined") return false;
    const size = slideSize(o.shape, firstSize(inputs));
    if (!(await canEncodeAvc(size.width, size.height))) return false;
    return !o.music || canEncodeAudio("aac", { bitrate: 192_000 });
  },
  async run(_backend, inputs, o, ctx) {
    const n = inputs.length;
    if (n === 0) throw new EngineError("internal", "No pictures were given.", "Add images.");
    if (n > MAX_IMAGES)
      throw new EngineError(
        "resource",
        `That is ${n} pictures; one slideshow takes at most ${MAX_IMAGES}.`,
        "Split them into two slideshows.",
      );
    const size = slideSize(o.shape, firstSize(inputs));
    const d = perImage(o, n);
    const x = fadeOf(o, d);
    const total = n * d;

    // One composed frame per picture on screen; at most two are kept (the fading pair).
    const composed = new Map<number, AnyCanvas>();
    const compose = async (i: number): Promise<AnyCanvas> => {
      const hit = composed.get(i);
      if (hit) return hit;
      const input = inputs[i];
      if (!input) throw new EngineError("internal", "A picture is missing.", "Start over.");
      let bitmap: ImageBitmap;
      try {
        bitmap = await createImageBitmap(input.file);
      } catch {
        throw new EngineError(
          "unsupported-input",
          `${input.file.name} could not be decoded in this browser.`,
          "Save it as JPEG or PNG, or remove it from the list.",
        );
      }
      const canvas = makeCanvas(size.width, size.height);
      const c = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D | null;
      if (!c)
        throw new EngineError("resource", "The browser could not draw the picture.", "Try again.");
      const src = { width: bitmap.width, height: bitmap.height };
      drawFitted(
        c,
        bitmap,
        src,
        { x: 0, y: 0, ...size },
        o.fit,
        o.fit === "blur" ? blurredBackdrop(bitmap, src, size) : undefined,
      );
      bitmap.close();
      for (const k of composed.keys()) if (k < i - 1) composed.delete(k);
      composed.set(i, canvas);
      return canvas;
    };

    const paint = (
      c: OffscreenCanvasRenderingContext2D,
      img: AnyCanvas,
      index: number,
      progress: number,
      alpha = 1,
    ) => {
      c.globalAlpha = alpha;
      if (o.motion) {
        const z = zoomAt(index, progress);
        const w = size.width * z;
        const h = size.height * z;
        c.drawImage(img, (size.width - w) / 2, (size.height - h) / 2, w, h);
      } else c.drawImage(img, 0, 0);
      c.globalAlpha = 1;
    };

    let lastKey = "";
    const music = o.music;
    const r = await writeVideo(
      {
        ...size,
        fps: SLIDE_FPS,
        durationSec: total,
        keyFrameInterval: 2,
        bitrate: geometryBitrate(size, SLIDE_FPS),
        draw: async (c, t) => {
          const f = frameAt(t, n, d, x);
          // Without motion or a fade, a frame repeats the one before: nothing to draw.
          const key = `${f.base}|${f.top ? f.top.alpha.toFixed(4) : ""}`;
          if (!o.motion && key === lastKey) return false;
          lastKey = key;
          paint(c, await compose(f.base), f.base, f.baseProgress);
          if (f.top) paint(c, await compose(f.top.index), f.top.index, f.top.progress, f.top.alpha);
          return true;
        },
      },
      music
        ? {
            file: new File([music.blob], music.name),
            endSec: total,
            fadeOutSec: music.durationSec > total + 0.05 ? MUSIC_FADE_SEC : 0,
          }
        : undefined,
      ctx,
    );
    const names = inputs.map((i) => i.file.name);
    const out = "slideshow.mp4";
    const sound = !music
      ? "no sound"
      : r.soundCopied
        ? "music copied"
        : music.durationSec > total + 0.05
          ? "music cut and faded out"
          : "music in AAC";
    return {
      blob: r.blob,
      filename: out,
      ffmpegCommand: slideshowCommand(names, o, size, out),
      meta: `${withUnit(n, n === 1 ? "picture" : "pictures")} · ${formatDuration(total)} · ${formatDimensions(size.width, size.height)} · ${sound}`,
    };
  },
};
