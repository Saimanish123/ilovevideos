import { describe, expect, it } from "vitest";
import { hann, RealFft } from "@/tools/engines/sound/dsp/fft";
import { OnsetFinder, PitchShifter, pitchRatio, shiftAll } from "@/tools/engines/sound/dsp/pitch";
import { resampleAll, SincResampler } from "@/tools/engines/sound/dsp/resample";

const RATE = 44_100;

function tone(hz: number, amp: number, n: number, rate = RATE) {
  const p = new Float32Array(n);
  for (let i = 0; i < n; i++) p[i] = amp * Math.sin((2 * Math.PI * hz * i) / rate);
  return p;
}

/** Frequency from rising zero crossings, interpolated, between two sample indexes. */
function zeroCrossingHz(p: Float32Array, from: number, to: number, rate = RATE) {
  let first = -1;
  let last = -1;
  let count = 0;
  for (let i = from; i < to - 1; i++) {
    const a = p[i] as number;
    const b = p[i + 1] as number;
    if (a <= 0 && b > 0) {
      const t = i + a / (a - b);
      if (first < 0) first = t;
      else count++;
      last = t;
    }
  }
  return (count / (last - first)) * rate;
}

/** Least-squares fit of a sine at `hz`: its amplitude and the residual's level relative to it. */
function fit(p: Float32Array, hz: number, from: number, to: number, rate = RATE) {
  let ss = 0;
  let sc = 0;
  let cc = 0;
  let ys = 0;
  let yc = 0;
  for (let i = from; i < to; i++) {
    const s = Math.sin((2 * Math.PI * hz * i) / rate);
    const c = Math.cos((2 * Math.PI * hz * i) / rate);
    const y = p[i] as number;
    ss += s * s;
    sc += s * c;
    cc += c * c;
    ys += y * s;
    yc += y * c;
  }
  const det = ss * cc - sc * sc;
  const a = (ys * cc - yc * sc) / det;
  const b = (yc * ss - ys * sc) / det;
  let err = 0;
  let sig = 0;
  for (let i = from; i < to; i++) {
    const f =
      a * Math.sin((2 * Math.PI * hz * i) / rate) + b * Math.cos((2 * Math.PI * hz * i) / rate);
    err += ((p[i] as number) - f) ** 2;
    sig += f * f;
  }
  return { amp: Math.hypot(a, b), residualDb: 10 * Math.log10(err / sig) };
}

/** Share of a long spectrum's energy outside ±4 bins of the given partials, dB. */
function outsideDb(p: Float32Array, partials: number[], offset: number) {
  const n = 65_536;
  const fft = new RealFft(n);
  const w = hann(n);
  const frame = new Float64Array(n);
  for (let i = 0; i < n; i++) frame[i] = (p[offset + i] ?? 0) * (w[i] as number);
  const re = new Float64Array(n / 2 + 1);
  const im = new Float64Array(n / 2 + 1);
  fft.forward(frame, re, im);
  const bin = RATE / n;
  const mark = new Uint8Array(n / 2 + 1);
  for (const hz of partials) {
    const c = Math.round(hz / bin);
    for (let k = c - 4; k <= c + 4; k++) mark[k] = 1;
  }
  let inside = 0;
  let total = 0;
  for (let k = 1; k <= n / 2; k++) {
    const e = (re[k] as number) ** 2 + (im[k] as number) ** 2;
    total += e;
    if (mark[k]) inside += e;
  }
  return 10 * Math.log10((total - inside) / total);
}

/**
 * Clicks every 0.5 s (a 1.8 kHz burst decaying over 2 ms) over a 220 Hz tone: the echo of each
 * click in the 40 ms before it, relative to the click (dB), and when the click reaches −6 dB (ms).
 */
function clickTrain(seconds: number) {
  const n = RATE * seconds;
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const m = i % 22_050;
    x[i] =
      (m < 441 ? 0.8 * Math.exp(-m / 88) * Math.sin((2 * Math.PI * 1800 * i) / RATE) : 0) +
      0.2 * Math.sin((2 * Math.PI * 220 * i) / RATE);
  }
  return x;
}
function attackStats(y: Float32Array, clicks: number) {
  const d = new Float32Array(y.length);
  for (let i = 1; i < y.length; i++) d[i] = (y[i] as number) - (y[i - 1] as number);
  const env = (c: number) => {
    let e = 0;
    for (let i = c; i < c + 88; i++) e += (d[i] ?? 0) ** 2;
    return e;
  };
  let pre = Number.NEGATIVE_INFINITY;
  let late = 0;
  for (let k = 1; k <= clicks; k++) {
    const on = k * 22_050;
    let peak = 0;
    for (let c = on; c < on + 441; c += 22) peak = Math.max(peak, env(c));
    let echo = 0;
    for (let c = on - 1764; c < on - 220; c += 22) echo = Math.max(echo, env(c));
    pre = Math.max(pre, 10 * Math.log10(echo / peak));
    let t = on;
    for (let c = on - 2205; c < on + 441; c += 4)
      if (env(c) > peak / 4) {
        t = c;
        break;
      }
    late = Math.max(late, Math.abs((t + 88 - on) / 44.1));
  }
  return { pre, late };
}

describe("real FFT", () => {
  it("matches a direct DFT and inverts exactly", () => {
    const n = 64;
    const x = Array.from({ length: n }, (_, i) => Math.sin(i * 0.7) + 0.01 * i * i - 0.3);
    const fft = new RealFft(n);
    const re = new Float64Array(n / 2 + 1);
    const im = new Float64Array(n / 2 + 1);
    fft.forward(x, re, im);
    for (let k = 0; k <= n / 2; k++) {
      let r = 0;
      let i2 = 0;
      for (let t = 0; t < n; t++) {
        r += (x[t] as number) * Math.cos((2 * Math.PI * k * t) / n);
        i2 -= (x[t] as number) * Math.sin((2 * Math.PI * k * t) / n);
      }
      expect(re[k]).toBeCloseTo(r, 9);
      expect(im[k]).toBeCloseTo(i2, 9);
    }
    const back = new Float64Array(n);
    fft.inverse(re, im, back);
    for (let t = 0; t < n; t++) expect(back[t]).toBeCloseTo(x[t] as number, 12);
  });
});

describe("band-limited resampler", () => {
  it("44.1 → 48 kHz keeps a 1 kHz tone exact in level, with the residual under −100 dB", () => {
    const [out] = resampleAll([tone(1000, 0.5, RATE * 2)], RATE / 48_000);
    expect(out?.length).toBe(96_000);
    const r = fit(out as Float32Array, 1000, 4800, 91_200, 48_000);
    expect(r.amp).toBeCloseTo(0.5, 4);
    expect(r.residualDb).toBeLessThan(-100);
  });

  it("keeps the passband flat to 0.9 of the lower Nyquist and removes what cannot be held", () => {
    // 44.1 → 22.05 kHz: 9 kHz stays (−0.01 dB at most), 15 kHz would fold to 7.05 kHz and must go.
    const [pass] = resampleAll([tone(9000, 0.5, RATE)], 2);
    expect(fit(pass as Float32Array, 9000, 2000, 20_000, 22_050).amp).toBeGreaterThan(0.4994);
    const [stop] = resampleAll([tone(15_000, 0.5, RATE)], 2);
    let peak = 0;
    for (let i = 2000; i < 20_000; i++)
      peak = Math.max(peak, Math.abs((stop as Float32Array)[i] ?? 0));
    expect(20 * Math.log10(peak / 0.5)).toBeLessThan(-90);
  });

  it("gives the same samples in any block size", () => {
    const x = tone(440, 0.5, 10_000);
    const [whole] = resampleAll([x], 0.91);
    const r = new SincResampler(0.91, 1);
    const parts: number[] = [];
    for (let i = 0; i < x.length; i += 333)
      parts.push(...(r.process([x.subarray(i, i + 333)])[0] ?? []));
    parts.push(...(r.flush()[0] ?? []));
    expect(parts.length).toBe(whole?.length);
    for (let i = 0; i < parts.length; i += 97)
      expect(parts[i]).toBeCloseTo((whole as Float32Array)[i] as number, 6);
  });
});

describe("pitch shifter", () => {
  it("lands tones within 0.01 cent of the target and keeps their level and length exactly", () => {
    const n = RATE * 4 + 123;
    for (const [semi, cents, hz] of [
      [1, 0, 440],
      [-1, 0, 440],
      [7, 0, 440],
      [12, 0, 440],
      [-12, 0, 440],
      [5, 37, 440],
      [-7, -23, 1000],
      [3, 0, 110],
    ] as const) {
      const src = tone(hz, 0.5, n);
      const [out] = shiftAll([src, src], RATE, semi, cents);
      expect(out?.length).toBe(n);
      const want = hz * pitchRatio(semi, cents);
      const got = zeroCrossingHz(out as Float32Array, RATE, 3 * RATE);
      expect(Math.abs(1200 * Math.log2(got / want))).toBeLessThan(0.01);
      const f = fit(out as Float32Array, got, RATE, 3 * RATE);
      expect(f.amp).toBeCloseTo(0.5, 2);
      // Nothing but the tone: no clicks, no modulation.
      expect(f.residualDb).toBeLessThan(-90);
    }
  });

  it("is aligned with the source (no delay) and full level from the first sample", () => {
    const src = tone(440, 0.5, RATE);
    const [out] = shiftAll([src], RATE, 3);
    let head = 0;
    for (let i = 0; i < 2000; i++) head = Math.max(head, Math.abs((out as Float32Array)[i] ?? 0));
    expect(head).toBeGreaterThan(0.49);
    // A burst starting at 0.5 s starts at 0.5 s.
    const burst = new Float32Array(RATE * 2);
    for (let i = RATE / 2; i < burst.length; i++)
      burst[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / RATE);
    for (const semi of [3, -5, 12]) {
      const [y] = shiftAll([burst], RATE, semi);
      let first = 0;
      while (Math.abs((y as Float32Array)[first] ?? 0) < 0.05) first++;
      expect(Math.abs(first / RATE - 0.5)).toBeLessThan(0.005);
    }
  });

  it("keeps attacks as sharp as the source, where a plain vocoder smears them", () => {
    const x = clickTrain(6);
    const source = attackStats(x, 10);
    for (const semi of [3, -5]) {
      const kept = attackStats(shiftAll([x], RATE, semi)[0] as Float32Array, 10);
      const plain = attackStats(shiftAll([x], RATE, semi, 0, false)[0] as Float32Array, 10);
      expect(kept.pre).toBeLessThan(source.pre + 2.5);
      expect(kept.late).toBeLessThan(1);
      // The measurement can tell: without attack handling the echo is about 11 dB under the click.
      expect(plain.pre).toBeGreaterThan(-14);
    }
  });

  it("keeps a steady tone under attacks at a steady level", () => {
    const x = clickTrain(4);
    for (const semi of [3, -5, 12]) {
      const [y] = shiftAll([x], RATE, semi);
      const hz = 220 * pitchRatio(semi);
      const w = Math.round(RATE / hz) * 4;
      for (let c = 22_050; c < RATE * 3; c += 64) {
        const after = (c % 22_050) / 44.1;
        if (after < 25 || after > 490 - w / 44.1) continue;
        const a = fit(y as Float32Array, hz, c, c + w).amp;
        expect(a).toBeGreaterThan(0.199);
        expect(a).toBeLessThan(0.201);
      }
    }
  });

  it("keeps a note's harmonics clean (energy off the partials under −45 dB)", () => {
    const n = RATE * 3;
    const base = [1, 2, 3, 4, 5, 6, 7, 8].map((h) => 220 * h);
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++)
      for (const [j, f] of base.entries())
        x[i] = (x[i] as number) + (0.1 / (j + 1)) * Math.sin((2 * Math.PI * f * i) / RATE + j);
    for (const semi of [3, 7, 12, -5, -12]) {
      const [y] = shiftAll([x], RATE, semi);
      expect(
        outsideDb(
          y as Float32Array,
          base.map((f) => f * pitchRatio(semi)),
          22_050,
        ),
      ).toBeLessThan(-45);
    }
  });

  it("leaves stereo centred and gives the same output in any block size", () => {
    const n = RATE * 2;
    const l = tone(330, 0.4, n);
    const [ml, mr] = shiftAll([l, l.slice()], RATE, 4);
    for (let i = 0; i < n; i += 101)
      expect((ml as Float32Array)[i]).toBeCloseTo((mr as Float32Array)[i] as number, 6);
    const s = new PitchShifter({ sampleRate: RATE, channels: 1, semitones: -3 });
    const parts: number[] = [];
    for (let i = 0; i < n; i += 1000)
      parts.push(...(s.process([l.subarray(i, i + 1000)], Math.min(1000, n - i))[0] ?? []));
    parts.push(...(s.flush()[0] ?? []));
    const [whole] = shiftAll([l], RATE, -3);
    expect(parts.length).toBe(n);
    for (let i = 0; i < n; i += 97)
      expect(parts[i]).toBeCloseTo((whole as Float32Array)[i] as number, 5);
  });

  it("finds attacks to the sample", () => {
    const f = new OnsetFinder(RATE);
    f.push(clickTrain(3));
    // The bursts start at sin(0) = 0, so the first step is one sample in.
    expect(f.onsets).toEqual([22_051, 44_101, 66_151, 88_201, 110_251]);
  });

  it("keeps the exact length of very short sounds, shorter than one frame", () => {
    for (const n of [1, 100, 2205, 4095, 4097]) {
      for (const semi of [5, -7]) {
        const [y] = shiftAll([tone(440, 0.5, n), tone(440, 0.5, n)], RATE, semi);
        expect(y?.length).toBe(n);
        for (const v of y as Float32Array) expect(Number.isFinite(v)).toBe(true);
      }
    }
  });

  it("handles 5.1 and 22.05 kHz sound", () => {
    const n = 22_050 * 2;
    const planes = Array.from({ length: 6 }, (_, c) => tone(220 * (c + 1), 0.2, n, 22_050));
    const out = shiftAll(planes, 22_050, 12);
    expect(out.length).toBe(6);
    expect(out[0]?.length).toBe(n);
    expect(
      Math.abs(
        1200 * Math.log2(zeroCrossingHz(out[0] as Float32Array, 11_025, 33_075, 22_050) / 440),
      ),
    ).toBeLessThan(0.05);
  });

  it("passes the sound through untouched at 0 semitones", () => {
    const x = tone(440, 0.5, 5000);
    const [y] = shiftAll([x], RATE, 0);
    expect(Array.from(y as Float32Array)).toEqual(Array.from(x));
  });
});
