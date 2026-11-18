import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { SpeedOptions } from "@/tools/engines/speed";
import {
  frameRateArg,
  speedArgs,
  speedCommand,
  speedVideoFilter,
} from "@/tools/engines/speed/ffmpeg";
import type { MediaInfo } from "@/tools/engines/types";

/**
 * Change speed's ffmpeg arguments (QA 2026-10-08, video #4): at 2× the output had 77 frames for 75,
 * source frames 0–4 at 1×, and the picture 67 ms behind the sound; 641×361 failed in libx264. The
 * page's own command reproduced it with local ffmpeg, so the arguments are run here through the local
 * ffmpeg (test-only; skipped without it) on a source whose frames carry their index in two grey
 * levels, and the output's frames are read back.
 */
const hasFfmpeg = !spawnSync("ffmpeg", ["-version"]).error;
const dir = mkdtempSync(join(tmpdir(), "speed-"));
const src = join(dir, "indexed.mp4");
const W = 320;
const H = 180;

const info = (fps = 30, width = W, height = H): MediaInfo => ({
  container: "MP4",
  durationSec: 5,
  sizeBytes: 1,
  video: { codec: "avc", width, height, fps },
  audio: [{ codec: "aac", channels: 1, sampleRate: 48_000 }],
});
const opts = (speed: number): SpeedOptions =>
  ({ speed, keepPitch: true, muteAudio: false }) as SpeedOptions;

/** The source frame index each output frame shows, and the output's frame times. */
function frameMap(path: string): { index: number[]; pts: number[] } {
  const raw = spawnSync(
    "ffmpeg",
    ["-v", "error", "-i", path, "-map", "0:v:0", "-f", "rawvideo", "-pix_fmt", "gray", "-"],
    {
      maxBuffer: 1 << 28,
    },
  ).stdout;
  const index: number[] = [];
  for (let at = 0; at + W * H <= raw.length; at += W * H) {
    const level = (x: number) => Math.round(((raw[at + 90 * W + x] ?? 0) - 8) / 16);
    index.push(level(80) + 16 * level(240));
  }
  const probe = spawnSync("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "frame=pts_time",
    "-of",
    "csv=p=0",
    path,
  ]);
  const pts = probe.stdout
    .toString()
    .trim()
    .split("\n")
    .map((l) => Number.parseFloat(l));
  return { index, pts };
}

describe("change speed with ffmpeg", () => {
  it("keeps the source rate after re-timing, crops odd sizes to even, writes NTSC rates exactly", () => {
    expect(speedVideoFilter(2, info().video)).toBe("setpts=PTS/2,fps=30:round=up");
    expect(speedVideoFilter(2, info(30, 641, 361).video)).toBe(
      "crop=trunc(iw/2)*2:trunc(ih/2)*2,setpts=PTS/2,fps=30:round=up",
    );
    expect(frameRateArg(29.97)).toBe("30000/1001");
    expect(frameRateArg(23.976)).toBe("24000/1001");
    expect(frameRateArg(25)).toBe("25");
    expect(frameRateArg(0)).toBe("30");
    expect(speedCommand("a b.mp4", "out.mp4", opts(2), info(30, 641, 361))).toContain(
      "-vf 'crop=trunc(iw/2)*2:trunc(ih/2)*2,setpts=PTS/2,fps=30:round=up'",
    );
  });

  it.skipIf(!hasFfmpeg)(
    "2×, 8× and 0.5×: every output frame is source frame speed × k, on time",
    () => {
      spawnSync("ffmpeg", [
        "-v",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        `color=black:s=${W}x${H}:r=30:d=5,format=gray,geq=lum='if(lt(X\\,160)\\,mod(N\\,16)*16+8\\,floor(N/16)*16+8)'`,
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=1000:sample_rate=48000:duration=5",
        "-shortest",
        "-pix_fmt",
        "yuv420p",
        "-c:v",
        "libx264",
        "-crf",
        "10",
        "-c:a",
        "aac",
        src,
      ]);
      for (const [speed, frames] of [
        [2, 75],
        [8, 19],
        [0.5, 300],
      ] as const) {
        const out = join(dir, `out-${speed}.mp4`);
        const r = spawnSync("ffmpeg", [
          "-v",
          "error",
          "-y",
          "-i",
          src,
          ...speedArgs(opts(speed), info()),
          out,
        ]);
        expect(r.status).toBe(0);
        const { index, pts } = frameMap(out);
        expect(index.length).toBe(frames);
        index.forEach((src, k) => {
          expect(src).toBe(Math.floor(k * speed));
          // The frame shows when its source moment, sped up, falls: no lag behind the sound.
          expect(Math.abs((pts[k] ?? 0) - k / 30)).toBeLessThan(0.001);
        });
      }
    },
  );
});
