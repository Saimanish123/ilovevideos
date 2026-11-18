/**
 * The small, pure part of the recorders' planning that the recorder pages need before any
 * recording (ADR-0104): the camera bubble's place, the OS for the ffmpeg command, what a device
 * refusal means, and the voice formats' names. Kept apart from ./plan so a page's first load does
 * not carry the codec plans and command strings. No DOM, no network access.
 */

export type VoiceFormat = "m4a" | "wav" | "opus";
export type VideoCodecId = "avc" | "vp9" | "vp8";

/** What this browser's encoders said yes to (WebCodecs `isConfigSupported` at the real size). */
export interface EncoderProbe {
  avc: boolean;
  vp9: boolean;
  vp8: boolean;
  aac: boolean;
  opus: boolean;
}

export interface VideoRecordingFormat {
  container: "mp4" | "webm";
  video: VideoCodecId;
  /** Undefined when the recording has no sound. */
  audio?: "aac" | "opus";
}

/**
 * The format of a picture recording. MP4 with H.264 and AAC plays everywhere and is the default;
 * a browser without an AAC encoder (Firefox has none in WebCodecs) records WebM with VP9 or VP8 and
 * Opus instead, never MP4 with Opus (QuickTime and most editors cannot read it). Null when this
 * browser cannot encode any of them.
 */
export function videoRecordingFormat(
  probe: EncoderProbe,
  withSound: boolean,
): VideoRecordingFormat | null {
  if (probe.avc && (!withSound || probe.aac))
    return { container: "mp4", video: "avc", audio: withSound ? "aac" : undefined };
  const vp = probe.vp9 ? "vp9" : probe.vp8 ? "vp8" : undefined;
  if (vp && (!withSound || probe.opus))
    return { container: "webm", video: vp, audio: withSound ? "opus" : undefined };
  return null;
}

/** The ready line's format words: "MP4 · H.264, AAC", "MP4 · H.264 · no sound", "WebM · VP9, Opus". */
export function formatWords(f: VideoRecordingFormat): string {
  const v = f.video === "avc" ? "H.264" : f.video === "vp9" ? "VP9" : "VP8";
  const a = f.audio === "aac" ? "AAC" : f.audio === "opus" ? "Opus" : undefined;
  return `${f.container === "mp4" ? "MP4" : "WebM"} · ${a ? `${v}, ${a}` : `${v} · no sound`}`;
}

export type Corner = "bottom-right" | "bottom-left" | "top-right" | "top-left";

export interface Rect {
  x: number;
  y: number;
  size: number;
}

/**
 * Where the round camera bubble sits on a recorded screen: a circle whose diameter is `share` of the
 * picture's short side, inset from the chosen corner by 4 % of the short side. Whole pixels.
 */
export function bubbleRect(width: number, height: number, corner: Corner, share = 0.22): Rect {
  const short = Math.min(width, height);
  const size = Math.round(short * share);
  const inset = Math.round(short * 0.04);
  const right = corner.endsWith("right");
  const bottom = corner.startsWith("bottom");
  return {
    x: right ? width - inset - size : inset,
    y: bottom ? height - inset - size : inset,
    size,
  };
}

/**
 * The square part of a camera picture shown in the bubble: the centre of the frame, as large as the
 * short side allows.
 */
export function centreSquare(width: number, height: number): Rect {
  const size = Math.min(width, height);
  return { x: Math.round((width - size) / 2), y: Math.round((height - size) / 2), size };
}

export type Os = "mac" | "windows" | "linux";

/** The desktop OS from the browser's own report, for the ffmpeg command (capture devices differ). */
export function osOf(platform: string): Os {
  const p = platform.toLowerCase();
  if (p.includes("mac") || p.includes("iphone") || p.includes("ipad")) return "mac";
  if (p.includes("win")) return "windows";
  return "linux";
}

/** Which kind of failure a getUserMedia or getDisplayMedia rejection is, from its DOMException name. */
export type AccessFailure = "denied" | "dismissed" | "missing" | "busy" | "unsupported" | "other";

export function accessFailure(
  name: string | undefined,
  message = "",
  /** The screen share dialog: any refusal is a closed dialog unless the OS blocked it. */
  screen = false,
): AccessFailure {
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      // A closed share dialog rejects with NotAllowedError in every browser, worded differently
      // ("Permission denied by user" in Chrome); only Chrome's OS block says "system". A blocked
      // camera or microphone is "Permission denied" without "by user". Closed dialogs are not errors.
      if (screen) return /system/i.test(message) ? "denied" : "dismissed";
      return /by user/i.test(message) && !/system/i.test(message) ? "dismissed" : "denied";
    case "AbortError":
      return "dismissed";
    case "NotFoundError":
    case "OverconstrainedError":
      return "missing";
    case "NotReadableError":
      return "busy";
    case "TypeError":
    case "NotSupportedError":
      return "unsupported";
    default:
      return "other";
  }
}
