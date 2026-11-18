import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyzeSound } from "@/tools/engines/sound/analyze";

/**
 * The on-device meter against ffmpeg's own EBU R128 meter (test-only, when ffmpeg is installed), on
 * fixtures mediabunny decodes without WebCodecs (PCM). Integrated loudness must agree within 0.1 LU
 * and true peak within 0.2 dB.
 */
function ffmpegR128(path: string) {
  const r = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-nostats",
      "-i",
      path,
      "-map",
      "0:a:0",
      "-af",
      "ebur128=peak=true",
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8" },
  );
  if (r.error || r.status !== 0) return null;
  const summary = r.stderr.slice(r.stderr.lastIndexOf("Summary:"));
  return {
    integrated: Number(/I:\s+(-?[\d.]+) LUFS/.exec(summary)?.[1]),
    truePeak: Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(summary)?.[1]),
  };
}

describe("sound analysis", () => {
  for (const name of ["sample.wav", "sample-pcm.mov"]) {
    it(`measures ${name} like ffmpeg's ebur128`, async () => {
      const path = `tests/fixtures/${name}`;
      const file = new File([readFileSync(path)], name);
      const a = await analyzeSound(file, name, { levels: true });
      expect(a.duration).toBeGreaterThan(1.9);
      expect(a.levels.length).toBeGreaterThan(190);
      const ref = ffmpegR128(path);
      if (!ref) return;
      expect(Math.abs(a.loudness.integrated - ref.integrated)).toBeLessThan(0.1);
      expect(Math.abs(a.loudness.truePeak - ref.truePeak)).toBeLessThan(0.2);
    });
  }
});
