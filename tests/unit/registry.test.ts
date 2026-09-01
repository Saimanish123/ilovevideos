import { describe, expect, it } from "vitest";
import { getRelatedTools, getTool, tools } from "@/tools/registry";

describe("tool registry", () => {
  it("parses every tool", () => {
    expect(tools.length).toBeGreaterThan(0);
  });
  it("has unique slugs", () => {
    expect(new Set(tools.map((t) => t.slug)).size).toBe(tools.length);
  });
  it("resolves related tools without self", () => {
    const t = getTool("compress-video");
    expect(t).toBeDefined();
    if (!t) return;
    expect(getRelatedTools(t).map((r) => r.slug)).not.toContain(t.slug);
  });
});
