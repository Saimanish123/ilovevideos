import { describe, expect, it } from "vitest";
import { mergeCommand } from "@/tools/engines/merge";
import { planMerge, unusableClip } from "@/tools/engines/merge/plan";
import type { MediaInfo } from "@/tools/engines/types";

const clip = (over: Partial<NonNullable<MediaInfo["video"]>> = {}, audio?: MediaInfo["audio"]) => ({
  name: "a.mp4",
  info: {
    container: "MP4",
    durationSec: 3,
    sizeBytes: 1000,
    video: { codec: "avc", codecString: "avc1.42c01e", width: 640, height: 360, fps: 30, ...over },
    audio: audio ?? [{ codec: "aac", channels: 1, sampleRate: 44_100 }],
  } satisfies MediaInfo,
});

describe("merge plan", () => {
  it("copies when every clip carries the same streams", () => {
    const plan = planMerge([clip(), clip(), clip()]);
    expect(plan.copy).toBe(true);
    expect(plan.reasons).toEqual([]);
    expect(plan.totalSec).toBe(9);
  });

  it("re-encodes to the first clip's frame and says why", () => {
    const plan = planMerge([
      clip(),
      clip({ width: 480, height: 480, codecString: "avc1.4d401e" }, [
        { codec: "aac", channels: 1, sampleRate: 48_000 },
      ]),
    ]);
    expect(plan.copy).toBe(false);
    expect(plan.width).toBe(640);
    expect(plan.height).toBe(360);
    expect(plan.reasons.join(" ")).toContain("Clip 2 is 480×480; clip 1 is 640×360.");
    expect(plan.reasons.join(" ")).toContain("48\u00a0kHz mono; clip 1's is 44.1\u00a0kHz mono");
  });

  it("notices sound on one clip only, rotation, and a forced re-encode", () => {
    expect(planMerge([clip(), clip({}, [])]).reasons[0]).toBe("Clip 2 has no sound; clip 1 does.");
    expect(planMerge([clip(), clip({ rotation: 90 })]).reasons[0]).toContain("rotated");
    const forced = planMerge([clip(), clip()], { reencode: true });
    expect(forced.copy).toBe(false);
    expect(forced.reasons).toEqual([]);
  });

  it("rounds odd frames down to even and refuses clips without video", () => {
    expect(planMerge([clip({ width: 641, height: 361 }), clip()]).width).toBe(640);
    const noVideo = { name: "voice.m4a", info: { ...clip().info, video: undefined } };
    expect(unusableClip([clip(), noVideo])).toContain("Clip 2 (voice.m4a) has no video track");
  });

  it("writes the ffmpeg equivalent for both paths", () => {
    const copy = mergeCommand(
      ["a.mp4", "b.mp4"],
      "a-merged.mp4",
      {
        copy: true,
        width: 640,
        height: 360,
        fit: "contain",
      },
      null,
    );
    expect(copy).toContain("-f concat -safe 0 -i list.txt -c copy a-merged.mp4");
    const re = mergeCommand(
      ["a.mp4", "b.mp4"],
      "a-merged.mp4",
      { copy: false, width: 640, height: 360, fit: "contain" },
      { sampleRate: 44_100, channels: 1, hasAudio: [true, true] },
    );
    expect(re).toContain("pad=640:360");
    expect(re).toContain("concat=n=2:v=1:a=1[v][a]");
    expect(re).toContain("-c:v libx264");
  });
});

describe("H.264 profile names", () => {
  it("reads profile and level from the codec string", async () => {
    const { profileName } = await import("@/tools/engines/merge/plan");
    expect(profileName("avc", "avc1.42c01e")).toBe("H.264 Baseline, level 3.0");
    expect(profileName("avc", "avc1.640028")).toBe("H.264 High, level 4.0");
    expect(profileName("hevc", "hvc1.1.6.L93.B0")).toBe("HEVC (hvc1.1.6.L93.B0)");
  });
});
