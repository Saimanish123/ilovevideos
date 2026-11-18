import { describe, expect, it } from "vitest";
import { matchesAccept, setHandoff, takeHandoff } from "@/lib/handoff";

describe("handoff", () => {
  it("is taken once", () => {
    setHandoff(new File(["x"], "a.mp4", { type: "video/mp4" }));
    expect(takeHandoff()?.name).toBe("a.mp4");
    expect(takeHandoff()).toBeUndefined();
  });

  it("matches the next tool's accept list", () => {
    const vtt = new File(["WEBVTT"], "a.vtt", { type: "text/vtt" });
    const mp4 = new File(["x"], "a.mp4", { type: "video/mp4" });
    expect(matchesAccept(vtt, "video/*")).toBe(false);
    expect(matchesAccept(vtt, ".srt,.vtt,.ass")).toBe(true);
    expect(matchesAccept(mp4, "video/*,audio/*")).toBe(true);
    expect(matchesAccept(new File(["x"], "a.gif", { type: "image/gif" }), "image/gif,.gif")).toBe(
      true,
    );
  });
});
