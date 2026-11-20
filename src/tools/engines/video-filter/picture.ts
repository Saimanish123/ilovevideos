/**
 * One re-encode of the picture that keeps the sound whenever it can. mediabunny's Conversion
 * re-encodes any sound track whose first packet sits before zero (the AAC priming packet most
 * phones, cameras and ffmpeg write, ADR-0021), so a "sound copied" claim cannot rest on it: the
 * picture is encoded alone, then joined with the source's sound packets by the packet copy
 * (mediabunny/packet-copy `copyTracks`), which keeps the priming behind an edit list. Sound the
 * container does not hold as it is, or sound that is changed (a fade), is encoded once instead.
 * Runs in the engine worker; no network access (README.md#privacy-and-processing §2).
 */
import {
  ALL_FORMATS,
  BlobSource,
  type ConversionAudioOptions,
  type ConversionVideoOptions,
  Input,
  type InputAudioTrack,
  Quality,
} from "mediabunny";
import { containerById } from "@/content/formats/containers";
import { classifyError, EngineError } from "../errors";
import { copyTracks } from "../mediabunny/packet-copy";
import { type ContainerId, containers, convert, openInput } from "../mediabunny/shared";
import type { EngineContext, EngineResult, MediaInfo } from "../types";
import { framePlan, withPreparedFrames } from "./frame-prep";
import { type SoundPlan, soundCodec, soundPlan } from "./plan";

export interface PictureJob {
  file: File;
  info: MediaInfo;
  to: ContainerId;
  outputName: string;
  /** The picture's re-encode; `forceTranscode` is implied. */
  video: ConversionVideoOptions;
  /**
   * keep: copy when the container holds it, else encode; drop: no sound; process: encode through
   * it; encode: always encode (at `audioBitrate`), never copy.
   */
  sound: "keep" | "drop" | "encode" | { process: NonNullable<ConversionAudioOptions["process"]> };
  /** Bitrate of the sound when it is encoded (bits per second). Default 128 kb/s. */
  audioBitrate?: number;
  ffmpegCommand: string;
  ctx: EngineContext;
  /** Set by `encodePicture` from the frame plan (./frame-prep); passed on to `convert`. */
  decodeColorSpace?: VideoColorSpaceInit;
}

export interface PictureResult extends EngineResult {
  /** What happened to the sound. */
  sound: SoundPlan | "dropped";
}

const AUDIO_BITRATE = 128_000;

export async function encodePicture(job: PictureJob): Promise<PictureResult> {
  // Each frame is cut to even edges for H.264 and read with the source's colour space before
  // anything else sees it (./frame-prep); `process` then gets the even picture.
  const frames = await framePlan(job.file, job.video.codec ?? "avc", job.video.rotate);
  const prepared = withPreparedFrames({ ...job.video, forceTranscode: true }, frames);
  try {
    return await encodeWith(
      { ...job, decodeColorSpace: prepared.decodeColorSpace },
      prepared.video,
    );
  } finally {
    prepared.dispose();
  }
}

async function encodeWith(job: PictureJob, video: ConversionVideoOptions): Promise<PictureResult> {
  const { info, to, ctx } = job;
  const plan = soundPlan(info, to);
  const encodeSound = (process?: ConversionAudioOptions["process"]): ConversionAudioOptions => ({
    codec: soundCodec(to),
    quality: new Quality({ bitrate: job.audioBitrate ?? AUDIO_BITRATE }),
    forceTranscode: true,
    ...(process ? { process } : {}),
  });

  if (plan === "none" || job.sound === "drop") {
    const r = await convert({ ...job, video, audio: { discard: true } });
    return { ...r, sound: plan === "none" ? "none" : "dropped" };
  }
  if (typeof job.sound === "object") {
    const r = await convert({ ...job, video, audio: encodeSound(job.sound.process) });
    return { ...r, sound: "encode" };
  }
  if (plan === "encode" || job.sound === "encode") {
    const r = await convert({ ...job, video, audio: encodeSound() });
    return { ...r, sound: "encode" };
  }

  // The picture alone, then the source's sound copied next to it.
  const picture = await convert({
    ...job,
    video,
    audio: { discard: true },
    ctx: {
      signal: ctx.signal,
      onProgress: (p) =>
        ctx.onProgress(p.phase === "processing" ? { ...p, ratio: p.ratio * 0.98 } : p),
    },
  });
  if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
  ctx.onProgress({ phase: "finishing", ratio: 0.98, detail: "Copying the sound" });
  const source = openInput(job.file);
  const encoded = new Input({ source: new BlobSource(picture.blob), formats: ALL_FORMATS });
  try {
    const v = await encoded.getPrimaryVideoTrack();
    if (!v) throw new EngineError("internal", "The video could not be written.", "Try again.");
    const row = containerById.get(to);
    const sounds = (await source.getAudioTracks()).filter(
      (a: InputAudioTrack) => !!a.codec && (row?.audioCodecs ?? []).includes(a.codec),
    );
    let tags: Awaited<ReturnType<Input["getMetadataTags"]>> | undefined;
    try {
      tags = await source.getMetadataTags();
    } catch {
      // Tags are a convenience; a file whose tags cannot be read still copies.
    }
    const parts = await copyTracks({
      input: source,
      tracks: [v, ...sounds],
      to,
      tags,
      ctx,
    });
    ctx.onProgress({ phase: "finishing", ratio: 1, detail: "Writing the file" });
    return {
      blob: new Blob(parts, { type: containers[to].mime }),
      filename: job.outputName,
      ffmpegCommand: job.ffmpegCommand,
      sound: "copy",
    };
  } catch (e) {
    if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
    throw classifyError(e);
  } finally {
    encoded.dispose();
    source.dispose();
  }
}
