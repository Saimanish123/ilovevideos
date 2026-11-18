import { describe, expect, it } from "vitest";
import { LinearResampler, mixChannels } from "@/tools/engines/merge/resample";

describe("merge resampler", () => {
  it("converts 48 kHz to 44.1 kHz with the right length, across chunks", () => {
    const r = new LinearResampler(48_000, 44_100, 1);
    let out = 0;
    // One second of a 1 kHz sine in 1024-frame chunks.
    for (let start = 0; start < 48_000; start += 1024) {
      const n = Math.min(1024, 48_000 - start);
      const chunk = new Float32Array(n);
      for (let i = 0; i < n; i++) chunk[i] = Math.sin((2 * Math.PI * 1000 * (start + i)) / 48_000);
      out += r.process([chunk])[0]?.length ?? 0;
    }
    expect(Math.abs(out - 44_100)).toBeLessThanOrEqual(1);
  });

  it("keeps a ramp continuous at chunk edges", () => {
    const r = new LinearResampler(2, 3, 1);
    const a = r.process([new Float32Array([0, 1, 2, 3])])[0] ?? new Float32Array();
    const b = r.process([new Float32Array([4, 5, 6, 7])])[0] ?? new Float32Array();
    const all = [...a, ...b];
    for (let i = 1; i < all.length; i++)
      expect((all[i] ?? 0) - (all[i - 1] ?? 0)).toBeCloseTo(2 / 3, 5);
  });

  it("mixes stereo to mono and mono to stereo", () => {
    const [mono] = mixChannels([new Float32Array([1, 0]), new Float32Array([0, 1])], 1);
    expect(Array.from(mono ?? [])).toEqual([0.5, 0.5]);
    const stereo = mixChannels([new Float32Array([0.25])], 2);
    expect(stereo.map((p) => p[0])).toEqual([0.25, 0.25]);
  });
});

describe("mixChannels keeps the centre of 5.1", () => {
  it("folds the centre into both sides (ITU-R BS.775), where it used to be dropped", async () => {
    const { mixChannels: mix } = await import("@/tools/engines/merge/resample");
    const { downmixMatrix } = await import("@/tools/engines/sound/dsp/downmix");
    const n = 4;
    // FL FR FC LFE BL BR: dialogue in the centre only.
    const planes = [0, 0, 1, 0, 0, 0].map((v) => new Float32Array(n).fill(v * 0.5));
    const [l, r] = mix(planes, 2);
    const w = downmixMatrix(6, 2)[0]?.[2] ?? 0;
    expect(w).toBeGreaterThan(0.2);
    expect(l?.[0]).toBeCloseTo(0.5 * w, 6);
    expect(r?.[0]).toBeCloseTo(0.5 * w, 6);
    // Every channel at full scale cannot clip.
    const full = mix(
      Array.from({ length: 6 }, () => new Float32Array(n).fill(1)),
      2,
    );
    expect(Math.max(...(full[0] ?? []))).toBeLessThanOrEqual(1 + 1e-6);
    // Mono to stereo copies, stereo to mono averages.
    expect(mix([Float32Array.of(0.4)], 2).map((p) => p[0])).toEqual([0.4, 0.4].map(Math.fround));
    expect(mix([Float32Array.of(1), Float32Array.of(0)], 1)[0]?.[0]).toBeCloseTo(0.5, 6);
  });
});
