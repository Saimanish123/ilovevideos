import { describe, expect, it } from "vitest";
import { searchIntents } from "@/content/site/search-intents";
import { buildToolIndex, editDistance, normalize, searchTools, stem } from "@/lib/tool-search";
import { categories, isGenerated, tools } from "@/tools/registry";
import { heldOutCases, type QueryCase, queryCases } from "./search-queries";

const index = buildToolIndex(tools, categories, searchIntents);
const top = (q: string, n = 1) =>
  searchTools(index, q)
    .slice(0, n)
    .map((e) => e.slug);

/** Top-1 and top-3 hit rates over a table, with the rows that missed (for the failure message). */
function rates(cases: QueryCase[]) {
  let first = 0;
  let three = 0;
  const misses: string[] = [];
  for (const c of cases) {
    const got = searchTools(index, c.q, 8).map((e) => e.slug);
    const hit1 = got[0] === c.top1;
    const hit3 = [c.top1, ...(c.top3 ?? [])].every((s) => got.slice(0, 3).includes(s));
    if (hit1) first++;
    if (hit3) three++;
    if (!hit1 || !hit3) misses.push(`${c.q} → ${got.slice(0, 3).join(", ")} (want ${c.top1})`);
  }
  return { top1: first / cases.length, top3: three / cases.length, misses };
}

describe("tool search (command palette)", () => {
  it("indexes every registry tool", () => {
    expect(index).toHaveLength(tools.length);
    expect(new Set(index.map((e) => e.slug)).size).toBe(tools.length);
  });

  it("points every intent row only at pages that exist", () => {
    const slugs = new Set(tools.map((t) => t.slug));
    const missing = searchIntents.flatMap((i) => i.slugs.filter((s) => !slugs.has(s)));
    expect(missing).toEqual([]);
  });

  it("finds a tool by its title, alias or keyword", () => {
    expect(top("compress")).toEqual(["compress-video"]);
    expect(top("shrink")).toEqual(["compress-video"]);
    expect(top("mute")).toEqual(["remove-audio-from-video"]);
    expect(top("join")).toEqual(["merge-videos"]);
    expect(top("mirror")).toEqual(["flip-video"]);
  });

  it("reads format pairs with or without the joining word", () => {
    expect(top("mov to mp4")).toEqual(["mov-to-mp4"]);
    expect(top("mov mp4")).toEqual(["mov-to-mp4"]);
    expect(top("srt vtt")).toEqual(["srt-to-vtt"]);
  });

  it("matches size targets written either way", () => {
    expect(normalize("8MB")).toBe("8 mb");
    expect(top("8mb")).toEqual(["compress-video-under-8mb"]);
    expect(top("under 10 mb")).toContain("compress-video-under-10mb");
  });

  it("forgives dropped letters, swapped letters and prefixes", () => {
    expect(top("cmprss", 3)).toContain("compress-video");
    expect(top("tri")).toEqual(["trim-video"]);
    expect(editDistance("discrod", "discord")).toBe(1);
    expect(top("discrod")).toEqual(["compress-video-for-discord"]);
  });

  it("reads apostrophes and plurals the way people type them", () => {
    expect(normalize("Won’t play")).toBe("wont play");
    expect(stem("subtitles")).toBe("subtitle");
    expect(stem("glass")).toBe("glass");
    expect(stem("gps")).toBe("gps");
  });

  it("returns nothing for words that match nothing", () => {
    expect(searchTools(index, "zzqx")).toEqual([]);
  });

  // Best coverage (ADR-0123): a word no page knows does not sink the words that do.
  it("ignores a word no tool knows instead of dropping every result", () => {
    expect(top("compress zzqx")).toEqual(["compress-video"]);
    expect(top("compress video for grandma")).toEqual(["compress-video"]);
  });

  it("drops promises every page keeps (no watermark, no upload)", () => {
    expect(top("trim video no watermark")).toEqual(["trim-video"]);
    expect(top("watermark")).toEqual(["add-watermark-to-video"]);
  });

  it("caps the list and keeps far weaker matches out", () => {
    expect(searchTools(index, "video", 8).length).toBeLessThanOrEqual(8);
    expect(searchTools(index, "shaky video", 8).map((e) => e.slug)).toEqual(["stabilize-video"]);
  });

  it("lists every standalone tool when the query is empty", () => {
    const all = searchTools(index, "  ");
    expect(all.length).toBe(tools.filter((t) => !isGenerated(t)).length);
    expect(all[0]?.slug).toBe("compress-video");
    expect(all.some((e) => e.generated)).toBe(false);
  });

  // ADR-0154: format pairs and presets are results only when the query names them.
  it("keeps generated pages out of results for queries that do not name them", () => {
    for (const q of [
      "compress video",
      "video too big",
      "convert video",
      "convert mov",
      "audio converter",
      "subtitle converter",
      "resize video",
      "make video smaller",
      "iphone video",
    ])
      expect(
        searchTools(index, q, 8)
          .filter((e) => e.generated)
          .map((e) => e.slug),
        q,
      ).toEqual([]);
  });

  it("shows a generated page first when the query names it", () => {
    expect(top("mov to mp4")).toEqual(["mov-to-mp4"]);
    expect(top("mp4 mov")).toEqual(["mp4-to-mov"]);
    expect(top("hevc to h.264")).toEqual(["hevc-to-h264"]);
    expect(top("srt to webvtt")).toEqual(["srt-to-vtt"]);
    expect(top("compress video for discord")).toEqual(["compress-video-for-discord"]);
    expect(top("compress video under 25mb")).toEqual(["compress-video-under-25mb"]);
  });
});

const pct = (x: number) => `${(x * 100).toFixed(1)} %`;
const table = rates(queryCases);
const held = rates(heldOutCases);

describe("search quality bar (ADR-0123)", () => {
  it(`has at least 60 real-sounding queries (${queryCases.length})`, () => {
    expect(queryCases.length).toBeGreaterThanOrEqual(60);
  });

  it(`table: top-1 ${pct(table.top1)}, top-3 ${pct(table.top3)} of ${queryCases.length} queries`, () => {
    const r = table;
    expect(r.top3, r.misses.join("\n")).toBe(1);
    expect(r.top1, r.misses.join("\n")).toBeGreaterThanOrEqual(0.9);
  });

  it(`held-out: top-1 ${pct(held.top1)}, top-3 ${pct(held.top3)} of ${heldOutCases.length} queries`, () => {
    const r = held;
    expect(r.top3, r.misses.join("\n")).toBe(1);
    expect(r.top1, r.misses.join("\n")).toBeGreaterThanOrEqual(0.9);
  });
});
