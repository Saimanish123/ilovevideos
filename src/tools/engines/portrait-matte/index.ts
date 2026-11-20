/**
 * Background without a green screen (feature G14, ADR-0118 to ADR-0122): finds the person in every
 * frame with a small on-device model (./segmenter, loaded from this origin when the run starts),
 * steadies and refines the mask (./masks, ./smooth, ./render) and blurs or replaces the background
 * in WebGL inside the shared composite (../overlay/composite `stage`). The picture is encoded once to
 * H.264; the sound is copied where the container allows. Output "mask" writes the person mask itself
 * (white on black, no sound) for a video editor. Runs in the engine worker; no network access
 * beyond the model files under /models/.
 */
import { drawBackground } from "../chroma-key/background";
import { backgroundTime } from "../chroma-key/options";
import { EngineError } from "../errors";
import { openInput, pictureDecodes } from "../mediabunny/shared";
import { compositeSupported, runComposite } from "../overlay/composite";
import { FrameFollower } from "../overlay/follow";
import { hasWebgl2 } from "../overlay/gl";
import type { Engine } from "../types";
import { MaskStream } from "./masks";
import { type ModelKind, matteCommand, modelFor, PortraitMatteOptions } from "./options";
import { createMatteRenderer } from "./render";
import { createWorkerSegmenter, type Segmenter } from "./segmenter";
import { toBytes } from "./smooth";

export { PortraitMatteOptions };

const noGl = () =>
  new EngineError(
    "unsupported-output",
    "This browser cannot find the person in a video.",
    "Try a current Chrome or Edge.",
  );

/**
 * The finder stays loaded in this worker between runs on the page (its first run compiles the
 * shaders, about a second); a video of the other shape swaps the model.
 */
let kept: { kind: ModelKind; segmenter: Promise<Segmenter> } | undefined;
function segmenterFor(kind: ModelKind): Promise<Segmenter> {
  if (kept?.kind === kind) return kept.segmenter;
  void kept?.segmenter.then((s) => s.dispose()).catch(() => undefined);
  const segmenter = createWorkerSegmenter(kind);
  kept = { kind, segmenter };
  segmenter.catch(() => {
    if (kept?.segmenter === segmenter) kept = undefined;
  });
  return segmenter;
}

function dropKept() {
  const k = kept;
  kept = undefined;
  void k?.segmenter.then((s) => s.dispose()).catch(() => undefined);
}

export const portraitMatteEngine: Engine<PortraitMatteOptions> = {
  id: "portrait-matte",
  backends: ["webcodecs"],
  optionsSchema: PortraitMatteOptions,
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
        "This file has no video track.",
        "Choose a video with a person in it.",
      );
    if (!hasWebgl2()) throw noGl();
    const mask = o.output === "mask";
    const replace = !mask && (o.effect === "image" || o.effect === "video" || o.effect === "color");
    const bg = replace && o.effect !== "color" ? o.background : { kind: "color" as const };
    if (
      (o.effect === "image" && bg.kind !== "image") ||
      (o.effect === "video" && bg.kind !== "video")
    )
      throw new EngineError(
        "unsupported-input",
        "No background file was chosen.",
        "Choose a background picture or video, or pick Blur or Colour.",
      );

    ctx.onProgress({ phase: "loading", ratio: 0, detail: "Loading the person finder" });
    let segmenter: Segmenter;
    const loading = segmenterFor(modelFor(v.width, v.height));
    try {
      // Cancel answers at once; a finder that arrives later is freed.
      segmenter = await new Promise<Segmenter>((resolve, reject) => {
        const abort = () => reject(new EngineError("cancelled", "Cancelled."));
        if (ctx.signal.aborted) abort();
        ctx.signal.addEventListener("abort", abort, { once: true });
        loading.then(resolve, reject).finally(() => ctx.signal.removeEventListener("abort", abort));
      });
    } catch {
      if (ctx.signal.aborted) {
        // Still loading: stop its worker now rather than let it finish for nothing.
        dropKept();
        throw new EngineError("cancelled", "Cancelled.");
      }
      throw new EngineError(
        "unsupported-output",
        "The person finder could not start in this browser.",
        "Reload the page and try again, or try desktop Chrome or Edge.",
      );
    }
    let follower: FrameFollower | undefined;
    let still: ImageBitmap | undefined;
    const source = openInput(input.file);
    let masks: MaskStream | undefined;
    try {
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
        if (!(await follower.open()))
          throw new EngineError(
            "unsupported-input",
            `${bg.name} has no picture this browser can decode.`,
            "Use an MP4 or WebM background video, or convert it to MP4 first.",
          );
      }
      const track = (await source.getPrimaryVideoTrack()) ?? undefined;
      masks = new MaskStream(segmenter, track, { steady: o.steady, lookahead: o.lookahead });
      const stream = masks;
      const frameSec = 1 / (v.fps > 0 ? v.fps : 30);
      const startSec = info.startSec ?? 0;
      const bytes = new Uint8Array(segmenter.width * segmenter.height);
      return await runComposite({
        file: input.file,
        info,
        copySound: true,
        sound: o.sound === "none" || mask ? "none" : "source",
        suffix: mask ? "mask" : o.effect === "blur" ? "blurred" : "background",
        stage: ({ output }) => {
          const canvas = new OffscreenCanvas(output.width, output.height);
          const renderer = createMatteRenderer(canvas, output, 1);
          if (!renderer) throw noGl();
          const back = new OffscreenCanvas(output.width, output.height);
          const b2d = back.getContext("2d", { alpha: false });
          if (!b2d)
            throw new EngineError("internal", "Could not draw the background.", "Try again.");
          const frame = { width: v.width, height: v.height };
          const look = { color: o.color, fit: o.fit };
          let drawn = false;
          return {
            async render(sample, t, drawSize) {
              const m = await stream.maskAt(t + startSec, sample, frameSec);
              let changed = false;
              if (replace) {
                if (bg.kind === "video" && follower) {
                  const s = await follower.frameAt(
                    backgroundTime(t, bg.durationSec, o.bgEnd, frameSec),
                  );
                  if (s) {
                    drawBackground(b2d, frame, look, {
                      width: s.displayWidth,
                      height: s.displayHeight,
                      draw: (c, x, y, w, h) => s.draw(c, x, y, w, h),
                    });
                    changed = true;
                  }
                } else if (!drawn) {
                  const img = still;
                  drawBackground(
                    b2d,
                    frame,
                    look,
                    img
                      ? {
                          width: img.width,
                          height: img.height,
                          draw: (c, x, y, w, h) => c.drawImage(img, x, y, w, h),
                        }
                      : undefined,
                  );
                  changed = true;
                }
                drawn = true;
              }
              renderer.render(
                sample.toCanvasImageSource(),
                drawSize,
                { data: toBytes(m, bytes), width: segmenter.width, height: segmenter.height },
                replace ? back : null,
                o,
                changed,
              );
              return canvas;
            },
            dispose: () => renderer.dispose(),
          };
        },
        ffmpegCommand: ({ outputName, kbps, copyAudio, soundCodec }) =>
          matteCommand(
            o,
            input.file.name,
            outputName,
            v,
            info.durationSec,
            kbps,
            !info.audio?.length || o.sound === "none" || mask
              ? "none"
              : copyAudio
                ? "copy"
                : soundCodec,
          ),
        ctx,
      });
    } finally {
      still?.close();
      await follower?.dispose();
      await masks?.dispose();
      source.dispose();
    }
  },
};
