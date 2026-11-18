/**
 * Readies each decoded frame for the encoder, in the engine worker: an odd edge is cut for H.264 and
 * HEVC (../crop/math `encodedSize`) and the frame declares the colour space the output should
 * (./color-tags). A source that leaves its colour unnamed is decoded with the colour space it is
 * meant to have (`FramePlan.decodeColorSpace`, the decoder configuration's `colorSpace`, which
 * ../mediabunny/shared `convert` applies): Chromium's decoders then label every frame correctly, so
 * nothing is copied or corrected. Whether they did is asked of the decoder, not assumed: WebKit's
 * H.264 decoder ignores the override (measured 2026-10-08) and its VP9 decoder honours it in part.
 * For those, the fallbacks stay: the cut is a narrower visible rectangle over the same pixels, the
 * tag is a copy of the planes with the right tag, and frames mediabunny has already drawn (an odd
 * source cut by its `crop`, a turned picture) are corrected by the matrix that turns the decoder's
 * reading into what the source meant (./color-tags `matrixCorrection`). No network access.
 */
import {
  type ConversionVideoOptions,
  type InputVideoTrack,
  type Rectangle,
  VideoSample,
  VideoSampleSink,
} from "mediabunny";
import { encodedSize, needsEvenEdges } from "../crop/math";
import { openInput } from "../mediabunny/shared";
import { IDENTITY } from "./color";
import { fullyTagged, matrixCorrection, sameColorTags, targetColorTags } from "./color-tags";
import { createRenderer, type FrameRenderer } from "./render";

export interface FramePlan {
  /** The picture's size as `process` sees it (after rotation), and the size the encoder gets. */
  source: { width: number; height: number };
  output: { width: number; height: number };
  /** What the output declares. */
  colorSpace: VideoColorSpaceInit;
  /**
   * The colour space the decoder is configured with, when the source leaves some tag unnamed. Every
   * caller passes it to `convert` (`decodeColorSpace`), or decodes from the track the plan was made
   * for (which then carries it); `retag` and `misread` are what remains after it.
   */
  decodeColorSpace?: VideoColorSpaceInit;
  /** Decoded frames (with `decodeColorSpace`) still carry tags other than the output's. */
  retag: boolean;
  /** The picture is turned on the way (its own rotation or the job's): frames reach `process` drawn. */
  turned: boolean;
  /**
   * The matrix this browser's decoder reads the untagged picture with, even when told the colour
   * space, when that differs from the one the output declares (WebKit's H.264 decoder: BT.709 for an
   * untagged SD clip meant as BT.601; Chromium honours `decodeColorSpace`).
   */
  misread?: string;
}

/**
 * The plan for a track, read in the space mediabunny hands `process` (square pixels, rotated). A
 * track whose colour is not fully tagged is set to decode with `decodeColorSpace` from here on.
 */
export async function framePlanForTrack(
  track: InputVideoTrack,
  codec: string,
  rotate = 0,
): Promise<FramePlan> {
  const turn = ((((await track.getRotation()) + rotate) % 360) + 360) % 360;
  const w = await track.getSquarePixelWidth();
  const h = await track.getSquarePixelHeight();
  const source = turn % 180 === 0 ? { width: w, height: h } : { width: h, height: w };
  const tags = await track.getColorSpace().catch(() => undefined);
  const colorSpace = targetColorTags(tags, await track.getCodedHeight()) as VideoColorSpaceInit;
  const decodeColorSpace = fullyTagged(tags) ? undefined : colorSpace;
  if (decodeColorSpace) decodeWith(track, decodeColorSpace);
  const read = decodeColorSpace ? await decodedTags(track) : undefined;
  return {
    source,
    output: needsEvenEdges(codec) ? encodedSize(source, codec) : source,
    colorSpace,
    ...(decodeColorSpace ? { decodeColorSpace } : {}),
    // Unknown (the first frame did not decode): left to `prepareFrame`'s check on every frame.
    retag: !!decodeColorSpace && !(read && isYuv(read.format) && sameColorTags(read, colorSpace)),
    turned: turn !== 0,
    misread:
      !tags?.matrix && read?.matrix && read.matrix !== colorSpace.matrix ? read.matrix : undefined,
  };
}

/** Every decoder configuration of `track` carries `colorSpace` (as `convert`'s `decodeColorSpace`). */
function decodeWith(track: InputVideoTrack, colorSpace: VideoColorSpaceInit): void {
  const own = track.getDecoderConfig.bind(track);
  track.getDecoderConfig = async () => {
    const config = await own();
    return config && { ...config, colorSpace };
  };
}

/**
 * The colour space and pixel format the decoder gives the first frame. Asked of the decoder, not
 * assumed: browsers label untagged pictures differently and not all honour a configured colour space.
 */
async function decodedTags(
  track: InputVideoTrack,
): Promise<(VideoColorSpaceInit & { format: string | null }) | undefined> {
  try {
    if (!(await track.canDecode())) return undefined;
    const sample = await new VideoSampleSink(track).getSample(await track.getFirstTimestamp());
    if (!sample) return undefined;
    const frame = sample.toVideoFrame();
    const read = { ...frame.colorSpace.toJSON(), format: frame.format };
    frame.close();
    sample.close();
    return read;
  } catch {
    return undefined;
  }
}

/** The plan for a file's main picture; undefined when it has none. */
export async function framePlan(
  file: File,
  codec: string,
  rotate = 0,
): Promise<FramePlan | undefined> {
  const input = openInput(file);
  try {
    const track = await input.getPrimaryVideoTrack();
    return track ? await framePlanForTrack(track, codec, rotate) : undefined;
  } finally {
    input.dispose();
  }
}

/** Frames reach `process` already drawn by mediabunny (an odd edge cut by its crop, or a turn). */
const drawnFirst = (p: FramePlan) =>
  p.turned || p.output.width !== p.source.width || p.output.height !== p.source.height;

/**
 * True when frames need preparing at all: an odd edge to cut, a tag the decoder may get wrong, or
 * colours a drawn frame took from the decoder's wrong guess.
 */
export const planChangesFrames = (p: FramePlan) =>
  p.output.width !== p.source.width ||
  p.output.height !== p.source.height ||
  (drawnFirst(p) ? !!p.misread : p.retag);

const isYuv = (format: string | null) => !!format && /^(I4|NV)/.test(format);

/**
 * The frame cut to `rect` (default: the plan's output size from the top left) and declaring the
 * plan's colour space. Returns `sample` itself when nothing changes; otherwise a new sample, and
 * `sample` stays the caller's to close. A frame already drawn to RGB (a rotation mediabunny drew)
 * keeps its tag: it is converted again by the encoder anyway.
 */
export async function prepareFrame(
  sample: VideoSample,
  plan: FramePlan,
  rect?: Rectangle,
): Promise<VideoSample> {
  const vr = sample.visibleRect;
  // The cut is worked out on the frame itself, so a frame whose coded size differs from the track's
  // square-pixel size (anamorphic) still comes out even.
  const even = plan.output.width !== plan.source.width || plan.output.height !== plan.source.height;
  const size = even ? encodedSize(vr) : vr;
  const want = rect ?? { left: 0, top: 0, width: size.width, height: size.height };
  const cut =
    want.left !== 0 || want.top !== 0 || want.width !== vr.width || want.height !== vr.height;
  const frame = sample.toVideoFrame();
  const retag =
    plan.retag && isYuv(frame.format) && !sameColorTags(frame.colorSpace, plan.colorSpace);
  if (!cut && !retag) {
    frame.close();
    return sample;
  }
  const visible = {
    x: frame.visibleRect?.x ?? 0,
    y: frame.visibleRect?.y ?? 0,
  };
  const box = {
    x: visible.x + want.left,
    y: visible.y + want.top,
    width: want.width,
    height: want.height,
  };
  let out: VideoFrame;
  try {
    if (retag && frame.format) {
      const options = { rect: box };
      const data = new Uint8Array(frame.allocationSize(options));
      const layout = await frame.copyTo(data, options);
      out = new VideoFrame(data, {
        format: frame.format,
        codedWidth: box.width,
        codedHeight: box.height,
        layout,
        timestamp: frame.timestamp,
        duration: frame.duration ?? undefined,
        colorSpace: plan.colorSpace,
      });
    } else {
      out = new VideoFrame(frame, {
        visibleRect: box,
        displayWidth: box.width,
        displayHeight: box.height,
      });
    }
  } finally {
    frame.close();
  }
  return new VideoSample(out, { timestamp: sample.timestamp, duration: sample.duration });
}

/** True when the source's own frames are odd in either direction (as `process` would see them). */
export const oddSource = (p: FramePlan) => p.source.width % 2 === 1 || p.source.height % 2 === 1;

export interface PreparedVideo {
  video: ConversionVideoOptions;
  /** Pass to `convert` as `decodeColorSpace`: the plan assumes frames are decoded with it. */
  decodeColorSpace?: VideoColorSpaceInit;
  /** Frees what the preparing holds (a WebGL context for colour correction); call after the run. */
  dispose(): void;
}

/**
 * Video options whose frames are prepared before anything else sees them (the job's own `process`
 * then gets the even, correctly read frame). Unchanged when the plan changes nothing, so a run that
 * needs no preparing keeps every fast path (rotation as metadata included).
 *
 * An odd edge is cut by mediabunny's own `crop`, not here: when nothing else makes it redraw,
 * mediabunny first tries the encoder with the source's first frame as it is, and an odd H.264 frame
 * fails that, after which every frame is drawn rounded up to 642×362 (a 641×361 source, measured)
 * before `process` sees it. Its `crop` draws the frame on a canvas at the even size instead; the
 * frame reaches the encoder as RGB and the encoder's own tag (BT.601 in Chromium) is what the file
 * says, so a drawn frame's colours are corrected for the decoder's guess rather than re-tagged.
 */
export function withPreparedFrames(
  video: ConversionVideoOptions,
  plan: FramePlan | undefined,
): PreparedVideo {
  const decodeColorSpace = plan?.decodeColorSpace;
  const none = { video, decodeColorSpace, dispose: () => undefined };
  if (!plan || !planChangesFrames(plan)) return none;
  const cut = plan.output.width !== plan.source.width || plan.output.height !== plan.source.height;
  const base: ConversionVideoOptions = cut
    ? {
        ...video,
        crop: { left: 0, top: 0, width: plan.output.width, height: plan.output.height },
        // A `process` that changes the size (a turn) says so itself; otherwise it gets the cut size.
        ...(video.process
          ? {
              processedWidth: video.processedWidth ?? plan.output.width,
              processedHeight: video.processedHeight ?? plan.output.height,
            }
          : {}),
      }
    : video;
  let renderer: FrameRenderer | undefined;
  let step: ((s: VideoSample) => Promise<VideoSample>) | undefined;
  if (drawnFirst(plan) && plan.misread) {
    // Drawn with the guessed matrix: redraw through the correction (one WebGL pass).
    const fix = {
      ...IDENTITY,
      matrix: matrixCorrection(plan.misread, plan.colorSpace.matrix ?? ""),
    };
    step = async (s) => {
      renderer ??= createRenderer(s.displayWidth, s.displayHeight);
      renderer.draw(s, fix);
      return new VideoSample(renderer.canvas, { timestamp: s.timestamp, duration: s.duration });
    };
  } else if (!drawnFirst(plan) && plan.retag) {
    step = (s) => prepareFrame(s, plan);
  }
  if (!step) return { video: base, decodeColorSpace, dispose: () => undefined };
  const inner = base.process;
  const prepare = step;
  return {
    video: {
      ...base,
      processedWidth: inner ? (base.processedWidth ?? plan.output.width) : plan.output.width,
      processedHeight: inner ? (base.processedHeight ?? plan.output.height) : plan.output.height,
      process: async (sample) => {
        const ready = await prepare(sample);
        if (!inner) return ready;
        let result: Awaited<ReturnType<NonNullable<typeof inner>>> | undefined;
        try {
          result = await inner(ready);
          return result;
        } finally {
          const kept = result === ready || (Array.isArray(result) && result.includes(ready));
          if (ready !== sample && !kept) ready.close();
        }
      },
    },
    decodeColorSpace,
    dispose: () => renderer?.dispose(),
  };
}
