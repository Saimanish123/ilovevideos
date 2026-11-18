/**
 * Pure planning for the three recorders (screen, webcam, voice): which codecs and container a
 * recording is written in, at what bitrate, where the camera bubble sits, what the file is called,
 * and the equivalent ffmpeg command. No DOM, no media APIs: the recorder (./recorder) and the
 * capture panels both read these numbers, so what the page says is what the file gets.
 *
 * No network access (README.md#privacy-and-processing §2).
 */

import type { Os, VideoCodecId, VoiceFormat } from "./light";

export {
  type AccessFailure,
  accessFailure,
  bubbleRect,
  type Corner,
  centreSquare,
  type EncoderProbe,
  type Os,
  osOf,
  type Rect,
  type VideoCodecId,
  type VideoRecordingFormat,
  type VoiceFormat,
  videoRecordingFormat,
} from "./light";

export type CaptureKind = "screen" | "webcam" | "voice";
export type AudioCodecId = "aac" | "opus" | "pcm-s16";
export type ContainerId = "mp4" | "webm" | "m4a" | "wav" | "ogg";

export interface VoiceRecordingFormat {
  container: "m4a" | "wav" | "ogg";
  audio: AudioCodecId;
  extension: "m4a" | "wav" | "opus";
  mime: string;
  /** Target bitrate in bits per second; undefined for PCM. */
  bitrate?: number;
}

/** The voice recorder's three outputs. */
export function voiceRecordingFormat(format: VoiceFormat, channels: number): VoiceRecordingFormat {
  const stereo = channels > 1;
  switch (format) {
    case "m4a":
      return {
        container: "m4a",
        audio: "aac",
        extension: "m4a",
        mime: "audio/mp4",
        bitrate: stereo ? 192_000 : 128_000,
      };
    case "opus":
      return {
        container: "ogg",
        audio: "opus",
        extension: "opus",
        mime: "audio/ogg",
        bitrate: stereo ? 128_000 : 64_000,
      };
    case "wav":
      return { container: "wav", audio: "pcm-s16", extension: "wav", mime: "audio/wav" };
  }
}

/** Bytes per second of 16-bit PCM. */
export const pcmBytesPerSecond = (sampleRate: number, channels: number) =>
  sampleRate * channels * 2;

/**
 * Longest WAV this page writes before it stops on its own: a RIFF file's sizes are 32-bit, so a
 * plain WAV ends at 4 GiB (6 h 12 min of 48 kHz stereo, 12 h 25 min mono).
 */
export const WAV_LIMIT_BYTES = 0xffff_ffff - 64;

/**
 * Video bitrate in bits per second. Variable rate, so a still screen costs far less than this; the
 * figure is what the encoder may spend on motion. Screens get 0.08 bits per pixel per frame (text
 * edges need it), cameras 0.1 (sensor noise), and frames above 30 per second cost 75 % as much each,
 * since neighbouring frames differ less. Between 1 and 16 Mb/s.
 */
export function videoBitrate(
  width: number,
  height: number,
  fps: number,
  kind: CaptureKind,
): number {
  const bitsPerPixel = kind === "screen" ? 0.08 : 0.1;
  const perFrame = width * height * bitsPerPixel;
  const rate = fps <= 30 ? perFrame * fps : perFrame * (30 + (fps - 30) * 0.75);
  return Math.round(Math.min(16_000_000, Math.max(1_000_000, rate)) / 1000) * 1000;
}

/** Sound bitrate for a picture recording: 96 kb/s mono, 160 kb/s stereo (AAC or Opus). */
export const soundBitrate = (channels: number) => (channels > 1 ? 160_000 : 96_000);

/** H.264 needs even edges (ADR-0060): the size a picture of this size is written at. */
export function evenSize(width: number, height: number): { width: number; height: number } {
  return { width: Math.max(2, width - (width % 2)), height: Math.max(2, height - (height % 2)) };
}

/**
 * The size a picture recording is written at: the source's own size, made even, and brought down to
 * `maxLines` lines (the short side) when it is larger, keeping its shape. Odd results are evened.
 */
export function recordingSize(
  width: number,
  height: number,
  maxLines?: number,
): { width: number; height: number } {
  const short = Math.min(width, height);
  if (!maxLines || short <= maxLines) return evenSize(width, height);
  const scale = maxLines / short;
  return evenSize(Math.round(width * scale), Math.round(height * scale));
}

/**
 * Seconds actually recorded: the sum of the running stretches, given as [start, end] pairs of a
 * monotonic clock in milliseconds (`end` undefined for the stretch still running at `now`).
 */
export function recordedSeconds(stretches: [number, number | undefined][], now: number): number {
  let ms = 0;
  for (const [start, end] of stretches) ms += Math.max(0, (end ?? now) - start);
  return ms / 1000;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** "screen-recording-2026-11-18-1432.mp4", from the local time the recording started. */
export function recordingName(kind: CaptureKind, started: Date, extension: string): string {
  const stem =
    kind === "screen" ? "screen-recording" : kind === "webcam" ? "webcam-recording" : "voice";
  const d = started;
  return `${stem}-${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}.${extension}`;
}

export interface CommandInput {
  kind: CaptureKind;
  os: Os;
  fps?: number;
  width?: number;
  height?: number;
  /** Whether a microphone is recorded. */
  mic: boolean;
  videoBitrate?: number;
  audio?: AudioCodecId;
  audioBitrate?: number;
  filename: string;
}

/**
 * The same recording made with a local ffmpeg on this OS: avfoundation on macOS, gdigrab and
 * dshow on Windows, x11grab, v4l2 and PulseAudio on Linux. Device names differ per machine, so the
 * macOS and Windows forms start with the command that lists them. Sound from a browser tab or the
 * system has no portable ffmpeg input and is left out.
 */
export function captureCommand(c: CommandInput): string {
  const fps = c.fps ?? 30;
  const audioArgs =
    c.audio === "pcm-s16"
      ? "-c:a pcm_s16le"
      : c.audio === "opus"
        ? `-c:a libopus -b:a ${Math.round((c.audioBitrate ?? 64_000) / 1000)}k`
        : `-c:a aac -b:a ${Math.round((c.audioBitrate ?? 128_000) / 1000)}k`;
  const vb = c.videoBitrate
    ? ` -b:v ${(c.videoBitrate / 1e6).toFixed(1).replace(/\.0$/, "")}M`
    : "";
  const videoArgs = `-c:v libx264 -preset veryfast${vb} -pix_fmt yuv420p`;
  const size = c.width && c.height ? ` -video_size ${c.width}x${c.height}` : "";
  const out = c.filename;
  const sound = c.mic ? ` ${audioArgs}` : " -an";

  if (c.kind === "voice") {
    switch (c.os) {
      case "mac":
        return `ffmpeg -f avfoundation -list_devices true -i ""\nffmpeg -f avfoundation -i ":0" ${audioArgs} ${out}`;
      case "windows":
        return `ffmpeg -list_devices true -f dshow -i dummy\nffmpeg -f dshow -i audio="Microphone" ${audioArgs} ${out}`;
      case "linux":
        return `ffmpeg -f pulse -i default ${audioArgs} ${out}`;
    }
  }
  if (c.kind === "webcam") {
    switch (c.os) {
      case "mac":
        return `ffmpeg -f avfoundation -list_devices true -i ""\nffmpeg -f avfoundation -framerate ${fps}${size} -i "0${c.mic ? ":0" : ""}" ${videoArgs}${sound} ${out}`;
      case "windows":
        return `ffmpeg -list_devices true -f dshow -i dummy\nffmpeg -f dshow -framerate ${fps}${size} -i video="Camera"${c.mic ? ':audio="Microphone"' : ""} ${videoArgs}${sound} ${out}`;
      case "linux":
        return `ffmpeg -f v4l2 -framerate ${fps}${size} -i /dev/video0${c.mic ? " -f pulse -i default" : ""} ${videoArgs}${sound} ${out}`;
    }
  }
  switch (c.os) {
    case "mac":
      return `ffmpeg -f avfoundation -list_devices true -i ""\nffmpeg -f avfoundation -framerate ${fps} -capture_cursor 1 -i "1${c.mic ? ":0" : ""}" ${videoArgs}${sound} ${out}`;
    case "windows":
      return `ffmpeg -f gdigrab -framerate ${fps} -i desktop${c.mic ? ' -f dshow -i audio="Microphone"' : ""} ${videoArgs}${sound} ${out}`;
    case "linux":
      return `ffmpeg -f x11grab -framerate ${fps} -i :0.0${c.mic ? " -f pulse -i default" : ""} ${videoArgs}${sound} ${out}`;
  }
}

/** "H.264, AAC" for the result line. */
export function codecLabel(video?: VideoCodecId, audio?: AudioCodecId): string {
  const v = video === "avc" ? "H.264" : video === "vp9" ? "VP9" : video === "vp8" ? "VP8" : "";
  const a =
    audio === "aac" ? "AAC" : audio === "opus" ? "Opus" : audio === "pcm-s16" ? "16-bit PCM" : "";
  return [v, a].filter(Boolean).join(", ");
}
