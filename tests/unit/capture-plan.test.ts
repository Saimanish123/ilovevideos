import { describe, expect, it } from "vitest";
import { formatWords } from "@/tools/engines/capture/light";
import {
  accessFailure,
  bubbleRect,
  captureCommand,
  centreSquare,
  codecLabel,
  evenSize,
  osOf,
  recordedSeconds,
  recordingName,
  recordingSize,
  soundBitrate,
  videoBitrate,
  videoRecordingFormat,
  voiceRecordingFormat,
  WAV_LIMIT_BYTES,
} from "@/tools/engines/capture/plan";

const all = { avc: true, vp9: true, vp8: true, aac: true, opus: true };

describe("recording format", () => {
  it("names the format for the ready line", () => {
    expect(formatWords({ container: "mp4", video: "avc", audio: "aac" })).toBe("MP4 · H.264, AAC");
    expect(formatWords({ container: "mp4", video: "avc" })).toBe("MP4 · H.264 · no sound");
    expect(formatWords({ container: "webm", video: "vp9", audio: "opus" })).toBe(
      "WebM · VP9, Opus",
    );
  });
  it("is MP4 with H.264 and AAC wherever both encode", () => {
    expect(videoRecordingFormat(all, true)).toEqual({
      container: "mp4",
      video: "avc",
      audio: "aac",
    });
    expect(videoRecordingFormat(all, false)).toEqual({
      container: "mp4",
      video: "avc",
      audio: undefined,
    });
  });
  it("falls back to WebM with Opus, never MP4 with Opus, and says why", () => {
    const f = videoRecordingFormat({ ...all, aac: false }, true);
    expect(f?.container).toBe("webm");
    expect(f?.video).toBe("vp9");
    expect(f?.audio).toBe("opus");
    expect(videoRecordingFormat({ ...all, aac: false, vp9: false }, true)?.video).toBe("vp8");
    // Silent recordings only need a picture encoder.
    expect(videoRecordingFormat({ ...all, aac: false, opus: false }, false)?.container).toBe("mp4");
  });
  it("refuses when nothing can encode", () => {
    expect(
      videoRecordingFormat({ avc: false, vp9: false, vp8: false, aac: true, opus: true }, true),
    ).toBeNull();
    expect(videoRecordingFormat({ ...all, aac: false, opus: false }, true)).toBeNull();
  });
  it("voice formats: M4A, WAV, Opus at the stated rates", () => {
    expect(voiceRecordingFormat("m4a", 1)).toMatchObject({
      container: "m4a",
      audio: "aac",
      bitrate: 128_000,
    });
    expect(voiceRecordingFormat("m4a", 2).bitrate).toBe(192_000);
    expect(voiceRecordingFormat("opus", 1)).toMatchObject({
      container: "ogg",
      extension: "opus",
      bitrate: 64_000,
    });
    expect(voiceRecordingFormat("wav", 1)).toMatchObject({ audio: "pcm-s16", mime: "audio/wav" });
  });
  it("WAV stops before 4 GiB: 6 h 12 min of 48 kHz stereo, 12 h 25 min mono", () => {
    expect(Math.floor(WAV_LIMIT_BYTES / (48_000 * 2 * 2) / 60)).toBe(372);
    expect(Math.floor(WAV_LIMIT_BYTES / (48_000 * 2) / 60)).toBe(745);
  });
});

describe("bitrates and sizes", () => {
  it("screen and camera densities, 1 to 16 Mb/s", () => {
    expect(videoBitrate(1920, 1080, 30, "screen")).toBe(4_977_000);
    expect(videoBitrate(1280, 720, 30, "webcam")).toBe(2_765_000);
    expect(videoBitrate(1920, 1080, 30, "webcam")).toBe(6_221_000);
    // 60 fps costs 1.75× of 30, not 2×.
    expect(
      videoBitrate(1920, 1080, 60, "screen") / videoBitrate(1920, 1080, 30, "screen"),
    ).toBeCloseTo(1.75, 2);
    expect(videoBitrate(320, 240, 15, "screen")).toBe(1_000_000);
    expect(videoBitrate(5120, 2880, 60, "screen")).toBe(16_000_000);
    expect(soundBitrate(1)).toBe(96_000);
    expect(soundBitrate(2)).toBe(160_000);
  });
  it("evens odd edges and caps the short side, keeping the shape", () => {
    expect(evenSize(1281, 719)).toEqual({ width: 1280, height: 718 });
    expect(recordingSize(2880, 1800)).toEqual({ width: 2880, height: 1800 });
    expect(recordingSize(2880, 1800, 1080)).toEqual({ width: 1728, height: 1080 });
    expect(recordingSize(1080, 1920, 720)).toEqual({ width: 720, height: 1280 });
    expect(recordingSize(1279, 719, 1080)).toEqual({ width: 1278, height: 718 });
  });
});

describe("camera bubble", () => {
  it("sits inset from the chosen corner, 22 % of the short side", () => {
    expect(bubbleRect(1920, 1080, "bottom-right")).toEqual({
      x: 1920 - 43 - 238,
      y: 1080 - 43 - 238,
      size: 238,
    });
    expect(bubbleRect(1920, 1080, "top-left")).toEqual({ x: 43, y: 43, size: 238 });
    const r = bubbleRect(1280, 720, "bottom-left");
    expect(r.x).toBe(29);
    expect(r.y + r.size).toBe(720 - 29);
  });
  it("takes the centre square of the camera", () => {
    expect(centreSquare(1280, 720)).toEqual({ x: 280, y: 0, size: 720 });
    expect(centreSquare(720, 1280)).toEqual({ x: 0, y: 280, size: 720 });
  });
});

describe("time, names, commands", () => {
  it("counts only the running stretches", () => {
    expect(
      recordedSeconds(
        [
          [0, 2000],
          [5000, 6500],
          [9000, undefined],
        ],
        10_000,
      ),
    ).toBe(4.5);
  });
  it("names files by kind and local start time", () => {
    const d = new Date(2026, 10, 18, 9, 5);
    expect(recordingName("screen", d, "mp4")).toBe("screen-recording-2026-11-18-0905.mp4");
    expect(recordingName("voice", d, "opus")).toBe("voice-2026-11-18-0905.opus");
  });
  it("gives the local ffmpeg command for each OS", () => {
    expect(osOf("MacIntel")).toBe("mac");
    expect(osOf("Win32")).toBe("windows");
    expect(osOf("Linux x86_64")).toBe("linux");
    const base = {
      fps: 30,
      mic: true,
      videoBitrate: 4_977_000,
      audio: "aac" as const,
      audioBitrate: 96_000,
      filename: "a.mp4",
    };
    expect(captureCommand({ ...base, kind: "screen", os: "windows" })).toBe(
      'ffmpeg -f gdigrab -framerate 30 -i desktop -f dshow -i audio="Microphone" -c:v libx264 -preset veryfast -b:v 5M -pix_fmt yuv420p -c:a aac -b:a 96k a.mp4',
    );
    expect(captureCommand({ ...base, kind: "screen", os: "linux", mic: false })).toContain(
      "x11grab -framerate 30 -i :0.0 -c:v libx264",
    );
    expect(captureCommand({ ...base, kind: "screen", os: "linux", mic: false })).toContain(
      " -an a.mp4",
    );
    expect(
      captureCommand({ ...base, kind: "webcam", os: "mac", width: 1280, height: 720 }),
    ).toContain('-video_size 1280x720 -i "0:0"');
    expect(
      captureCommand({ ...base, kind: "voice", os: "linux", audio: "pcm-s16", filename: "v.wav" }),
    ).toBe("ffmpeg -f pulse -i default -c:a pcm_s16le v.wav");
    expect(
      captureCommand({
        ...base,
        kind: "voice",
        os: "mac",
        audio: "opus",
        audioBitrate: 64_000,
        filename: "v.opus",
      }),
    ).toContain('-i ":0" -c:a libopus -b:a 64k v.opus');
  });
  it("labels codecs", () => {
    expect(codecLabel("avc", "aac")).toBe("H.264, AAC");
    expect(codecLabel(undefined, "pcm-s16")).toBe("16-bit PCM");
  });
});

describe("device refusals", () => {
  it("tells a dismissed share dialog from a block", () => {
    expect(accessFailure("NotAllowedError", "Permission denied by user")).toBe("dismissed");
    expect(accessFailure("NotAllowedError", "Permission denied")).toBe("denied");
    expect(accessFailure("NotAllowedError", "Permission denied by system")).toBe("denied");
    expect(accessFailure("NotFoundError")).toBe("missing");
    expect(accessFailure("NotReadableError")).toBe("busy");
    expect(accessFailure("OverconstrainedError")).toBe("missing");
    expect(accessFailure("Whatever")).toBe("other");
    // The share dialog: any browser's cancel wording is a closed dialog; only an OS block is not.
    expect(accessFailure("NotAllowedError", "The request is not allowed", true)).toBe("dismissed");
    expect(accessFailure("NotAllowedError", "Permission denied", true)).toBe("dismissed");
    expect(accessFailure("NotAllowedError", "Permission denied by system", true)).toBe("denied");
  });
});
