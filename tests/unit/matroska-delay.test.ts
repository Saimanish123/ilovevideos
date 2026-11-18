import { openAsBlob } from "node:fs";
import { describe, expect, it } from "vitest";
import { matroskaSoundDelays, samplesToDrop } from "@/tools/engines/ffmpeg/matroska-delay";

/**
 * Matroska CodecDelay on the ffmpeg.wasm path (QA D10, 2026-10-08). FFmpeg 5.1 honours it only for
 * Opus. Values from ffprobe 9 `-v debug` on the same fixtures ("delay 1024", "delay 1105", "delay 256").
 */
const F = "tests/fixtures/";
const file = async (name: string) => new File([await openAsBlob(F + name)], name);

describe("Matroska CodecDelay for the ffmpeg path", () => {
  it("reads each sound track's delay in samples, in track order", async () => {
    expect(await matroskaSoundDelays(await file("sample-clicks.mkv"))).toEqual([
      { codec: "aac", sampleRate: 44_100, samples: 1024 },
    ]);
    expect(await matroskaSoundDelays(await file("sample-clicks-mp3.mkv"))).toEqual([
      { codec: "mp3", sampleRate: 44_100, samples: 1105 },
    ]);
    const two = await matroskaSoundDelays(await file("sample-ac3-tracks.mkv"));
    expect(two.map((d) => [d.codec, d.samples])).toEqual([
      ["ac3", 256],
      ["ac3", 256],
    ]);
    expect(await matroskaSoundDelays(await file("sample.mp4"))).toEqual([]);
  });

  it("drops the delay for every codec but Opus, which FFmpeg 5.1 delays itself", () => {
    expect(
      samplesToDrop([
        { codec: "aac", sampleRate: 48_000, samples: 1024 },
        { codec: "opus", sampleRate: 48_000, samples: 312 },
      ]),
    ).toEqual([1024, 0]);
  });
});
