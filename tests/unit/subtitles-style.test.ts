import { describe, expect, it } from "vitest";
import { isRtlLine, plainCueStyle } from "@/tools/engines/overlay/text";
import type { Cue } from "@/tools/engines/subtitles/model";
import { AddSubtitlesOptions } from "@/tools/engines/subtitles-add/options";
import { splitCue, splitPhrases } from "@/tools/engines/subtitles-add/phrases";
import {
  assForceStyle,
  cueStyle,
  isPlain,
  lookPosition,
} from "@/tools/engines/subtitles-add/style";

const o = (x: Partial<AddSubtitlesOptions> = {}) =>
  AddSubtitlesOptions.parse({ mode: "burn", ...x });
const hd = { width: 1920, height: 1080 };
const vertical = { width: 1080, height: 1920 };
const cue = (start: number, end: number, text: string): Cue => ({ start, end, text, line: 1 });

describe("burn-in looks", () => {
  it("Classic with no overrides is exactly the plain look", () => {
    expect(isPlain(o())).toBe(true);
    const { family: _a, ...styled } = cueStyle(o(), hd);
    const { family: _b, ...plain } = plainCueStyle(1920, 1080, "medium");
    expect(styled).toEqual(plain);
  });

  it("Boxed draws a box and no outline", () => {
    const s = cueStyle(o({ look: "boxed" }), hd);
    expect(s.outline).toBe(0);
    expect(s.box).toBe("rgb(0 0 0 / 0.6)");
  });

  it("Bold social sits above Meta's Reels safe zone on vertical video", () => {
    const s = cueStyle(o({ look: "social" }), vertical);
    expect(lookPosition("social", vertical)).toBeCloseTo(0.65, 9);
    expect(s.bottom).toBe(Math.round(1920 * 0.65));
    expect(s.weight).toBe(700);
    // 6% clear at each side: lines wrap inside 88% of the width.
    expect(s.maxWidth + 2 * s.outline).toBeCloseTo(1080 * 0.88, 6);
    expect(s.px).toBeGreaterThan(plainCueStyle(1080, 1920, "medium").px);
    // Landscape: the lower third.
    expect(cueStyle(o({ look: "social" }), hd).bottom).toBe(Math.round(1080 * 0.85));
  });

  it("dark text gets a light outline and box", () => {
    const s = cueStyle(o({ color: "#000000", boxOpacity: 0.5 }), hd);
    expect(s.outlineColor).toBe("rgb(255 255 255)");
    expect(s.box).toBe("rgb(255 255 255 / 0.5)");
  });

  it("overrides win over the look", () => {
    const s = cueStyle(o({ look: "social", position: 0.5, lineWidth: 0.6, fontShare: 0.05 }), hd);
    expect(s.bottom).toBe(540);
    expect(s.px).toBe(Math.round(Math.sqrt(1920 * 1080) * 0.05));
    expect(s.maxWidth + 2 * s.outline).toBeCloseTo(1920 * 0.6, 6);
  });

  it("tells libass the same look on the 384×288 script", () => {
    const f = assForceStyle(o({ look: "boxed", color: "#ffd60a" }), hd);
    expect(f).toContain("BorderStyle=3");
    expect(f).toContain("PrimaryColour=&H000AD6FF");
    expect(f).toContain("MarginV=17");
    // 0.04 × √(1920×1080) = 57.6 px on a 1080 px picture = 15 on 288.
    expect(f).toContain("Fontsize=15");
  });
});

describe("right-to-left lines", () => {
  it("goes by the first strong letter", () => {
    expect(isRtlLine("שלום world")).toBe(true);
    expect(isRtlLine("مرحبا")).toBe(true);
    expect(isRtlLine("123 שלום")).toBe(true);
    expect(isRtlLine("Hello שלום")).toBe(false);
    expect(isRtlLine("你好")).toBe(false);
  });
});

describe("short phrases", () => {
  it("keeps short cues whole", () => {
    const c = cue(0, 2000, "Short line");
    expect(splitCue(c)).toEqual([c]);
  });

  it("splits by words and shares the time by characters", () => {
    const c = cue(1000, 5000, "The quick brown fox jumps over the lazy dog again");
    const out = splitCue(c);
    expect(out.length).toBeGreaterThan(1);
    expect(out[0]?.start).toBe(1000);
    expect(out[out.length - 1]?.end).toBe(5000);
    for (let i = 1; i < out.length; i++) expect(out[i]?.start).toBe(out[i - 1]?.end);
    expect(out.map((x) => x.text).join(" ")).toBe(c.text);
    // Each phrase's share of the time matches its share of the letters.
    const letters = c.text.replace(/\s/g, "").length;
    for (const p of out) {
      const share = (p.end - p.start) / 4000;
      expect(share).toBeCloseTo(p.text.replace(/\s/g, "").length / letters, 2);
    }
  });

  it("ends a phrase at punctuation and keeps styling tags balanced", () => {
    const out = splitCue(cue(0, 6000, "Wait, <i>what did you say</i> to him\nlast night?"));
    expect(out[0]?.text).toBe("Wait,");
    expect(out.some((p) => p.text.startsWith("<i>") && p.text.endsWith("</i>"))).toBe(true);
    for (const p of out) {
      expect((p.text.match(/<i>/g) ?? []).length).toBe((p.text.match(/<\/i>/g) ?? []).length);
    }
  });

  it("never makes more phrases than the time allows", () => {
    const out = splitCue(cue(0, 900, "one two three four five six seven eight nine ten eleven"));
    expect(out.length).toBeLessThanOrEqual(3);
  });

  it("cuts unspaced scripts by characters", () => {
    const out = splitCue(cue(0, 6000, "今天天气很好我们去公园散步然后去吃饭好不好呢朋友们一起来"));
    expect(out.length).toBeGreaterThan(1);
    expect(out.map((p) => p.text).join("")).toBe(
      "今天天气很好我们去公园散步然后去吃饭好不好呢朋友们一起来",
    );
  });

  it("splits every cue of a track", () => {
    const cues = [
      cue(0, 3000, "a b"),
      cue(3000, 8000, "this cue is long enough to be split in parts"),
    ];
    expect(splitPhrases(cues).length).toBeGreaterThan(2);
  });
});

describe("short phrases are even", () => {
  it("splits into phrases of similar length", () => {
    const out = splitCue(cue(0, 3000, "First line on the picture"));
    expect(out.map((p) => p.text)).toEqual(["First line on", "the picture"]);
  });
});

describe("position limit", () => {
  it("is one limit for the band and the field: two lines fit above it", async () => {
    const { highestPosition, bandHeight } = await import("@/tools/engines/subtitles-add/style");
    const s = cueStyle(o(), hd);
    expect(highestPosition(s, 1080)).toBeCloseTo(bandHeight(s) / 1080 + 0.02, 9);
    expect(highestPosition({ px: 400, outline: 40 }, 360)).toBe(0.9);
    expect(highestPosition({ px: 1, outline: 0 }, 1080)).toBe(0.1);
  });
});
