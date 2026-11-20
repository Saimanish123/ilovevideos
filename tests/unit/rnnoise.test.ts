import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { resampleAll } from "@/tools/engines/sound/dsp/resample";
import {
  DenoiseProcessor,
  instantiateRnnoise,
  RNNOISE_DELAY,
  RNNOISE_FRAME,
  type Rnnoise,
  residualDb,
} from "@/tools/engines/sound/dsp/rnnoise";
import {
  denoiseFilter,
  makeupGain,
  SpeechDenoiseOptions,
  strengthWords,
} from "@/tools/engines/speech-denoise/options";
import { SPEECH_MODELS } from "@/tools/workers/speech-models";
import { readWav16, segmentsOf } from "./speech-wav";

const bytes = readFileSync(`public${SPEECH_MODELS.rnnoise.path}`);
let rn: Rnnoise;
beforeAll(async () => {
  rn = await instantiateRnnoise(bytes);
});

/** Runs a processor over planes in blocks of `block` frames; returns the joined output. */
function run(p: DenoiseProcessor, planes: Float32Array[], block: number): Float32Array[] {
  const parts: Float32Array[][] = [];
  const n = planes[0]?.length ?? 0;
  for (let i = 0; i < n; i += block) {
    const b = planes.map((q) => q.slice(i, i + block));
    parts.push(p.process(b, b[0]?.length ?? 0));
  }
  parts.push(p.flush());
  return planes.map((_, c) => {
    const total = parts.reduce((s, q) => s + (q[c]?.length ?? 0), 0);
    const out = new Float32Array(total);
    let at = 0;
    for (const q of parts) {
      out.set(q[c] ?? new Float32Array(0), at);
      at += q[c]?.length ?? 0;
    }
    return out;
  });
}

const segs = segmentsOf("tests/fixtures/speech/speech-fan.json");
/** dB of the samples in the pauses (outside speech, 50 ms clear) or in the speech. */
function level(x: Float32Array, rate: number, inside: boolean) {
  let s = 0;
  let n = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / rate;
    const ok = inside
      ? segs.some((g) => t >= g.start + 0.05 && t < g.end - 0.05)
      : !segs.some((g) => t >= g.start - 0.05 && t < g.end + 0.05);
    if (!ok) continue;
    s += (x[i] as number) ** 2;
    n++;
  }
  return 10 * Math.log10(s / n);
}
/** Lag (samples) of the best match of `b` against `a`, within ±maxLag. */
function lag(a: Float32Array, b: Float32Array, maxLag: number) {
  let best = 0;
  let bestV = -Infinity;
  for (let l = -maxLag; l <= maxLag; l++) {
    let v = 0;
    for (let i = maxLag; i < a.length - maxLag; i++) v += (a[i] as number) * (b[i + l] ?? 0);
    if (v > bestV) {
      bestV = v;
      best = l;
    }
  }
  return best;
}

describe("RNNoise 0.2 noise removal", () => {
  it("ships the expected module", () => {
    expect(bytes.length).toBe(SPEECH_MODELS.rnnoise.bytes);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(SPEECH_MODELS.rnnoise.sha256);
  });

  it("removes a fan from under a voice, in time and to the sample", () => {
    const { rate, x } = readWav16("tests/fixtures/speech/speech-fan.wav");
    const p = new DenoiseProcessor(rn, { sampleRate: rate, channels: 1, strength: 1 });
    const [out] = run(p, [x], 4096) as [Float32Array];
    expect(out.length).toBe(x.length);
    // RNNoise's own 20 ms delay is taken out exactly: output frame i is RNNoise's frame i + 960.
    const raw = new Float32Array(x.length + 2 * RNNOISE_DELAY);
    const st = rn.create();
    const frame = new Float32Array(RNNOISE_FRAME);
    for (let i = 0; i + RNNOISE_FRAME <= raw.length; i += RNNOISE_FRAME) {
      const input = new Float32Array(RNNOISE_FRAME);
      input.set(x.subarray(i, i + RNNOISE_FRAME));
      rn.process(st, input, frame);
      raw.set(frame, i);
    }
    rn.destroy(st);
    expect(out).toEqual(raw.slice(RNNOISE_DELAY, RNNOISE_DELAY + x.length));
    // That 960 is the delay: on recorded speech the output's correlation peak with the clean voice
    // is at lag 0 (scratch measurement); on this synthetic voice the band gains move it by ~10
    // samples (0.2 ms), far from the ±480 a wrong compensation would show.
    expect(Math.abs(lag(x, out, 1500))).toBeLessThanOrEqual(16);
    expect(level(x, rate, false) - level(out, rate, false)).toBeGreaterThan(30);
    expect(Math.abs(level(out, rate, true) - level(x, rate, true))).toBeLessThan(2);
  });

  it("works through the resampler at 44.1 kHz, stereo, in odd block sizes", () => {
    const { x } = readWav16("tests/fixtures/speech/speech-fan.wav");
    const [y] = resampleAll([x], 48_000 / 44_100) as [Float32Array];
    const p = new DenoiseProcessor(rn, { sampleRate: 44_100, channels: 2, strength: 1 });
    const [l, r] = run(p, [y, y.slice()], 1001) as [Float32Array, Float32Array];
    expect(l.length).toBe(y.length);
    expect(r.length).toBe(y.length);
    expect(Math.abs(lag(y, l, 1500))).toBeLessThanOrEqual(16);
    expect(level(y, 44_100, false) - level(l, 44_100, false)).toBeGreaterThan(30);
    // Two identical channels come out identical (one state each, same input).
    expect(r).toEqual(l);
  });

  it("mixes the original back in at a lower strength", () => {
    const { rate, x } = readWav16("tests/fixtures/speech/speech-fan.wav");
    const p = new DenoiseProcessor(rn, { sampleRate: rate, channels: 1, strength: 0.9 });
    const [out] = run(p, [x], 4096) as [Float32Array];
    const drop = level(x, rate, false) - level(out, rate, false);
    expect(drop).toBeGreaterThan(18);
    expect(drop).toBeLessThan(21);
    expect(residualDb(0.9)).toBeCloseTo(-20, 5);
    expect(residualDb(1)).toBe(Number.NEGATIVE_INFINITY);
  });

  it("keeps a very short sound's length", () => {
    const x = new Float32Array(300).map((_, i) => Math.sin(i / 7) * 0.1);
    const p = new DenoiseProcessor(rn, { sampleRate: 22_050, channels: 1, strength: 1 });
    const [out] = run(p, [x], 4096) as [Float32Array];
    expect(out.length).toBe(300);
  });
});

describe("noise removal options", () => {
  it("defaults to full strength with the loudness kept", () => {
    expect(SpeechDenoiseOptions.parse({})).toEqual({
      strength: 100,
      keepLoudness: true,
      output: "auto",
    });
    expect(strengthWords(100)).toBe("noise removed");
    expect(strengthWords(90)).toBe("noise 20 dB down");
  });

  it("brings the loudness back up, never down, and not beyond 12 dB", () => {
    expect(makeupGain(true, { integrated: -20 }, { integrated: -23 })).toBeCloseTo(3);
    expect(makeupGain(true, { integrated: -20 }, { integrated: -18 })).toBe(0);
    expect(makeupGain(true, { integrated: -20 }, { integrated: -60 })).toBe(12);
    expect(makeupGain(false, { integrated: -20 }, { integrated: -23 })).toBe(0);
    expect(makeupGain(true, { integrated: -20 }, { integrated: Number.NEGATIVE_INFINITY })).toBe(0);
  });

  it("states the equivalent ffmpeg filter", () => {
    const o = SpeechDenoiseOptions.parse({ strength: 85 });
    expect(denoiseFilter(o, 0)).toBe("arnndn=m=rnnoise-model.rnnn:mix=0.85");
    expect(denoiseFilter(o, 2.5)).toBe(
      "arnndn=m=rnnoise-model.rnnn:mix=0.85,volume=2.50dB,alimiter=limit=0.891",
    );
  });
});

describe("the result line when the loudness is kept", () => {
  const base = {
    limitedDb: 0,
    codec: "AAC",
    layout: "48 kHz mono",
    picture: true,
    otherTracks: 0,
  };
  it("says it was kept when the output is within 0.5 dB", async () => {
    const { resultMeta } = await import("@/tools/engines/sound/facts");
    expect(
      resultMeta({
        ...base,
        before: { integrated: -21.8, truePeak: -9 },
        after: { integrated: -21.6, truePeak: -8.9 },
        kept: { gainDb: 0.8, maxGainDb: 12 },
      }),
    ).toMatch(/^loudness kept at −21\.6\u00a0LUFS · true peak/);
  });

  it("says when the gain it may add ran out, with both numbers", async () => {
    const { resultMeta } = await import("@/tools/engines/sound/facts");
    // A file that was mostly noise: cleaned to −72 LUFS, raised by the full 12 dB, still far below.
    expect(
      resultMeta({
        ...base,
        before: { integrated: -40.6, truePeak: -20 },
        after: { integrated: -60.1, truePeak: -36.4 },
        kept: { gainDb: 12, maxGainDb: 12 },
      }),
    ).toMatch(
      /^loudness raised 12\u00a0dB, the most it adds · −40\.6\u00a0LUFS → −60\.1\u00a0LUFS · true peak/,
    );
  });

  it("says when nothing was left to raise, and gives plain numbers otherwise", async () => {
    const { resultMeta } = await import("@/tools/engines/sound/facts");
    expect(
      resultMeta({
        ...base,
        before: { integrated: -40, truePeak: -20 },
        after: { integrated: Number.NEGATIVE_INFINITY, truePeak: -80 },
        kept: { gainDb: 0, maxGainDb: 12 },
      }),
    ).toMatch(/^nothing loud enough left to raise · −40\.0\u00a0LUFS → silent/);
    expect(
      resultMeta({
        ...base,
        before: { integrated: -21.8, truePeak: -9 },
        after: { integrated: -23, truePeak: -8.9 },
        kept: { gainDb: 3, maxGainDb: 12 },
      }),
    ).toMatch(/^Measured: −21\.8\u00a0LUFS → −23\.0\u00a0LUFS/);
  });
});
