import { describe, expect, it } from "vitest";
import { formatBytes, NBSP } from "@/lib/format";

const s = (v: string) => v.replace(/ /g, NBSP);

describe("formatBytes (decimal, ADR-0024)", () => {
  it("counts in thousands with SI symbols", () => {
    expect(formatBytes(0)).toBe(s("0 B"));
    expect(formatBytes(999)).toBe(s("999 B"));
    expect(formatBytes(1000)).toBe(s("1 kB"));
    expect(formatBytes(33_400)).toBe(s("33.4 kB"));
    expect(formatBytes(1_000_000)).toBe(s("1 MB"));
    expect(formatBytes(12_400_000)).toBe(s("12.4 MB"));
    expect(formatBytes(2_500_000_000)).toBe(s("2.5 GB"));
  });

  it("matches the size targets: 10 MB is 10,000,000 bytes, not 10,485,760", () => {
    expect(formatBytes(10_000_000)).toBe(s("10 MB"));
    expect(formatBytes(10_485_760)).toBe(s("10.5 MB"));
  });

  it("rounds to one decimal under 100 and whole above, promoting instead of printing 1000", () => {
    expect(formatBytes(99_960_000)).toBe(s("100 MB"));
    expect(formatBytes(123_456_789)).toBe(s("123 MB"));
    expect(formatBytes(999_600)).toBe(s("1 MB"));
    expect(formatBytes(999_499)).toBe(s("999 kB"));
  });

  it("never prints nonsense for bad input", () => {
    expect(formatBytes(Number.NaN)).toBe(s("0 B"));
    expect(formatBytes(-5)).toBe(s("0 B"));
  });
});
