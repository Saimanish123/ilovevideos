/**
 * Words for the browser support matrix in README.md (scripts/capability-matrix.ts, ADR-0145): what
 * each need is, what changes with an engine's options, and what the bundled caniuse-lite data says
 * about Firefox. Documentation only, never shown on a page; kept out of src/ for that reason.
 *
 * Firefox is documented and not run here (ADR-0144): Playwright's Firefox cannot start on the
 * machine this toolkit is built on, so its column comes from caniuse-lite 1.0.30001810 (read
 * 2026-11-19) and says "unknown" where that data does not go down to the level a need asks (which
 * codecs an encoder takes, ImageDecoder, getDisplayMedia, WebGL 2 inside a worker). Every page checks
 * at run time anyway (ADR-0147). Re-check with E2E_FIREFOX=1 on a machine where Firefox starts.
 */
import type { Need } from "../src/lib/browser-support/needs";

export const needLabel: Record<Need, string> = {
  "video-decode": "Video decode (WebCodecs)",
  "audio-decode": "Audio decode (WebCodecs)",
  "h264-encode": "H.264 encode that returns frames",
  "vp9-encode": "VP9 encode",
  "hevc-encode": "HEVC encode",
  "aac-encode": "AAC encode",
  "opus-encode": "Opus encode",
  webgl2: "WebGL 2 in a worker (OffscreenCanvas)",
  "offscreen-canvas": "OffscreenCanvas 2D in a worker",
  "gif-decode": "GIF decode (ImageDecoder)",
  converter: "ffmpeg.wasm (SharedArrayBuffer, cross-origin isolated)",
  "screen-capture": "Screen capture (getDisplayMedia)",
  "camera-mic": "Camera and microphone (getUserMedia)",
};

/** What changes with options or input, per engine, in a few words. */
export const engineNote: Record<string, string> = {
  codec: "HEVC encode for H.264 to HEVC",
  faststart: "rewrites the index only",
  "convert-video": "copies when the codecs fit; H.264 or VP9 and AAC or Opus when they do not",
  "video-to-audio": "copies AAC; MP3 and WAV via ffmpeg.wasm",
  "convert-audio": "AAC and Opus natively; MP3, FLAC and Vorbis via ffmpeg.wasm",
  "gif-to-video": "ffmpeg.wasm reads the GIF where ImageDecoder is missing",
  trim: "a frame-accurate cut needs H.264 encode",
  merge: "clips that differ need H.264 and AAC encode",
  "remove-silence": "video needs H.264 encode",
  rotate: "a turn is written as metadata; a flip needs H.264 encode",
  volume: "MP3 and other outputs via ffmpeg.wasm",
  "subtitles-add": "soft subtitles copy; burned-in text needs H.264 encode",
  "screen-record": "VP9 where H.264 is missing",
  "audio-record": "Opus where AAC is missing",
};

export const CANIUSE_LITE = "1.0.30001810";

export interface Documented {
  desktop: string;
  android: string;
}

const webcodecsCodec: Documented = {
  desktop:
    "unknown: WebCodecs from 130 (caniuse webcodecs); which codecs encode is not in the data",
  android: "no: no WebCodecs (caniuse webcodecs, Firefox for Android 153)",
};

export const firefoxDocumented: Record<Need, Documented> = {
  "video-decode": {
    desktop: "yes from 130 (caniuse webcodecs)",
    android: "no: no WebCodecs (caniuse webcodecs, Firefox for Android 153)",
  },
  "audio-decode": {
    desktop: "yes from 130 (caniuse webcodecs)",
    android: "no: no WebCodecs (caniuse webcodecs, Firefox for Android 153)",
  },
  "h264-encode": webcodecsCodec,
  "vp9-encode": webcodecsCodec,
  "hevc-encode": webcodecsCodec,
  "aac-encode": webcodecsCodec,
  "opus-encode": webcodecsCodec,
  webgl2: {
    desktop: "unknown in a worker: WebGL 2 from 51, OffscreenCanvas from 105 (caniuse)",
    android: "unknown in a worker: WebGL 2 and OffscreenCanvas yes in 153 (caniuse)",
  },
  "offscreen-canvas": {
    desktop: "yes from 105 (caniuse offscreencanvas)",
    android: "yes in 153 (caniuse offscreencanvas)",
  },
  "gif-decode": { desktop: "unknown: not in the data", android: "unknown: not in the data" },
  converter: {
    desktop: "yes: SharedArrayBuffer from 79 when isolated, WebAssembly threads from 79 (caniuse)",
    android: "yes in 153 (caniuse sharedarraybuffer, wasm-threads)",
  },
  "screen-capture": { desktop: "unknown: not in the data", android: "unknown: not in the data" },
  "camera-mic": {
    desktop: "yes (caniuse stream, current versions)",
    android: "yes in 153 (caniuse stream)",
  },
};
