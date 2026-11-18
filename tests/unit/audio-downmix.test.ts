import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { convertAudioEngine } from "@/tools/engines/convert-audio";
import { inspect } from "@/tools/engines/mediabunny/shared";
import { downmix, downmixMatrix, downmixWords, panFilter } from "@/tools/engines/sound/dsp/downmix";

/**
 * Channel downmix (stereo to mono, 5.1 to mono or stereo): the matrix is ITU-R BS.775 scaled so it
 * cannot clip, and the native WAV path writes exactly as many samples as the source has. Fixtures
 * are made with the local ffmpeg (test-only) and the output is read back with it.
 */
const hasFfmpeg = !spawnSync("ffprobe", ["-version"]).error;
const ctx = () => ({ signal: new AbortController().signal, onProgress: () => undefined });

describe("downmixMatrix", () => {
  it("averages stereo to mono", () => {
    expect(downmixMatrix(2, 1)).toEqual([[0.5, 0.5]]);
  });

  it("mixes 5.1 to mono by BS.775 (C 1, L R 0.7071, surrounds 0.5, no LFE), rows adding to 1", () => {
    const [row] = downmixMatrix(6, 1);
    const sum = 1 + 2 * Math.SQRT1_2 + 1;
    expect(row?.[0]).toBeCloseTo(Math.SQRT1_2 / sum, 9);
    expect(row?.[2]).toBeCloseTo(1 / sum, 9);
    expect(row?.[3]).toBe(0);
    expect(row?.[4]).toBeCloseTo(0.5 / sum, 9);
    expect(row?.reduce((s, w) => s + w, 0)).toBeCloseTo(1, 12);
  });

  it("mixes 5.1 and 7.1 to stereo with centre and surrounds 3 dB down, each side adding to 1", () => {
    for (const n of [3, 4, 5, 6, 7, 8, 10]) {
      const m = downmixMatrix(n, 2);
      expect(m).toHaveLength(2);
      for (const row of m) expect(row.reduce((s, w) => s + w, 0)).toBeCloseTo(1, 12);
    }
    const [l, r] = downmixMatrix(6, 2);
    expect(l?.[2]).toBeCloseTo(l?.[4] ?? 0, 12);
    expect((l?.[2] ?? 0) / (l?.[0] ?? 1)).toBeCloseTo(Math.SQRT1_2, 12);
    expect(l?.[1]).toBe(0);
    expect(r?.[0]).toBe(0);
    expect(r?.[5]).toBeCloseTo(l?.[4] ?? 0, 12);
  });

  it("cannot clip: full scale in every channel stays at full scale", () => {
    for (const n of [2, 3, 4, 5, 6, 7, 8, 12])
      for (const out of [1, 2]) {
        if (out >= n) continue;
        const planes = Array.from({ length: n }, () => new Float32Array([1, -1, 0.5]));
        for (const p of downmix(planes, out))
          for (const v of p) expect(Math.abs(v)).toBeLessThanOrEqual(1 + 1e-6);
      }
  });

  it("writes the same mix as an ffmpeg pan filter and in words", () => {
    expect(panFilter(2, 1)).toBe("pan=mono|c0=0.5*c0+0.5*c1");
    expect(panFilter(1, 2)).toBe("pan=stereo|c0=c0|c1=c0");
    expect(panFilter(2, 2)).toBeUndefined();
    expect(panFilter(6, 1)).toBe(
      "pan=mono|c0=0.207107*c0+0.207107*c1+0.292893*c2+0.146447*c4+0.146447*c5",
    );
    expect(downmixWords(2, 1)).toBe("left and right averaged");
    expect(downmixWords(6, 1)).toMatch(/ITU-R BS\.775.*LFE left out.*cannot clip/);
    expect(downmixWords(1, 2)).toBeUndefined();
  });
});

/** Decoded samples (interleaved float) and channel count of a file, read with ffmpeg. */
function decode(path: string): { samples: Float32Array; channels: number } {
  const probe = spawnSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "stream=channels", "-of", "csv=p=0", path],
    { encoding: "utf8" },
  );
  const pcm = spawnSync("ffmpeg", ["-v", "error", "-i", path, "-f", "f32le", "-"], {
    maxBuffer: 256 * 1024 * 1024,
  });
  const b = pcm.stdout as Buffer;
  return {
    samples: new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)),
    channels: Number(probe.stdout.trim()),
  };
}

describe.skipIf(!hasFfmpeg)("stereo to mono and 5.1 to mono, native WAV", () => {
  const dir = mkdtempSync(join(tmpdir(), "downmix-"));
  const make = (name: string, args: string[]) => {
    const path = join(dir, name);
    const r = spawnSync("ffmpeg", ["-v", "error", "-y", ...args, path]);
    if (r.status !== 0) throw new Error(String(r.stderr));
    return path;
  };
  const run = async (path: string, channels: 1 | 2) => {
    const file = new File([readFileSync(path)], path.split("/").pop() ?? "a.wav");
    const info = await inspect(file);
    const o = convertAudioEngine.optionsSchema.parse({ to: "wav", channels });
    const r = await convertAudioEngine.run("webcodecs", [{ file, info }], o, ctx());
    const out = join(dir, `out-${channels}-${file.name}`);
    writeFileSync(out, Buffer.from(await r.blob.arrayBuffer()));
    return { out, meta: r.meta ?? "", command: r.ffmpegCommand };
  };

  it("a 5.1 WAV at −6 dBFS in every channel does not clip and keeps its length", async () => {
    // The same 0.5 tone in all six channels: the scaled mix is that tone at −6 dBFS.
    const src = make("loud51.wav", [
      "-f",
      "lavfi",
      "-i",
      "aevalsrc=0.5*sin(2*PI*440*t):s=48000:d=3:c=5.1",
      "-c:a",
      "pcm_s16le",
    ]);
    const { out, meta } = await run(src, 1);
    const { samples, channels } = decode(out);
    expect(channels).toBe(1);
    expect(samples.length).toBe(144_000);
    let peak = 0;
    let full = 0;
    for (const v of samples) {
      peak = Math.max(peak, Math.abs(v));
      if (Math.abs(v) >= 0.9999) full++;
    }
    expect(full).toBe(0);
    // The LFE is left out and the other weights add to 1: the tone at −6 dBFS, never above.
    expect(20 * Math.log10(peak)).toBeLessThan(-6);
    expect(20 * Math.log10(peak)).toBeGreaterThan(-6.1);
    expect(meta).toMatch(/mono, mixed down from 6 channels by ITU-R BS\.775/);
  });

  it("a stereo WAV becomes the average of left and right, sample for sample, same length", async () => {
    const src = make("lr.wav", [
      "-f",
      "lavfi",
      "-i",
      "aevalsrc=0.6*sin(2*PI*440*t)|0.2*sin(2*PI*660*t):s=48000:d=4",
      "-c:a",
      "pcm_s16le",
    ]);
    const { out, meta, command } = await run(src, 1);
    const mono = decode(out).samples;
    const stereo = decode(src).samples;
    expect(mono.length).toBe(192_000);
    expect(mono.length * 2).toBe(stereo.length);
    let worst = 0;
    for (let i = 0; i < mono.length; i++) {
      const avg = ((stereo[2 * i] ?? 0) + (stereo[2 * i + 1] ?? 0)) / 2;
      worst = Math.max(worst, Math.abs((mono[i] ?? 0) - avg));
    }
    // Within one 16-bit step of the exact average.
    expect(worst).toBeLessThanOrEqual(1 / 32_768 + 1e-9);
    expect(meta).toMatch(/mono, left and right averaged/);
    expect(command).toContain("'pan=mono|c0=0.5*c0+0.5*c1'");
  });

  it("5.1 to stereo for an MP3 or Opus target keeps the centre in both sides", async () => {
    // Dialogue only in the centre channel: a stereo mix that dropped it would be silent.
    const src = make("centre51.wav", [
      "-f",
      "lavfi",
      "-i",
      "aevalsrc=0|0|0.8*sin(2*PI*300*t)|0|0|0:s=48000:d=2:c=5.1",
      "-c:a",
      "pcm_s16le",
    ]);
    const { out } = await run(src, 2);
    const { samples, channels } = decode(out);
    expect(channels).toBe(2);
    expect(samples.length).toBe(96_000 * 2);
    let peakL = 0;
    let peakR = 0;
    for (let i = 0; i < samples.length; i += 2) {
      peakL = Math.max(peakL, Math.abs(samples[i] ?? 0));
      peakR = Math.max(peakR, Math.abs(samples[i + 1] ?? 0));
    }
    const expected = 0.8 * (downmixMatrix(6, 2)[0]?.[2] ?? 0);
    expect(peakL).toBeCloseTo(expected, 3);
    expect(peakR).toBeCloseTo(expected, 3);
  });
});
