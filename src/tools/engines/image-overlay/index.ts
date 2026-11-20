/**
 * Add images to a video (feature G7): the layers from ./options drawn over every frame in the
 * shared 2D composite (../overlay/composite `layer`), then the picture encoded once to H.264; the
 * sound is copied where the container allows. Animated GIF, WebP and APNG layers are decoded frame
 * by frame with the browser's `ImageDecoder` (in this worker) and loop from the moment they appear;
 * where there is no `ImageDecoder` their first frame is used, which the page says before the run.
 * Every frame is decoded once, at the size it is drawn, under a memory budget. Runs in the engine
 * worker; no network access.
 */
import { withEvenCropOut } from "../crop/math";
import { classifyError, EngineError } from "../errors";
import { pictureDecodes } from "../mediabunny/shared";
import { compositeSupported, runComposite } from "../overlay/composite";
import type { Engine } from "../types";
import {
  frameAt,
  frameEnds,
  type ImageLayer,
  ImageOverlayOptions,
  layerRect,
  MAX_LAYERS,
  overlayCommand,
  overlayGraph,
  type Size,
  showsAt,
} from "./options";

export { ImageOverlayOptions };

/** Decoded frames held at once across all layers, in bytes (RGBA at the drawn size). */
const FRAME_BUDGET = 512 * 1024 * 1024;

interface Decoded {
  layer: ImageLayer;
  frames: ImageBitmap[];
  /** Cumulative end time of each frame (seconds). */
  ends: number[];
}

const canDecodeAnimation = async (type: string) => {
  if (typeof ImageDecoder === "undefined") return false;
  try {
    return await ImageDecoder.isTypeSupported(type);
  } catch {
    return false;
  }
};

/** Every frame of one layer, decoded at `size`, or its single picture. */
async function decodeLayer(
  layer: ImageLayer,
  size: Size,
  maxFrames: number,
  signal: AbortSignal,
): Promise<Decoded> {
  const resize = {
    resizeWidth: Math.max(1, Math.round(size.width)),
    resizeHeight: Math.max(1, Math.round(size.height)),
    resizeQuality: "high" as const,
  };
  if (layer.animated && (await canDecodeAnimation(layer.type))) {
    const decoder = new ImageDecoder({ data: layer.blob.stream(), type: layer.type });
    try {
      await decoder.tracks.ready;
      await decoder.completed;
      const count = Math.min(maxFrames, decoder.tracks.selectedTrack?.frameCount ?? 1);
      const frames: ImageBitmap[] = [];
      const delays: number[] = [];
      for (let i = 0; i < count; i++) {
        if (signal.aborted) throw new EngineError("cancelled", "Cancelled.");
        const { image } = await decoder.decode({ frameIndex: i, completeFramesOnly: true });
        try {
          frames.push(await createImageBitmap(image, resize));
          delays.push((image.duration ?? 100_000) / 1e6);
        } finally {
          image.close();
        }
      }
      return { layer, frames, ends: frameEnds(delays) };
    } finally {
      decoder.close();
    }
  }
  const one = await createImageBitmap(layer.blob, resize);
  return { layer, frames: [one], ends: [1] };
}

/** How many frames a layer's file holds (1 for a still, or where animation cannot be decoded). */
async function frameCount(layer: ImageLayer): Promise<number> {
  if (!layer.animated || !(await canDecodeAnimation(layer.type))) return 1;
  const decoder = new ImageDecoder({ data: layer.blob.stream(), type: layer.type });
  try {
    await decoder.tracks.ready;
    return Math.max(1, decoder.tracks.selectedTrack?.frameCount ?? 1);
  } finally {
    decoder.close();
  }
}

export const imageOverlayEngine: Engine<ImageOverlayOptions> = {
  id: "image-overlay",
  backends: ["webcodecs"],
  optionsSchema: ImageOverlayOptions,
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
        "This file has no video track to put an image on.",
        "Choose a video file.",
      );
    const layers = o.layers.slice(0, MAX_LAYERS);
    if (layers.length === 0)
      throw new EngineError("internal", "No image was added.", "Add an image, then try again.");
    const src = { width: v.width, height: v.height };
    let decoded: Decoded[] = [];
    const free = () => {
      for (const d of decoded) for (const f of d.frames) f.close();
      decoded = [];
    };
    try {
      ctx.onProgress({ phase: "loading", ratio: 0, detail: "Reading the images" });
      // Sizes as drawn, scaled down together if every frame of every layer would not fit the budget.
      const counts = await Promise.all(layers.map(frameCount));
      const rects = layers.map((l) => layerRect(l, src));
      const bytes = rects.reduce((s, r, i) => s + r.width * r.height * 4 * (counts[i] ?? 1), 0);
      const k = bytes > FRAME_BUDGET ? Math.sqrt(FRAME_BUDGET / bytes) : 1;
      for (const [i, l] of layers.entries()) {
        const r = rects[i] as (typeof rects)[number];
        try {
          decoded.push(
            await decodeLayer(
              l,
              { width: r.width * k, height: r.height * k },
              counts[i] ?? 1,
              ctx.signal,
            ),
          );
        } catch (e) {
          if (e instanceof EngineError) throw e;
          throw new EngineError(
            "unsupported-input",
            `${l.name} could not be read as an image.`,
            "Use a PNG, JPEG, WebP, GIF or SVG file.",
          );
        }
      }
    } catch (e) {
      free();
      if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
      throw e instanceof EngineError ? e : classifyError(e);
    }
    try {
      return await runComposite({
        file: input.file,
        info,
        copySound: true,
        pageTime: true,
        suffix: "with-image",
        layer: (size) => {
          const placed = decoded.map((d) => ({ d, rect: layerRect(d.layer, size) }));
          return {
            draw: (c2d, t) => {
              for (const { d, rect } of placed) {
                if (!showsAt(d.layer, t)) continue;
                const frame = d.frames[frameAt(d.ends, t - d.layer.start)] ?? d.frames[0];
                if (!frame) continue;
                c2d.save();
                c2d.translate(rect.x + rect.width / 2, rect.y + rect.height / 2);
                if (d.layer.rotation) c2d.rotate((d.layer.rotation * Math.PI) / 180);
                c2d.globalAlpha = d.layer.opacity;
                c2d.imageSmoothingQuality = "high";
                c2d.drawImage(frame, -rect.width / 2, -rect.height / 2, rect.width, rect.height);
                c2d.restore();
              }
            },
            dispose: free,
          };
        },
        ffmpegCommand: ({ outputName, kbps, copyAudio, soundCodec }) =>
          overlayCommand(
            input.file.name,
            { layers },
            withEvenCropOut(v, overlayGraph({ layers }, src, info.durationSec)),
            outputName,
            kbps,
            !info.audio?.length ? "none" : copyAudio ? "copy" : soundCodec,
          ),
        ctx,
      });
    } finally {
      free();
    }
  },
};
