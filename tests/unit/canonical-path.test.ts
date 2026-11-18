import { describe, expect, it } from "vitest";
import { canonicalPath } from "@/lib/canonical-path";

describe("canonicalPath", () => {
  it("leaves canonical paths alone", () => {
    for (const p of ["/", "/trim-video", "/tools/edit", "/en/trim-video"])
      expect(canonicalPath(p)).toBe(p);
  });
  it("lowercases, drops a trailing slash and trims pasted whitespace in one step", () => {
    expect(canonicalPath("/TOOLS/EDIT/")).toBe("/tools/edit");
    expect(canonicalPath("/trim-video%20")).toBe("/trim-video");
    expect(canonicalPath("/%20Trim-Video%20/")).toBe("/trim-video");
    expect(canonicalPath("/tools/edit//")).toBe("/tools/edit");
  });
  it("keeps a malformed escape for the 404", () => {
    expect(canonicalPath("/trim-video%E0%A4%A")).toBe("/trim-video%E0%A4%A");
  });
});
