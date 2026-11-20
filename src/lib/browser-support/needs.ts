import type { EngineId } from "@/tools/registry/schema";
import type { SupportFacts } from "./probe";

/**
 * What each engine needs from the browser with its page's default options (ADR-0145), in the words
 * of the capability matrix (README.md#feature-catalog, "Browser support"; labels and notes for it are in scripts/capability-matrix-data.ts). The runtime truth is each
 * engine's own `supports()`, asked before the user starts (ADR-0147); this table explains it and
 * generates the matrix. Edit it with the engine.
 */
export const needIds = [
  "video-decode",
  "audio-decode",
  "h264-encode",
  "vp9-encode",
  "hevc-encode",
  "aac-encode",
  "opus-encode",
  "webgl2",
  "offscreen-canvas",
  "gif-decode",
  "converter",
  "screen-capture",
  "camera-mic",
] as const;
export type Need = (typeof needIds)[number];

export interface EngineNeeds {
  needs: Need[];
  /** The engine's ffmpeg.wasm runner takes over where a need is missing (../../tools/engines/fallbacks). */
  fallback?: true;
}

const encodeVideo: Need[] = ["video-decode", "h264-encode", "aac-encode"];
const drawn: Need[] = ["video-decode", "offscreen-canvas", "h264-encode", "aac-encode"];
const gl: Need[] = ["video-decode", "webgl2", "h264-encode", "aac-encode"];

export const engineNeeds: Partial<Record<EngineId, EngineNeeds>> = {
  compress: { needs: encodeVideo, fallback: true },
  bitrate: { needs: encodeVideo },
  framerate: { needs: encodeVideo, fallback: true },
  codec: { needs: ["video-decode", "h264-encode"] },
  faststart: { needs: [] },
  "convert-video": {
    needs: [],
    fallback: true,
  },
  "video-to-audio": { needs: [], fallback: true },
  "convert-audio": {
    needs: ["audio-decode"],
    fallback: true,
  },
  "video-to-gif": { needs: ["video-decode", "offscreen-canvas"], fallback: true },
  "animated-image": { needs: ["video-decode", "offscreen-canvas"] },
  "gif-to-video": {
    needs: ["gif-decode", "h264-encode"],
    fallback: true,
  },
  "video-to-frames": { needs: ["video-decode", "offscreen-canvas"] },
  "frame-extract": { needs: ["video-decode", "offscreen-canvas"] },
  "frame-pick": { needs: ["video-decode", "offscreen-canvas"] },
  "thumbnail-grid": { needs: ["video-decode", "offscreen-canvas"] },
  "images-to-video": { needs: ["offscreen-canvas", "h264-encode"] },
  "audio-to-video": { needs: ["audio-decode", "h264-encode", "aac-encode"] },
  trim: { needs: [] },
  split: { needs: [] },
  merge: { needs: [] },
  loop: { needs: encodeVideo },
  reverse: { needs: encodeVideo },
  speed: { needs: ["converter"] },
  "remove-silence": { needs: ["audio-decode", "aac-encode"] },
  "freeze-frame": { needs: drawn },
  layout: { needs: drawn },
  clips: { needs: drawn },
  "zoom-pan": { needs: drawn },
  "intro-outro": { needs: drawn },
  crop: { needs: encodeVideo, fallback: true },
  "aspect-ratio": { needs: encodeVideo, fallback: true },
  rotate: { needs: [] },
  pad: { needs: encodeVideo, fallback: true },
  stabilize: { needs: gl },
  clarity: { needs: gl },
  mute: { needs: [] },
  "add-audio": { needs: ["audio-decode", "aac-encode"] },
  volume: { needs: ["audio-decode", "aac-encode"] },
  "audio-fade": { needs: ["audio-decode", "aac-encode"] },
  "audio-sync": { needs: [] },
  "audio-tracks": { needs: [] },
  pitch: { needs: ["audio-decode", "aac-encode"] },
  "audio-analyze": { needs: ["audio-decode"] },
  "join-audio": { needs: ["audio-decode", "converter"] },
  ringtone: { needs: ["audio-decode", "aac-encode"] },
  "speech-denoise": { needs: ["audio-decode", "aac-encode"] },
  inspect: { needs: [] },
  "strip-metadata": { needs: [] },
  "edit-metadata": { needs: [] },
  cover: { needs: [] },
  repair: { needs: [] },
  "subtitles-convert": { needs: [] },
  "subtitles-extract": { needs: [] },
  "subtitles-add": { needs: [] },
  "text-overlay": { needs: drawn },
  watermark: { needs: drawn },
  "time-overlay": { needs: drawn },
  "image-overlay": { needs: drawn },
  "blur-region": { needs: gl },
  "chroma-key": { needs: gl },
  "portrait-matte": { needs: gl },
  filter: { needs: gl, fallback: true },
  "video-fade": { needs: encodeVideo, fallback: true },
  "screen-record": { needs: ["screen-capture", "h264-encode"] },
  "webcam-record": { needs: ["camera-mic", "h264-encode", "aac-encode"] },
  "audio-record": { needs: ["camera-mic", "aac-encode"] },
};

/** Whether this browser provides a need, from the probe's facts (worker scope where engines run). */
export function provides(need: Need, worker: SupportFacts, page?: SupportFacts): boolean {
  switch (need) {
    case "video-decode":
      return worker.decode.avc;
    case "audio-decode":
      return worker.audioDecode.aac;
    case "h264-encode":
      // Baseline where High stalls counts: the toolkit writes it there (ADR-0146).
      return worker.encode.avc === "yes" || worker.encodeAvcBaseline === "yes";
    case "vp9-encode":
      return worker.encode.vp9 === "yes";
    case "hevc-encode":
      return worker.encode.hevc === "yes";
    case "aac-encode":
      return worker.audioEncode.aac === "yes";
    case "opus-encode":
      return worker.audioEncode.opus === "yes";
    case "webgl2":
      return worker.offscreenWebgl2;
    case "offscreen-canvas":
      return worker.offscreenCanvas2d;
    case "gif-decode":
      return worker.imageDecoderGif;
    case "converter":
      return worker.sharedArrayBuffer && worker.crossOriginIsolated && worker.wasm;
    case "screen-capture":
      return page?.getDisplayMedia === true;
    case "camera-mic":
      return page?.getUserMedia === true;
  }
}

export type Verdict = "works" | "slower path" | "says so";

/**
 * What a page on this engine does in a browser with these facts, with default options: works
 * natively, takes its ffmpeg.wasm path (slower), or says before the user starts that it cannot. Pure.
 */
export function verdictFor(
  n: EngineNeeds,
  worker: SupportFacts,
  page?: SupportFacts,
): { verdict: Verdict; missing: Need[] } {
  const missing = n.needs.filter((need) => !provides(need, worker, page));
  if (missing.length === 0) return { verdict: "works", missing };
  if (n.fallback && provides("converter", worker, page)) return { verdict: "slower path", missing };
  return { verdict: "says so", missing };
}
