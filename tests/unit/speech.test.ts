import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { planCuts, RemoveSilenceOptions } from "@/tools/engines/remove-silence/options";
import { LevelWindows } from "@/tools/engines/sound/dsp/silence";
import { readSafetensors, SileroVad, VAD_FRAME_SEC } from "@/tools/engines/sound/dsp/silero-vad";
import { speechPauses, speechShare, VadFeed } from "@/tools/engines/sound/dsp/speech";
import { SPEECH_MODELS } from "@/tools/workers/speech-models";
import { readWav16, segmentsOf } from "./speech-wav";

const vad = () =>
  new SileroVad(readSafetensors(new Uint8Array(readFileSync(`public${SPEECH_MODELS.vad.path}`))));

/** Probabilities from runs of [value, frames]. */
const probs = (...runs: [number, number][]) =>
  Float32Array.from(runs.flatMap(([v, n]) => Array.from({ length: n }, () => v)));

describe("speech pauses", () => {
  it("finds runs of non-speech, with Silero's hysteresis", () => {
    // 10 frames quiet, 20 speech, a dip to 0.4 (still speech: above 0.35), 20 quiet, 10 speech.
    const p = probs([0.1, 10], [0.9, 20], [0.4, 3], [0.9, 5], [0.1, 20], [0.8, 10]);
    const d = p.length * VAD_FRAME_SEC;
    const pauses = speechPauses(p, { minSilence: 0.3 }, d);
    expect(pauses.map((q) => [q.start, q.end].map((t) => Math.round(t / VAD_FRAME_SEC)))).toEqual([
      [0, 10],
      [38, 58],
    ]);
    // A pause shorter than the minimum is left alone.
    expect(speechPauses(p, { minSilence: 0.7 }, d)).toHaveLength(0);
  });

  it("counts a trailing pause to the end of the sound", () => {
    const p = probs([0.9, 10], [0.05, 30]);
    const pauses = speechPauses(p, { minSilence: 0.5 }, 1.2);
    expect(pauses).toHaveLength(1);
    expect(pauses[0]?.end).toBe(1.2);
  });

  it("finds the known pauses of a voice over a fan at 48 kHz", () => {
    const { rate, x } = readWav16("tests/fixtures/speech/speech-fan.wav");
    const feed = new VadFeed(vad(), rate);
    for (let i = 0; i < x.length; i += 4096) feed.push([x.subarray(i, i + 4096)]);
    const p = feed.finish();
    expect(p.length).toBe(Math.ceil(((x.length / rate) * 16_000) / 512));
    const segs = segmentsOf("tests/fixtures/speech/speech-fan.json");
    // Frame decisions against the known speech segments.
    let right = 0;
    p.forEach((v, i) => {
      const t = (i + 0.5) * VAD_FRAME_SEC;
      const truth = segs.some((s) => t >= s.start && t < s.end);
      if (v >= 0.5 === truth) right++;
    });
    // 89% on this synthetic voice with the fan 5 dB under it (the first word is heard 0.2 s late).
    expect(right / p.length).toBeGreaterThan(0.85);
    // The 1.3 s gap between the two phrases is found within 0.25 s of where it is (late at both
    // ends: the model holds on to speech a little after it stops, which keeps word ends).
    const gap = { start: segs[0]?.end ?? 0, end: segs[1]?.start ?? 0 };
    const found = speechPauses(p, { minSilence: 0.5 }, x.length / rate).find(
      (q) => q.start > 1 && q.end < 5.5,
    );
    expect(found).toBeDefined();
    expect(Math.abs((found?.start ?? 0) - gap.start)).toBeLessThan(0.25);
    expect(Math.abs((found?.end ?? 0) - gap.end)).toBeLessThan(0.25);
  });

  it("cuts by speech where a level threshold cannot, and falls back on a file without speech", () => {
    const { rate, x } = readWav16("tests/fixtures/speech/speech-fan.wav");
    const feed = new VadFeed(vad(), rate);
    const lw = new LevelWindows(rate);
    feed.push([x]);
    lw.push([x]);
    const speech = feed.finish();
    const levels = lw.finish();
    const d = x.length / rate;
    const o = RemoveSilenceOptions.parse({});
    expect(o.detect).toBe("speech");
    const bySpeech = planCuts(o, levels, d, speech);
    expect(bySpeech.detect).toBe("speech");
    // The lead-in and the gap between the phrases (the 0.6 s tail is heard as 0.24 s: kept).
    expect(bySpeech.cuts).toHaveLength(2);
    const byLevel = planCuts({ ...o, detect: "level" }, levels, d);
    expect(byLevel.detect).toBe("level");
    // The fan 5 dB under the voice hides the pauses from a level threshold.
    expect(byLevel.cuts.length).toBeLessThan(bySpeech.cuts.length);
    // A file the model hears no speech in: pauses by level, said so.
    const none = new Float32Array(speech.length).fill(0.02);
    expect(speechShare(none)).toBe(0);
    const fallback = planCuts(o, levels, d, none);
    expect(fallback.detect).toBe("level");
    expect(fallback.fellBack).toBe(true);
  });
});
