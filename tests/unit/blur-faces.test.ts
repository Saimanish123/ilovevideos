import { describe, expect, it } from "vitest";
import { type FacesValue, findHint } from "@/components/tool/options/blur-faces";
import { BlurRegionOptions, MAX_REGIONS, type Region } from "@/tools/engines/blur-region/options";

/** The line under the regions after Find faces, for each way a search can end. */
const face = (id: number, n: number): Region => ({
  id,
  shape: "ellipse",
  moving: true,
  start: 0,
  face: n,
  keys: [{ t: 0, x: 0.5, y: 0.5, w: 0.1, h: 0.1 }],
});
const drawn = (id: number): Region => ({ ...face(id, 1), face: undefined, shape: "rect" });
const value = (regions: Region[], find: FacesValue["find"]): FacesValue => ({
  ...BlurRegionOptions.parse({ regions }),
  find,
});
const done = (found: number, kept: number, left = 0) =>
  ({ phase: "done", done: 10, total: 10, found, kept, left }) as const;

describe("Find faces hint", () => {
  it("does not repeat the count the summary shows", () => {
    expect(findHint(value([face(1, 1), face(2, 2)], done(2, 2)))).toBe(
      "Play it through and draw over any face it missed.",
    );
  });

  it("says faces were left out without blaming how long they were seen", () => {
    const hint = findHint(value([face(1, 1)], done(5, 1, 4)));
    expect(hint).toBe(
      `Play it through and draw over any face it missed. 4 more faces were left out: ${MAX_REGIONS} regions is the most.`,
    );
    expect(hint).not.toMatch(/briefly/);
  });

  it("says why nothing was added when drawn regions fill every slot", () => {
    const full = Array.from({ length: MAX_REGIONS }, (_, i) => drawn(i + 1));
    expect(findHint(value(full, done(20, 0, 20)))).toBe(
      `20 faces found, but ${MAX_REGIONS} regions is the most: delete some to add them.`,
    );
  });

  it("explains the waiting Add region while the search runs, and says when none were found", () => {
    expect(findHint(value([], { phase: "finding", done: 3, total: 10 }))).toBe(
      "Add region is back once the search ends.",
    );
    expect(findHint(value([drawn(1)], done(0, 0)))).toMatch(/^No faces found\./);
  });

  it("goes quiet once every found face is deleted", () => {
    expect(findHint(value([drawn(1)], done(3, 3)))).toBeUndefined();
  });
});
