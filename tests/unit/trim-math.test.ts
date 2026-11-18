import { describe, expect, it } from "vitest";
import { losslessStart, startMoved, startNote } from "@/tools/engines/trim/math";

describe("trim math", () => {
  const kf = [0, 1, 2, 3];

  it("starts a lossless cut on the key frame at or before the start", () => {
    expect(losslessStart(1.2, kf)).toBe(1);
    expect(losslessStart(1.99, kf)).toBe(1);
    expect(losslessStart(2, kf)).toBe(2);
    // A float a hair under a key frame time still counts as on it.
    expect(losslessStart(2 - 1e-9, kf)).toBe(2);
    expect(losslessStart(7, kf)).toBe(3);
    expect(losslessStart(0, kf)).toBe(0);
  });

  it("keeps the asked start when no key frame lies at or before it", () => {
    expect(losslessStart(0, [0.033, 1.033])).toBe(0);
    expect(losslessStart(1.5, undefined)).toBe(1.5);
    expect(losslessStart(1.5, [])).toBe(1.5);
  });

  it("says where the cut starts", () => {
    expect(startMoved(1.2, 1)).toBe(true);
    expect(startMoved(1.001, 1)).toBe(false);
    expect(startNote(1.2, 1)).toBe("Starts at 0:01.00, the key frame before 0:01.20");
    expect(startNote(2, 2)).toBe("Starts at 0:02.00, on a key frame");
  });
});
