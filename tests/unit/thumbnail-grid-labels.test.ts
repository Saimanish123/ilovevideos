import { describe, expect, it } from "vitest";
import { clockLabel, tileLabels, tileTimes } from "@/tools/engines/thumbnail-grid/layout";

/**
 * Contact sheet labels (QA 2026-10-08): a short clip in many tiles put "0:01" on both the 0.60 s and
 * the 1.12 s tile. Labels are now as precise as the spacing needs; the sheet and its preview share
 * `drawSheet`, which draws these.
 */
describe("contact sheet labels", () => {
  it("whole seconds when they tell every tile apart", () => {
    expect(tileLabels(tileTimes(9, 90))).toEqual([
      "0:05",
      "0:15",
      "0:25",
      "0:35",
      "0:45",
      "0:55",
      "1:05",
      "1:15",
      "1:25",
    ]);
  });

  it("tenths when tiles are under a second apart, so no two read the same", () => {
    const times = tileTimes(16, 8.3); // about 0.52 s apart, as in the QA case
    const labels = tileLabels(times);
    expect(new Set(labels).size).toBe(16);
    expect(labels.slice(0, 3)).toEqual(["0:00.3", "0:00.8", "0:01.3"]);
    expect(tileLabels([0.6, 1.12])).toEqual(["0:00.6", "0:01.1"]);
  });

  it("hundredths only when tenths still collide", () => {
    expect(tileLabels([0.61, 0.64, 0.68])).toEqual(["0:00.61", "0:00.64", "0:00.68"]);
    expect(clockLabel(62.25, 2)).toBe("1:02.25");
    expect(clockLabel(3599.96, 1)).toBe("1:00:00.0");
  });
});
