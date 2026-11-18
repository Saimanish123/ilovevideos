/**
 * What a run was asked to encode, for the failure the worker gives when an engine's `supports()`
 * says no (`cannotEncodeError`). The codec and size are the ones the engine's own plan gives its
 * encoder (change codec: the chosen codec at `planCodec`'s size; convert: `planConversion`'s
 * codec), never a guess from the source: a WebM → H.264 MP4 read "cannot encode VP9" (QA
 * 2026-10-08). Engines that re-encode in the source's own container (compress, crop, filters) write
 * VP9 for WebM and H.264 otherwise, which is what the fallback says. Pure.
 */
import { type AudioFormatSpec, audioFormatById } from "@/content/formats/audio";
import { withUnit } from "@/lib/format";
import { type CodecTarget, codecTargets, planCodec } from "./codec/plan";
import { codecName, planConversion } from "./convert-video/plan";
import type { EncodeRequest } from "./errors";
import type { MediaInfo } from "./types";

const channels = (n: number) =>
  n === 1 ? "mono" : n === 2 ? "stereo" : n === 6 ? "5.1, 6 channels" : withUnit(n, "channels");

const sizeOf = (s: { width: number; height: number } | undefined) =>
  s && s.width > 0 && s.height > 0 ? `${s.width}×${s.height}` : undefined;

/** The encoder an engine's plan sets up, for the engines that choose it from their options. */
function planned(
  engineId: string | undefined,
  info: MediaInfo,
  o: Record<string, unknown>,
  fileName: string,
): EncodeRequest | undefined {
  if (engineId === "codec" && codecTargets.includes(o.codec as CodecTarget)) {
    const plan = planCodec(info, fileName, o.codec as CodecTarget);
    return { kind: "video", codec: codecName(o.codec as string), source: sizeOf(plan.size) };
  }
  if (engineId === "convert-video" && typeof o.to === "string") {
    const plan = planConversion(info, fileName, o.to, o.videoCodec === "avc");
    if (!plan.copyVideo)
      return {
        kind: "video",
        codec: codecName(plan.videoCodec),
        source: sizeOf(info.video),
      };
    if (!plan.copyAudio) return { kind: "audio", codec: codecName(plan.audioCodec) };
  }
  return undefined;
}

export function encodeRequest(
  info: MediaInfo | undefined,
  options: unknown,
  /** The engine and the file's name, so the engine's own plan names its encoder. */
  job: { engineId?: string; fileName?: string } = {},
): EncodeRequest {
  const o = (options ?? {}) as Record<string, unknown>;
  const fromPlan = info?.video
    ? planned(job.engineId, info, o, job.fileName ?? "input")
    : undefined;
  if (fromPlan) return fromPlan;
  const to = typeof o.to === "string" ? o.to : undefined;
  const sound = to ? audioFormatById.get(to as AudioFormatSpec["id"]) : undefined;
  const a = info?.audio?.[0];
  if (sound || !info?.video) {
    const rate = typeof o.sampleRate === "number" ? o.sampleRate : a?.sampleRate;
    const count = typeof o.channels === "number" ? o.channels : a?.channels;
    const facts = [
      count ? channels(count) : undefined,
      rate
        ? withUnit((rate / 1000).toLocaleString("en", { maximumFractionDigits: 2 }), "kHz")
        : undefined,
    ].filter(Boolean);
    return {
      kind: "audio",
      codec: sound ? codecName(sound.encode.native ?? sound.encode.ffmpeg) : undefined,
      source: facts.length > 0 ? facts.join(", ") : undefined,
    };
  }
  const v = info.video;
  const webm = to === "webm" || (!to && /webm/i.test(info.container));
  return { kind: "video", codec: webm ? "VP9" : "H.264", source: sizeOf(v) };
}
