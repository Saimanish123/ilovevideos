import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cutFacts, planCuts, RemoveSilenceOptions } from "@/tools/engines/remove-silence/options";
import { analyzeSound } from "@/tools/engines/sound/analyze";

/**
 * The cut plan on a real decode (PCM decodes in Node without WebCodecs): the fixture has pauses of
 * 0.8 s, 0.3 s and 1.2 s over a faint noise floor. The defaults (0.5 s minimum, 0.15 s kept on each
 * side, threshold suggested from the floor) must cut the first and last pause and leave the short one.
 */
describe("remove silence plan", () => {
  it("finds the long pauses and keeps room around the words", async () => {
    const file = new File([readFileSync("tests/fixtures/sample-pauses.wav")], "sample-pauses.wav");
    const a = await analyzeSound(file, file.name, { levels: true, truePeak: false });
    const plan = planCuts(RemoveSilenceOptions.parse({}), a.levels, a.duration);
    expect(plan.thresholdDb).toBeLessThanOrEqual(-30);
    expect(plan.thresholdDb).toBeGreaterThanOrEqual(-55);
    expect(plan.cuts).toHaveLength(2);
    expect(plan.cuts[0]?.start).toBeCloseTo(1.65, 1);
    expect(plan.cuts[0]?.end).toBeCloseTo(2.15, 1);
    expect(plan.cuts[1]?.start).toBeCloseTo(5.15, 1);
    expect(plan.cuts[1]?.end).toBeCloseTo(6.05, 1);
    expect(plan.after).toBeCloseTo(6.6, 1);
    expect(cutFacts(plan, a.duration)).toMatch(/^2 pauses cut · 0:01 removed · 0:08 → 0:07$/);
    // A 0.25 s minimum with tight padding also cuts the short pause (0.15 s each side would eat it).
    const more = planCuts(
      RemoveSilenceOptions.parse({ minSilence: 0.25, padding: 0.05 }),
      a.levels,
      a.duration,
    );
    expect(more.cuts).toHaveLength(3);
  });
});
