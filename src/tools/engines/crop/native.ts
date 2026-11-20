/**
 * The WebCodecs path shared by the crop and aspect-ratio engines. Both are one re-encode of the
 * picture: a crop keeps a rectangle of the source (mediabunny's own `crop`, applied after any
 * rotation flag), a pad draws the scaled source onto a larger coloured frame (a canvas per frame).
 * The sound is copied when the output container can hold it, otherwise encoded to AAC (Opus, or
 * 16-bit PCM in MOV, where this browser has no AAC encoder; ../sound-codec).
 */
import { Quality, VideoSample } from "mediabunny";
import { baseName, formatDimensions } from "@/lib/format";
import { EngineError } from "../errors";
import { canEncodeAvc, convert } from "../mediabunny/shared";
import { withSourceSound } from "../overlay/composite";
import { soundEncoders, writtenSoundCodec } from "../sound-codec";
import type { EngineContext, EngineResult, MediaInfo } from "../types";
import { framePlan, oddSource, prepareFrame, withPreparedFrames } from "../video-filter/frame-prep";
import {
  BLUR_DIM,
  geometryCommand,
  innerCutsOddEdge,
  isHexColor,
  type PadColor,
  padFilter,
} from "./math";
import {
  audioCopied,
  cropPlanFilter,
  type GeometryPlan,
  geometryBitrate,
  geometryContainer,
  outputSize,
} from "./plan";
import { frameProgress, totalFrames } from "./progress";

export const PAD_RGB: Record<"black" | "white", string> = {
  black: "rgb(0 0 0)",
  white: "rgb(255 255 255)",
};

/** CSS colour for a solid pad fill (`blur` is drawn from the picture instead). */
export const padFill = (color: PadColor) =>
  color === "black" || color === "white"
    ? PAD_RGB[color]
    : isHexColor(color)
      ? color
      : PAD_RGB.black;

/**
 * The blurred background: the picture scaled to cover the frame at a sixteenth of its size, then
 * enlarged twice with smoothing (a cheap, even blur that every browser's canvas draws the same way),
 * then dimmed by BLUR_DIM. `small` and `mid` are scratch canvases reused across frames.
 */
export function drawBlurred(
  c2d: OffscreenCanvasRenderingContext2D,
  sample: VideoSample,
  width: number,
  height: number,
  scratch: { small?: OffscreenCanvas; mid?: OffscreenCanvas },
) {
  const sw = Math.max(2, Math.round(width / 16));
  const sh = Math.max(2, Math.round(height / 16));
  scratch.small ??= new OffscreenCanvas(sw, sh);
  scratch.mid ??= new OffscreenCanvas(
    Math.max(2, Math.round(width / 4)),
    Math.max(2, Math.round(height / 4)),
  );
  const s2d = scratch.small.getContext("2d", { alpha: false });
  const m2d = scratch.mid.getContext("2d", { alpha: false });
  if (!s2d || !m2d) throw new EngineError("internal", "Could not draw the frame.", "Try again.");
  const k = Math.max(sw / sample.displayWidth, sh / sample.displayHeight);
  const dw = sample.displayWidth * k;
  const dh = sample.displayHeight * k;
  s2d.imageSmoothingQuality = "high";
  sample.draw(s2d, (sw - dw) / 2, (sh - dh) / 2, dw, dh);
  m2d.imageSmoothingEnabled = true;
  m2d.imageSmoothingQuality = "high";
  m2d.drawImage(scratch.small, 0, 0, scratch.mid.width, scratch.mid.height);
  c2d.imageSmoothingEnabled = true;
  c2d.imageSmoothingQuality = "high";
  c2d.drawImage(scratch.mid, 0, 0, width, height);
  c2d.fillStyle = `rgb(0 0 0 / ${BLUR_DIM})`;
  c2d.fillRect(0, 0, width, height);
}

/**
 * Whether this browser can encode H.264 at all (a 640×360 probe). The exact output size is checked
 * in `runGeometry`, so a size the encoder refuses gets its own message rather than a generic one.
 */
export async function geometrySupported(_plan: GeometryPlan): Promise<boolean> {
  return canEncodeAvc(640, 360);
}

export async function runGeometry(
  file: File,
  info: MediaInfo,
  plan: GeometryPlan,
  suffix: string,
  ctx: EngineContext,
  /** Page-specific words: the result line's description, and the hint when the frame is too big. */
  labels?: { what?: string; tooBig?: string },
): Promise<EngineResult> {
  const v = info.video;
  if (!v) {
    throw new EngineError(
      "unsupported-input",
      "This file has no video track to reshape.",
      "Choose a video file.",
    );
  }
  const to = geometryContainer(file.name);
  const size = outputSize(plan);
  if (!(await canEncodeAvc(size.width, size.height))) {
    throw new EngineError(
      "unsupported-output",
      `This browser cannot write a ${formatDimensions(size.width, size.height)} H.264 video.`,
      labels?.tooBig ??
        (plan.kind === "pad"
          ? "Choose Crop to fill, or make the video smaller with compress video first."
          : "Make the frame smaller, or try desktop Chrome, Edge or Safari."),
    );
  }
  const bitrate = geometryBitrate(size, v.fps, v);
  const copyAudio = audioCopied(info, to);
  const outputName = `${baseName(file.name)}-${suffix}.${to}`;
  const src = { width: v.width, height: v.height };
  const filter =
    plan.kind === "crop" ? cropPlanFilter(plan) : padFilter(plan.layout, src, plan.color);
  const end = plan.end !== undefined && plan.end < info.durationSec ? plan.end : undefined;
  const trim = end !== undefined ? { start: 0, end } : undefined;
  // Where this browser has no AAC encoder (../sound-codec), sound the container holds is joined by
  // packet copy when the whole clip is kept (Conversion re-encodes AAC whose priming sits before
  // zero, and could not here); other sound, or a cut clip's, is encoded to Opus (16-bit PCM in MOV).
  const can = await soundEncoders();
  const joinSound = !can.aac && copyAudio && (info.audio?.length ?? 0) > 0 && !trim;
  // Without AAC a cut clip's sound is always encoded, in MKV too, so the ready line (`geometryEstimate`)
  // can say what is written; Conversion would otherwise copy or encode by the source's timestamps.
  const audio = joinSound
    ? { discard: true as const }
    : !can.aac
      ? { codec: writtenSoundCodec(to, can), forceTranscode: true }
      : to === "mkv"
        ? undefined
        : { codec: writtenSoundCodec(to, can) };
  const ffmpegCommand = geometryCommand(
    file.name,
    outputName,
    filter,
    Math.round(bitrate / 1000),
    copyAudio && (can.aac || !trim),
    end,
    writtenSoundCodec(to, can),
  );
  const withSound = async (r: EngineResult): Promise<EngineResult> =>
    joinSound ? { ...r, ...(await withSourceSound(file, r.blob, to, ctx)) } : r;
  const quality = new Quality({ bitrate, bitrateMode: "variable" });
  const what =
    labels?.what ??
    (plan.kind === "crop"
      ? "cropped"
      : plan.color === "blur"
        ? "blurred background added"
        : `${plan.color} bars added`);
  const meta = `${formatDimensions(v.width, v.height)} → ${formatDimensions(size.width, size.height)} · ${what} · re-encoded`;
  const job = {
    ...ctx,
    onProgress: frameProgress(ctx, totalFrames(end ?? info.durationSec, v.fps)),
  };

  if (plan.kind === "crop") {
    const { rect } = plan;
    const box = { left: rect.x, top: rect.y, width: rect.width, height: rect.height };
    // Without a scale the crop is a narrower visible rectangle over the decoded frame, tagged with
    // the source's colour space (../video-filter/frame-prep): no canvas, so the kept pixels and the
    // colours are the source's. A scale (platform size caps), or an odd source (which mediabunny
    // would redraw rounded up before `process`, see frame-prep), is drawn by mediabunny's crop.
    const plain = await framePlan(file, "avc");
    const frames = !plan.scale && plain && !oddSource(plain) ? plain : undefined;
    const result = await convert({
      file,
      to,
      outputName,
      video: frames
        ? {
            codec: "avc",
            quality,
            forceTranscode: true,
            processedWidth: rect.width,
            processedHeight: rect.height,
            process: (sample) => prepareFrame(sample, frames, box),
          }
        : {
            codec: "avc",
            quality,
            forceTranscode: true,
            crop: box,
            ...(plan.scale
              ? { width: plan.scale.width, height: plan.scale.height, fit: "fill" as const }
              : {}),
          },
      // The plan was made for frames decoded with this; mediabunny's crop draws with it too.
      decodeColorSpace: plain?.decodeColorSpace,
      audio,
      trim,
      ffmpegCommand,
      ctx: job,
    });
    return { ...(await withSound(result)), meta };
  }

  const { layout, color } = plan;
  const cut = innerCutsOddEdge(layout.inner, src);
  let canvas: OffscreenCanvas | undefined;
  let c2d: OffscreenCanvasRenderingContext2D | null = null;
  const scratch: { small?: OffscreenCanvas; mid?: OffscreenCanvas } = {};
  // Frames arrive tagged with the source's colour space (an untagged SD picture is read as BT.601,
  // not the decoder's BT.709 guess) and, from an odd source, cut to the even size the layout uses.
  const frames = await framePlan(file, "avc");
  const prepared = withPreparedFrames(
    {
      codec: "avc",
      quality,
      forceTranscode: true,
      allowRotationMetadata: false,
      processedWidth: layout.width,
      processedHeight: layout.height,
      process: (sample) => {
        if (!canvas) {
          canvas = new OffscreenCanvas(layout.width, layout.height);
          c2d = canvas.getContext("2d", { alpha: false });
        }
        if (!c2d) throw new EngineError("internal", "Could not draw the frame.", "Try again.");
        if (color === "blur") drawBlurred(c2d, sample, layout.width, layout.height, scratch);
        else {
          c2d.fillStyle = padFill(color);
          c2d.fillRect(0, 0, layout.width, layout.height);
        }
        c2d.imageSmoothingQuality = "high";
        const { inner } = layout;
        // An odd source at its own size goes in less its odd edge: cut, not scaled by 640/641.
        if (cut) sample.draw(c2d, 0, 0, inner.width, inner.height, inner.x, inner.y);
        else sample.draw(c2d, inner.x, inner.y, inner.width, inner.height);
        return new VideoSample(canvas, {
          timestamp: sample.timestamp,
          duration: sample.duration,
        });
      },
    },
    frames,
  );
  let result: Awaited<ReturnType<typeof convert>>;
  try {
    result = await convert({
      file,
      to,
      outputName,
      video: prepared.video,
      decodeColorSpace: prepared.decodeColorSpace,
      audio,
      trim,
      ffmpegCommand,
      ctx: job,
    });
  } finally {
    prepared.dispose();
  }
  return { ...(await withSound(result)), meta };
}
