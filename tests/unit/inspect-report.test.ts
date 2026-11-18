import { describe, expect, it } from "vitest";
import { NBSP } from "@/lib/format";
import {
  formatAspect,
  formatBitrate,
  formatChannels,
  infoReport,
  infoSections,
} from "@/tools/engines/inspect/report";
import type { MediaInfo } from "@/tools/engines/types";

const sample: MediaInfo = {
  container: "MP4",
  durationSec: 3,
  sizeBytes: 261_396,
  video: {
    codec: "avc",
    width: 640,
    height: 360,
    fps: 30,
    bitrate: 589_112,
    rotation: 0,
    codecString: "avc1.42C01E",
  },
  audio: [{ codec: "aac", channels: 1, sampleRate: 44_100, bitrate: 96_591 }],
  tags: { title: "Sample", rawKeys: ["©nam", "©too"] },
};

describe("inspect report", () => {
  it("formats bitrates, channels and aspect ratios", () => {
    expect(formatBitrate(589_112)).toBe(`589${NBSP}kbps`);
    expect(formatBitrate(12_400_000)).toBe(`12.4${NBSP}Mbps`);
    expect(formatBitrate(undefined)).toBeUndefined();
    expect(formatBitrate(0)).toBeUndefined();
    expect(formatChannels(1)).toBe("mono");
    expect(formatChannels(2)).toBe("stereo");
    expect(formatChannels(6)).toBe("5.1");
    expect(formatAspect(1920, 1080)).toBe("16:9");
    expect(formatAspect(1080, 1920)).toBe("9:16");
    expect(formatAspect(1366, 768)).toBe("1.78:1");
    expect(formatAspect(0, 10)).toBeUndefined();
  });

  it("lists every fact the inspector knows, with real names and units", () => {
    const sections = infoSections(sample);
    const titles = sections.map((s) => s.title);
    expect(titles).toEqual(["File", "Video", "Audio", "Tags"]);
    const flat = Object.fromEntries(sections.flatMap((s) => s.rows.map((r) => [r.label, r.value])));
    expect(flat.Container).toBe("MP4");
    expect(flat.Duration).toBe(`0:03 (3.00${NBSP}s)`);
    expect(flat.Codec).toBeDefined();
    expect(flat["Codec string"]).toBe("avc1.42C01E");
    expect(flat.Resolution).toBe("640×360");
    expect(flat["Aspect ratio"]).toBe("16:9");
    expect(flat["Frame rate"]).toBe(`30${NBSP}fps`);
    expect(flat.Channels).toBe("mono");
    expect(flat["Sample rate"]).toBe(`44.1${NBSP}kHz`);
    expect(flat["Overall bitrate"]).toBe(`697${NBSP}kbps`);
    expect(flat.Rotation).toBeUndefined();
    expect(flat.Title).toBe("Sample");
    expect(flat["Raw tag keys"]).toBe("©nam, ©too");
    const video = sections.find((s) => s.title === "Video");
    expect(video?.rows[0]).toEqual({ label: "Codec", value: "H.264" });
    const audio = sections.find((s) => s.title === "Audio");
    expect(audio?.rows[0]).toEqual({ label: "Codec", value: "AAC" });
  });

  it("says when there is no audio and numbers audio tracks when there are several", () => {
    const silent = infoSections({ ...sample, audio: [] });
    expect(silent.find((s) => s.title === "Audio")?.rows).toEqual([
      { label: "Tracks", value: "none" },
    ]);
    const two = infoSections({
      ...sample,
      audio: [
        { codec: "aac", channels: 2, sampleRate: 48_000 },
        { codec: "ac3", channels: 6, sampleRate: 48_000, language: "eng" },
      ],
    });
    expect(two.map((s) => s.title)).toContain("Audio track 2");
    expect(two.find((s) => s.title === "Audio track 2")?.rows).toContainEqual({
      label: "Language",
      value: "eng",
    });
  });

  it("writes the plain-text report with the file name first", () => {
    const text = infoReport(sample, "sample.mp4");
    expect(text.startsWith("Name: sample.mp4\n\nFile\nContainer: MP4\n")).toBe(true);
    expect(text).toContain("\n\nVideo\nCodec: H.264\nCodec string: avc1.42C01E\n");
    expect(text).toContain("Channels: mono");
    expect(infoReport(sample).startsWith("File\n")).toBe(true);
  });
});
