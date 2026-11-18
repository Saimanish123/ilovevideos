import { describe, expect, it } from "vitest";
import { fadeFilter, fadeGain, fitFades } from "@/tools/engines/sound/dsp/fade";
import { Limiter } from "@/tools/engines/sound/dsp/limiter";
import {
  formatLevel,
  gatedLoudness,
  kWeighting,
  LoudnessMeter,
  toDb,
} from "@/tools/engines/sound/dsp/loudness";
import {
  findPauses,
  keptSpans,
  LevelWindows,
  silenceCuts,
  snapToFrames,
  suggestThreshold,
} from "@/tools/engines/sound/dsp/silence";
import { TruePeakChannel } from "@/tools/engines/sound/dsp/true-peak";

/** `seconds` of a sine at `hz`, peak `amp`, in `channels` identical planes. */
function sine(rate: number, hz: number, amp: number, seconds: number, channels = 2, phase = 0) {
  const n = Math.round(rate * seconds);
  const plane = new Float32Array(n);
  for (let i = 0; i < n; i++) plane[i] = amp * Math.sin((2 * Math.PI * hz * i) / rate + phase);
  return Array.from({ length: channels }, () => plane.slice());
}

/** Feeds planes to a meter in 1024-frame blocks, as a decoder would. */
function measure(planes: Float32Array[], rate: number) {
  const m = new LoudnessMeter(rate, planes.length);
  const n = planes[0]?.length ?? 0;
  for (let i = 0; i < n; i += 1024)
    m.push(
      planes.map((p) => p.subarray(i, Math.min(n, i + 1024))),
      Math.min(1024, n - i),
    );
  return m.result();
}

describe("loudness (BS.1770-4 / EBU R128)", () => {
  it("derives the BS.1770 K-weighting coefficients at 48 kHz", () => {
    const [shelf, hp] = kWeighting(48_000);
    expect(shelf.b0).toBeCloseTo(1.53512485958697, 9);
    expect(shelf.b1).toBeCloseTo(-2.69169618940638, 9);
    expect(shelf.b2).toBeCloseTo(1.19839281085285, 9);
    expect(shelf.a1).toBeCloseTo(-1.69065929318241, 9);
    expect(shelf.a2).toBeCloseTo(0.73248077421585, 9);
    expect(hp.a1).toBeCloseTo(-1.99004745483398, 9);
    expect(hp.a2).toBeCloseTo(0.99007225036621, 9);
  });

  it("reads a stereo 1 kHz sine at −23 dBFS as −23.0 LUFS (EBU Tech 3341 case 1)", () => {
    for (const rate of [48_000, 44_100]) {
      const r = measure(sine(rate, 1000, 10 ** (-23 / 20), 20), rate);
      expect(r.integrated).toBeGreaterThan(-23.1);
      expect(r.integrated).toBeLessThan(-22.9);
      expect(r.samplePeak).toBeCloseTo(-23, 1);
    }
  });

  it("weighs mono as one channel: the same sine reads 3 dB lower", () => {
    const r = measure(sine(48_000, 1000, 10 ** (-23 / 20), 10, 1), 48_000);
    expect(r.integrated).toBeCloseTo(-26.01, 1);
  });

  it("gates quiet passages out relative to the programme (Tech 3341 case 3)", () => {
    const rate = 48_000;
    const quiet = sine(rate, 1000, 10 ** (-36 / 20), 10);
    const loud = sine(rate, 1000, 10 ** (-23 / 20), 60);
    const joined = quiet.map((q, c) => {
      const out = new Float32Array(q.length * 2 + (loud[c]?.length ?? 0));
      out.set(q, 0);
      out.set(loud[c] ?? [], q.length);
      out.set(q, q.length + (loud[c]?.length ?? 0));
      return out;
    });
    const r = measure(joined, rate);
    expect(r.integrated).toBeGreaterThan(-23.1);
    expect(r.integrated).toBeLessThan(-22.9);
  });

  it("reports silence and very short sounds as unmeasurable", () => {
    expect(gatedLoudness([])).toBe(Number.NEGATIVE_INFINITY);
    const r = measure([new Float32Array(48_000), new Float32Array(48_000)], 48_000);
    expect(r.integrated).toBe(Number.NEGATIVE_INFINITY);
    expect(measure(sine(48_000, 1000, 0.5, 0.3), 48_000).integrated).toBe(Number.NEGATIVE_INFINITY);
  });

  it("finds the inter-sample peak a sample peak misses", () => {
    // A sine at a quarter of the sample rate, 45° out of phase: samples land at ±0.707 of the peak.
    const rate = 48_000;
    const planes = sine(rate, rate / 4, 0.5, 1, 1, Math.PI / 4);
    const r = measure(planes, rate);
    expect(r.samplePeak).toBeCloseTo(-9.03, 1);
    expect(Math.abs(r.truePeak - toDb(0.5))).toBeLessThan(0.2);
    // Never below the sample peak, on any signal.
    const tp = new TruePeakChannel();
    const noise = new Float32Array(4096).map((_, i) => Math.sin(i * 12.9898) * 0.3);
    tp.push(noise);
    tp.flush();
    expect(tp.peak).toBeGreaterThanOrEqual(Math.max(...Array.from(noise, Math.abs)) - 1e-9);
  });

  it("formats levels with a real minus sign and one decimal", () => {
    expect(formatLevel(-16.04, "LUFS")).toBe("−16.0\u00a0LUFS");
    expect(formatLevel(3.26, "dB")).toBe("+3.3\u00a0dB");
    expect(formatLevel(Number.NEGATIVE_INFINITY, "LUFS")).toBe("silent");
  });
});

describe("limiter", () => {
  const run = (planes: Float32Array[], rate: number, ceiling: number, block = 1000) => {
    const lim = new Limiter(planes.length, rate, ceiling);
    const n = planes[0]?.length ?? 0;
    const out = planes.map(() => [] as number[]);
    const take = (p: Float32Array[]) =>
      p.forEach((x, c) => {
        out[c]?.push(...x);
      });
    for (let i = 0; i < n; i += block)
      take(
        lim.process(
          planes.map((p) => p.subarray(i, Math.min(n, i + block))),
          Math.min(block, n - i),
        ),
      );
    take(lim.flush());
    return { out: out.map((o) => Float32Array.from(o)), lim };
  };

  it("leaves a signal under the ceiling untouched, sample for sample, with no delay", () => {
    const planes = sine(44_100, 440, 0.4, 0.5);
    const { out, lim } = run(planes, 44_100, 0.9);
    expect(out[0]?.length).toBe(planes[0]?.length);
    expect(lim.minGain).toBe(1);
    for (let i = 0; i < 2000; i++) expect(out[0]?.[i]).toBeCloseTo(planes[0]?.[i] ?? 0, 6);
  });

  it("holds the oversampled peak at the ceiling and keeps the length", () => {
    const rate = 48_000;
    const planes = sine(rate, 997, 1.6, 1);
    const ceiling = 10 ** (-1 / 20);
    const { out, lim } = run(planes, rate, ceiling, 777);
    expect(out[0]?.length).toBe(planes[0]?.length);
    expect(lim.minGain).toBeLessThan(0.6);
    const r = measure(out, rate);
    expect(r.truePeak).toBeLessThanOrEqual(-1 + 0.05);
    // Still loud: the limiter turns peaks down, it does not mute.
    expect(r.samplePeak).toBeGreaterThan(-1.6);
  });
});

describe("fades", () => {
  it("rises and falls with the chosen curve", () => {
    const f = { fadeIn: 2, fadeOut: 4, curve: "smooth" as const };
    expect(fadeGain(0, 10, f)).toBe(0);
    expect(fadeGain(1, 10, f)).toBeCloseTo(Math.SQRT1_2, 6);
    expect(fadeGain(5, 10, f)).toBe(1);
    expect(fadeGain(8, 10, f)).toBeCloseTo(Math.SQRT1_2, 6);
    expect(fadeGain(10, 10, f)).toBe(0);
    expect(fadeGain(1, 10, { ...f, curve: "linear" })).toBeCloseTo(0.5, 6);
  });

  it("fits fades longer than the sound, keeping their proportion", () => {
    const f = fitFades({ fadeIn: 6, fadeOut: 2, curve: "linear" }, 4);
    expect(f.fadeIn).toBeCloseTo(3);
    expect(f.fadeOut).toBeCloseTo(1);
  });

  it("writes the same fades as an ffmpeg afade chain", () => {
    expect(fadeFilter({ fadeIn: 2, fadeOut: 3, curve: "smooth" }, 60)).toBe(
      "afade=t=in:d=2:curve=qsin,afade=t=out:st=57:d=3:curve=qsin",
    );
    expect(fadeFilter({ fadeIn: 0, fadeOut: 1.5, curve: "linear" }, 10)).toBe(
      "afade=t=out:st=8.5:d=1.5:curve=tri",
    );
  });
});

describe("silence detection", () => {
  /** Levels (dBFS per 10 ms): speech at −20 and pauses at −60, from [start, end, level] runs. */
  const levels = (runs: [number, number, number][]) => {
    const total = Math.round((runs.at(-1)?.[1] ?? 0) * 100);
    const out = new Float32Array(total);
    for (const [a, b, l] of runs) out.fill(l, Math.round(a * 100), Math.round(b * 100));
    return out;
  };
  const opts = { thresholdDb: -40, minSilence: 0.5, padding: 0.1 };

  it("cuts pauses of at least the minimum length, keeping padding on both sides", () => {
    const l = levels([
      [0, 2, -20],
      [2, 3, -60],
      [3, 4, -20],
      [4, 4.3, -60],
      [4.3, 6, -20],
    ]);
    const cuts = silenceCuts(l, opts, 6);
    expect(cuts).toHaveLength(1);
    expect(cuts[0]?.start).toBeCloseTo(2.1, 6);
    expect(cuts[0]?.end).toBeCloseTo(2.9, 6);
    expect(keptSpans(cuts, 6).map((s) => [s.start, s.end])).toEqual([
      [0, cuts[0]?.start],
      [cuts[0]?.end, 6],
    ]);
  });

  it("does not let a click break a pause, and trims leading and trailing silence to the edge", () => {
    const l = levels([
      [0, 1, -60],
      [1, 2, -20],
      [2, 2.5, -60],
      [2.5, 2.52, -10],
      [2.52, 3, -60],
      [3, 4, -20],
      [4, 5, -60],
    ]);
    const pauses = findPauses(l, opts);
    expect(pauses).toHaveLength(3);
    const cuts = silenceCuts(l, opts, 5);
    expect(cuts[0]).toEqual({ start: 0, end: expect.closeTo(0.9, 6) });
    expect(cuts[2]?.end).toBe(5);
  });

  it("suggests a threshold above the noise floor and snaps cuts to frames", () => {
    const l = levels([
      [0, 3, -20],
      [3, 4, -62],
    ]);
    expect(suggestThreshold(l)).toBeLessThanOrEqual(-30);
    const frames = Array.from({ length: 121 }, (_, i) => i / 30);
    const snapped = snapToFrames([{ start: 1.01, end: 2.02 }], frames);
    expect(snapped[0]?.start).toBeCloseTo(1, 6);
    expect(snapped[0]?.end).toBeCloseTo(2.0333, 3);
  });

  it("measures 10 ms windows across channels", () => {
    const w = new LevelWindows(1000);
    w.push([new Float32Array(25).fill(0.1), new Float32Array(25).fill(0.1)]);
    const out = w.finish();
    expect(out).toHaveLength(3);
    expect(out[0]).toBeCloseTo(-20, 3);
  });
});
