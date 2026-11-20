// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { taskGroups } from "@/components/layout/tool-groups";
import { thenStepsFor } from "@/components/tool/then-steps";
import { hubGroups, hubMore } from "@/content/site/discovery";
import {
  kindOf,
  LARGE_BYTES,
  MAX_ACTIONS,
  spokenLength,
  suggestForFile,
} from "@/lib/file-suggestions";
import { NBSP } from "@/lib/format";
import {
  clearRecent,
  homeRowsScript,
  RECENT_KEY,
  RECENT_MAX,
  readRecent,
  rememberTool,
} from "@/lib/recent-tools";
import type { MediaInfo } from "@/tools/engines/types";
import {
  getActiveCategories,
  getRelatedTools,
  getThenSteps,
  getTool,
  getToolsByCategory,
  isGenerated,
  tools,
} from "@/tools/registry";

const pairs = {
  video: tools.flatMap((t) => /^([a-z0-9]+)-to-mp4$/.exec(t.slug)?.[1] ?? []),
  audio: tools.flatMap((t) => /^([a-z0-9]+)-to-mp3$/.exec(t.slug)?.[1] ?? []),
};
const slugs = new Set(tools.map((t) => t.slug));

const video = (over: Partial<NonNullable<MediaInfo["video"]>> = {}): MediaInfo["video"] => ({
  codec: "avc",
  width: 1920,
  height: 1080,
  fps: 30,
  ...over,
});
const info = (over: Partial<MediaInfo> = {}): MediaInfo => ({
  container: "mp4",
  durationSec: 20,
  sizeBytes: 5_000_000,
  video: video(),
  audio: [{ codec: "aac", channels: 2, sampleRate: 48000 }],
  ...over,
});
const file = (name: string, size = 5_000_000, type = "") => ({ name, size, type });
const flat = (rows: ReturnType<typeof suggestForFile>) =>
  rows.flatMap((r) => r.actions.map((a) => `${r.reason} → ${a.slug}`.replaceAll(NBSP, " ")));

describe("file-first suggestions (ADR-0125)", () => {
  it("says nothing about an ordinary short MP4", () => {
    expect(suggestForFile(file("clip.mp4"), info(), pairs)).toEqual([]);
  });

  it("reads an iPhone HEVC MOV: one conversion row (H.264), each row with its fact", () => {
    const rows = suggestForFile(
      file("IMG_0042.MOV", 1_200_000_000),
      info({
        container: "mov",
        durationSec: 18 * 60,
        video: video({ codec: "hevc" }),
        tags: { make: "Apple", model: "iPhone 15 Pro", location: "48.8584° N, 2.2945° E" },
      }),
      pairs,
    );
    expect(flat(rows)).toEqual([
      "HEVC from an iPhone → change-video-codec",
      "1.2 GB → compress-video",
      "18 min → trim-video",
      "18 min → cut-video-into-shorts",
      "Location stored in the file → remove-metadata-from-video",
    ]);
  });

  it("offers the converter (MP4 by default) for an H.264 MOV, where the copy is the whole fix", () => {
    expect(flat(suggestForFile(file("clip.mov"), info({ container: "mov" }), pairs))).toEqual([
      "MOV file → video-converter",
    ]);
  });

  it("never offers more than six actions, and never a page that does not exist", () => {
    const rows = suggestForFile(
      file("a.mkv", 9e9),
      info({
        durationSec: 7200,
        video: video({ codec: "hevc", fps: 120 }),
        tags: { location: "x" },
        audio: [
          { codec: "aac", channels: 2, sampleRate: 48000 },
          { codec: "aac", channels: 2, sampleRate: 48000 },
        ],
        subtitles: [{ codec: "srt" }],
      }),
      pairs,
    );
    const actions = rows.flatMap((r) => r.actions);
    expect(actions.length).toBe(MAX_ACTIONS);
    for (const a of actions) expect(slugs.has(a.slug), a.slug).toBe(true);
  });

  it("offers compressing only from 25 MB and trimming only from a minute", () => {
    expect(flat(suggestForFile(file("a.mp4", LARGE_BYTES - 1), info(), pairs))).toEqual([]);
    expect(flat(suggestForFile(file("a.mp4", LARGE_BYTES), info(), pairs))).toEqual([
      "25 MB → compress-video",
    ]);
    expect(flat(suggestForFile(file("a.mp4"), info({ durationSec: 90 }), pairs))).toEqual([
      "2 min → trim-video",
    ]);
  });

  it("names the format page for a file the browser cannot read, and repair for a damaged MP4", () => {
    expect(flat(suggestForFile(file("old.avi"), undefined, pairs))).toEqual([
      "AVI file → video-converter",
    ]);
    expect(flat(suggestForFile(file("cut.mp4"), undefined, pairs))).toEqual([
      "Could not be read here → repair-video",
    ]);
    expect(suggestForFile(file("notes.txt"), undefined, pairs)).toEqual([]);
  });

  it("handles audio, GIFs, pictures, subtitles and several videos", () => {
    const song = info({ video: undefined, durationSec: 200 });
    expect(flat(suggestForFile(file("take.wav"), song, pairs))).toEqual([
      "WAV file → audio-converter",
      "3 min → trim-audio",
    ]);
    expect(flat(suggestForFile(file("a.gif", 4_200_000, "image/gif"), undefined, pairs))).toEqual([
      "Animated GIF, 4.2 MB → gif-to-mp4",
    ]);
    expect(flat(suggestForFile(file("a.jpg", 1, "image/jpeg"), undefined, pairs, 3))).toEqual([
      "3 pictures → images-to-video",
    ]);
    expect(flat(suggestForFile(file("film.srt"), undefined, pairs))).toEqual([
      "SRT subtitles → subtitle-converter",
      "SRT subtitles → add-subtitles-to-video",
    ]);
    const merged = suggestForFile(file("a.mp4"), info(), pairs, 3);
    expect(merged[0]).toEqual({
      reason: "3 videos",
      actions: [{ slug: "merge-videos", label: "Merge them into one", all: true }],
    });
  });

  it("classifies by type, then extension, and says lengths the way people do", () => {
    expect(kindOf({ name: "x.GIF", type: "" })).toBe("gif");
    expect(kindOf({ name: "x.vtt", type: "" })).toBe("subtitle");
    expect(kindOf({ name: "x.heic", type: "image/heic" })).toBe("image");
    expect(kindOf({ name: "x.mov", type: "video/quicktime" })).toBe("media");
    expect(spokenLength(45)).toBe(`45${NBSP}s`);
    expect(spokenLength(18 * 60 + 4)).toBe(`18${NBSP}min`);
    expect(spokenLength(72 * 60)).toBe(`1${NBSP}h 12${NBSP}min`);
  });
});

describe("related tools (ADR-0154)", () => {
  it("shows only standalone tools on a standalone page", () => {
    for (const t of tools.filter((x) => !isGenerated(x)))
      for (const r of getRelatedTools(t))
        expect(isGenerated(r), `${t.slug} → ${r.slug}`).toBe(false);
  });

  it("lets a format pair show its siblings", () => {
    const mov = getTool("mov-to-mp4") as NonNullable<ReturnType<typeof getTool>>;
    const slugs = getRelatedTools(mov).map((r) => r.slug);
    expect(slugs).toContain("mp4-to-mov");
    expect(slugs).toContain("hevc-to-h264");
  });
});

describe("then steps (ADR-0126)", () => {
  it("only offers pages that take what this page makes, never itself or its own job again", () => {
    for (const t of tools)
      for (const s of getThenSteps(t)) {
        const next = getTool(s.slug);
        expect(next?.accepts.includes(t.produces), `${t.slug} → ${s.slug}`).toBe(true);
        expect(s.slug).not.toBe(t.slug);
        expect(next?.engine === t.engine && next?.accepts[0] === t.accepts[0]).toBe(false);
      }
    expect(getThenSteps(getTool("video-info") as NonNullable<ReturnType<typeof getTool>>)).toEqual(
      [],
    );
  });

  it("puts the page's own next step first, caps at three and drops them after a missed result", () => {
    const ctx = {
      slug: "trim-video",
      steps: [
        { slug: "compress-video", label: "Make it smaller" },
        { slug: "trim-video", label: "Trim it" },
        { slug: "video-to-gif", label: "Make a GIF of it" },
        { slug: "extract-audio-from-video", label: "Save its sound" },
      ],
    };
    const own = { slug: "compress-video", label: "Compress this part to share it" };
    expect(thenStepsFor(own, ctx, false).map((s) => s.label)).toEqual([
      "Compress this part to share it",
      "Make a GIF of it",
      "Save its sound",
    ]);
    expect(thenStepsFor(own, ctx, true)).toEqual([own]);
    // A spec label that only repeats the target's title takes the row's own words.
    const titled = {
      slug: "trim-video",
      steps: [{ slug: "compress-video", label: "Make it smaller", title: "Compress video" }],
    };
    expect(
      thenStepsFor({ slug: "compress-video", label: "Compress video" }, titled, false)[0]?.label,
    ).toBe("Make it smaller");
    expect(thenStepsFor(undefined, null, false)).toEqual([]);
  });
});

describe("hub task groups (ADR-0127)", () => {
  it("lists every standalone page of a hub exactly once", () => {
    for (const cat of getActiveCategories()) {
      const cards = getToolsByCategory(cat.id).filter(
        (t) => !t.family && t.presetOptions.lockTarget !== true,
      );
      const groups = taskGroups(cat.id, cards);
      if (!groups) continue;
      const listed = groups.flatMap((g) => g.tools.map((t) => t.slug));
      expect(new Set(listed).size).toBe(listed.length);
      expect([...listed].sort()).toEqual(cards.map((t) => t.slug).sort());
      // Every page sits under a named task: a lone "More" heading fails here (SEO audit P2-1).
      expect(groups.map((g) => g.label)).not.toContain(hubMore);
    }
  });

  it("names only pages that exist in the category it groups", () => {
    for (const [cat, groups] of Object.entries(hubGroups))
      for (const g of groups ?? [])
        for (const s of g.slugs) expect(getTool(s)?.category, `${cat}: ${s}`).toBe(cat);
  });
});

describe("recent tools in this browser (ADR-0124)", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
        removeItem: (k: string) => store.delete(k),
      },
      addEventListener() {},
      removeEventListener() {},
    };
    clearRecent();
  });
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it("keeps the newest first, without repeats, up to the cap", () => {
    rememberTool("trim-video", "Trim video");
    rememberTool("compress-video", "Compress video");
    rememberTool("trim-video", "Trim video");
    expect(readRecent().map((r) => r.slug)).toEqual(["trim-video", "compress-video"]);
    for (let i = 0; i < 20; i++) rememberTool(`tool-${i}`, `Tool ${i}`);
    expect(readRecent()).toHaveLength(RECENT_MAX);
    expect(JSON.parse(store.get(RECENT_KEY) ?? "[]")).toHaveLength(RECENT_MAX);
  });

  it("clears, and survives storage that throws", () => {
    rememberTool("trim-video", "Trim video");
    clearRecent();
    expect(readRecent()).toEqual([]);
    expect(store.has(RECENT_KEY)).toBe(false);
    (globalThis as { window?: unknown }).window = {
      get localStorage(): Storage {
        throw new Error("SecurityError");
      },
    };
    expect(() => rememberTool("trim-video", "Trim video")).not.toThrow();
  });

  it("fills Continue and Because before React runs, keeps the editorial order, and never throws", () => {
    // A tiny stand-in for the page: three cards in two rows, the two personal rows, <head>.
    type El = {
      id?: string;
      hidden?: boolean;
      textContent?: string;
      attrs: Record<string, string>;
      kids: El[];
      getAttribute(k: string): string | null;
      removeAttribute(k: string): void;
      cloneNode(): El;
      appendChild(c: El): void;
    };
    const el = (attrs: Record<string, string> = {}, id?: string): El => ({
      id,
      hidden: true,
      attrs: { ...attrs },
      kids: [],
      getAttribute(k) {
        return this.attrs[k] ?? null;
      },
      removeAttribute(k) {
        delete this.attrs[k];
      },
      cloneNode() {
        return el(this.attrs);
      },
      appendChild(c) {
        this.kids.push(c);
      },
    });
    const run = (recent: unknown) => {
      const cards = ["trim-video", "merge-videos", "extract-audio-from-video"].map((s) =>
        el({ "data-slug": s }),
      );
      const ids: Record<string, El> = {};
      for (const id of ["row-continue", "row-continue-list", "row-because", "row-because-list"])
        ids[id] = el({}, id);
      ids["row-because-title"] = el({}, "row-because-title");
      const head = el();
      const doc = {
        head,
        querySelectorAll: () => cards,
        getElementById: (id: string) => ids[id],
        createElement: () => el(),
      };
      const store: Record<string, string> = {
        "recent-tools": typeof recent === "string" ? recent : JSON.stringify(recent),
      };
      // The page carries the row data on #tools (data-related, data-rows).
      (ids as Record<string, unknown>).tools = {
        dataset: { related: JSON.stringify([[1], [0, 2], [0]]) },
      };
      new Function("localStorage", "document", homeRowsScript)(
        { getItem: (k: string) => store[k] ?? null },
        doc,
      );
      return { ids, head };
    };
    // Nothing stored, or junk: the page stays editorial.
    expect(run([]).ids["row-continue"]?.hidden).toBe(true);
    expect(run("not json").head.kids).toHaveLength(0);
    // Trim was used last: Continue shows it, Because shows its related card (merge), not itself.
    const { ids, head } = run([{ slug: "trim-video", title: "Trim video" }]);
    expect(ids["row-continue"]?.hidden).toBe(false);
    expect(ids["row-continue-list"]?.kids.map((k) => k.attrs["data-slug"])).toEqual([undefined]);
    expect(ids["row-continue-list"]?.kids).toHaveLength(1);
    expect(ids["row-because"]?.hidden).toBe(false);
    expect(ids["row-because-title"]?.textContent).toBe("Trim video");
    expect(ids["row-because-list"]?.kids).toHaveLength(1);
    // No section reorder: nothing is added to <head>.
    expect(head.kids).toHaveLength(0);
    // A recent tool that is not on the page is skipped.
    expect(run([{ slug: "gone", title: "Gone" }]).ids["row-continue"]?.hidden).toBe(true);
  });
});
