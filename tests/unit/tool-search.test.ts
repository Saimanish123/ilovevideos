import { describe, expect, it } from "vitest";
import { buildToolIndex, normalize, searchTools } from "@/lib/tool-search";
import { categories, tools } from "@/tools/registry";

const index = buildToolIndex(tools, categories);
const top = (q: string, n = 1) =>
  searchTools(index, q)
    .slice(0, n)
    .map((e) => e.slug);

describe("tool search (command palette)", () => {
  it("indexes every registry tool", () => {
    expect(index).toHaveLength(tools.length);
    expect(new Set(index.map((e) => e.slug)).size).toBe(tools.length);
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

  it("forgives dropped letters and prefixes", () => {
    expect(top("cmprss", 3)).toContain("compress-video");
    expect(top("tri")).toEqual(["trim-video"]);
  });

  it("returns nothing for words that match nothing", () => {
    expect(searchTools(index, "zzqx")).toEqual([]);
    expect(searchTools(index, "compress zzqx")).toEqual([]);
  });

  it("lists every tool outside a generated family when the query is empty", () => {
    const all = searchTools(index, "  ");
    expect(all.length).toBe(tools.filter((t) => !t.family).length);
    expect(all[0]?.slug).toBe("compress-video");
    expect(all.some((e) => e.family)).toBe(false);
  });
});
