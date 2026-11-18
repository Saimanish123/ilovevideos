import { describe, expect, it } from "vitest";
import { unitCommit } from "@/components/tool/regions/unit-commit";

const o = { min: 0, max: 47, decimals: 1 };

describe("UnitField commit", () => {
  it("does not commit a blur without an edit", () => {
    expect(unitCommit("16.4", "16.4", o)).toBeUndefined();
    expect(unitCommit(" 16.4 ", "16.4", o)).toBeUndefined();
  });
  it("commits a typed value, rounded and held in range", () => {
    expect(unitCommit("5", "16.4", o)).toBe(5);
    expect(unitCommit("5.04", "16.4", o)).toBe(5);
    expect(unitCommit("90", "16.4", o)).toBe(47);
    expect(unitCommit("-3", "16.4", o)).toBe(0);
    expect(unitCommit("-3", "2", { min: -12, max: 12, decimals: 0 })).toBe(-3);
  });
  it("commits nothing for empty or non-numeric text", () => {
    expect(unitCommit("", "16.4", o)).toBeUndefined();
    expect(unitCommit("-", "16.4", o)).toBeUndefined();
    expect(unitCommit("abc", "16.4", o)).toBeUndefined();
  });
});
