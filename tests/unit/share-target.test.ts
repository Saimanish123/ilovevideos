import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/i18n/navigation", () => ({ Link: () => null }));

import { kindOf, middleTruncate } from "@/components/share/share-chooser";
import { setHandoff, setHandoffFiles, takeHandoff, takeHandoffFiles } from "@/lib/handoff";

describe("shared files", () => {
  it("are sorted into kinds by type, and by name when the share sent no type", () => {
    expect(kindOf({ name: "a.mp4", type: "video/mp4" })).toBe("video");
    expect(kindOf({ name: "clip.mkv", type: "" })).toBe("video");
    expect(kindOf({ name: "a.gif", type: "image/gif" })).toBe("gif");
    expect(kindOf({ name: "a.jpg", type: "image/jpeg" })).toBe("image");
    expect(kindOf({ name: "a.m4a", type: "audio/mp4" })).toBe("audio");
    expect(kindOf({ name: "a.opus", type: "" })).toBe("audio");
    expect(kindOf({ name: "a.srt", type: "application/octet-stream" })).toBe("subtitle");
    expect(kindOf({ name: "a.pdf", type: "application/pdf" })).toBeUndefined();
  });

  it("long names keep their start and their extension", () => {
    expect(middleTruncate("holiday.mp4")).toBe("holiday.mp4");
    const t = middleTruncate("a-very-long-holiday-video-from-the-beach-in-2026-final.mp4");
    expect(t.length).toBe(40);
    expect(t.endsWith("-final.mp4")).toBe(true);
    expect(t).toContain("…");
  });

  it("hand several files on at once; a single-file page still takes the first", () => {
    const a = new File(["a"], "a.mp4", { type: "video/mp4" });
    const b = new File(["b"], "b.mp4", { type: "video/mp4" });
    setHandoffFiles([a, b]);
    expect(takeHandoffFiles().map((f) => f.name)).toEqual(["a.mp4", "b.mp4"]);
    expect(takeHandoffFiles()).toEqual([]);
    setHandoffFiles([a, b]);
    expect(takeHandoff()?.name).toBe("a.mp4");
    expect(takeHandoffFiles()).toEqual([]);
    setHandoff(b);
    expect(takeHandoffFiles().map((f) => f.name)).toEqual(["b.mp4"]);
  });
});
