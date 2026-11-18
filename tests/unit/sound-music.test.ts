import { describe, expect, it } from "vitest";
import {
  camelot,
  estimateKey,
  estimateTempo,
  keyName,
  MusicFeatureReader,
  relativeKey,
} from "@/tools/engines/sound/dsp/music";
import { synthMusic } from "../../scripts/synth-music";

function features(planes: Float32Array[], rate = 44_100) {
  const r = new MusicFeatureReader(rate);
  const n = planes[0]?.length ?? 0;
  for (let i = 0; i < n; i += 4096)
    r.push(
      planes.map((p) => p.subarray(i, i + 4096)),
      Math.min(4096, n - i),
    );
  return r.finish();
}

describe("key names and Camelot codes", () => {
  it("follows the Camelot wheel", () => {
    expect(camelot({ tonic: 0, mode: "major" })).toBe("8B");
    expect(camelot({ tonic: 9, mode: "minor" })).toBe("8A");
    expect(camelot({ tonic: 7, mode: "major" })).toBe("9B");
    expect(camelot({ tonic: 5, mode: "major" })).toBe("7B");
    expect(camelot({ tonic: 6, mode: "major" })).toBe("2B");
    expect(camelot({ tonic: 8, mode: "minor" })).toBe("1A");
    expect(camelot({ tonic: 0, mode: "minor" })).toBe("5A");
  });
  it("spells keys as their signatures do and finds the relative", () => {
    expect(keyName({ tonic: 3, mode: "major" })).toBe("E-flat major");
    expect(keyName({ tonic: 6, mode: "minor" })).toBe("F-sharp minor");
    expect(keyName({ tonic: 10, mode: "minor" })).toBe("B-flat minor");
    expect(keyName(relativeKey({ tonic: 9, mode: "minor" }))).toBe("C major");
    expect(keyName(relativeKey({ tonic: 3, mode: "major" }))).toBe("C minor");
  });
});

describe("key", { timeout: 60_000 }, () => {
  it("names all 24 keys of synthetic tracks with high confidence", () => {
    for (let tonic = 0; tonic < 12; tonic++)
      for (const mode of ["major", "minor"] as const) {
        const k = estimateKey(features(synthMusic({ bpm: 120, tonic, mode, seconds: 20 })));
        expect(k.key).toEqual({ tonic, mode });
        expect(k.confidence).toBe("high");
      }
  });
  it("reads a recording tuned 30 cents sharp, and its tuning", () => {
    const k = estimateKey(
      features(synthMusic({ bpm: 120, tonic: 7, mode: "major", seconds: 20, detune: 30 })),
    );
    expect(k.name).toBe("G major");
    expect(Math.abs(k.tuningCents - 30)).toBeLessThanOrEqual(3);
  });
  it("claims nothing for silence", () => {
    const k = estimateKey(features([new Float32Array(44_100 * 10)]));
    expect(k.key).toBeUndefined();
  });
});

describe("tempo", { timeout: 60_000 }, () => {
  it("finds steady tempos to 0.1 BPM, at the kick's level", () => {
    for (const [i, bpm] of [128, 90, 174, 100, 140, 75, 122.5, 160, 85, 110, 95, 150].entries()) {
      const t = estimateTempo(
        features(synthMusic({ bpm, tonic: i % 12, mode: i % 2 ? "major" : "minor", seconds: 30 })),
      );
      expect(t.bpm).toBeCloseTo(bpm, 1);
      expect(t.half).toBeCloseTo(bpm / 2, 1);
      expect(t.double).toBeCloseTo(bpm * 2, 1);
      expect(t.range).toBeUndefined();
    }
  });
  it("offers the tempo at half or double where the level is ambiguous (60, 200)", () => {
    for (const bpm of [60, 200]) {
      const t = estimateTempo(features(synthMusic({ bpm, tonic: 2, mode: "major", seconds: 30 })));
      const all = [t.bpm, t.half, t.double].map((v) => Math.round((v ?? 0) * 10) / 10);
      expect(all).toContain(bpm);
    }
  });
  it("averages a tempo that moves, and gives its range", () => {
    const t = estimateTempo(
      features(synthMusic({ bpm: 116, bpmEnd: 124, tonic: 2, mode: "major", seconds: 60 })),
    );
    expect(Math.abs((t.bpm ?? 0) - 120)).toBeLessThan(0.6);
    expect(t.range?.min).toBeLessThan(118);
    expect(t.range?.max).toBeGreaterThan(121.5);
  });
  it("finds no beat in noise or silence", () => {
    let s = 12_345;
    const noise = new Float32Array(44_100 * 20);
    for (let i = 0; i < noise.length; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      noise[i] = (s / 2 ** 32 - 0.5) * 0.3;
    }
    expect(estimateTempo(features([noise])).bpm).toBeUndefined();
    expect(estimateTempo(features([new Float32Array(44_100 * 20)])).bpm).toBeUndefined();
  });
  it("reads 48 kHz and 22.05 kHz sound the same way", () => {
    for (const rate of [48_000, 22_050]) {
      const f = features(
        synthMusic({ bpm: 128, tonic: 9, mode: "minor", seconds: 30, rate }),
        rate,
      );
      expect(estimateTempo(f).bpm).toBeCloseTo(128, 1);
      expect(estimateKey(f).name).toBe("A minor");
    }
  });
});
