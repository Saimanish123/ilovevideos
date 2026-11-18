import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { completeLead, diagnose, sampleTables } from "@/tools/engines/repair/diagnose";

const blob = (name: string) => new Blob([readFileSync(`tests/fixtures/${name}`)]);

describe("repair diagnosis", () => {
  it("a complete file is intact", async () => {
    expect((await diagnose(blob("sample.mp4"))).kind).toBe("intact");
    expect((await diagnose(blob("sample.mkv"))).kind).toBe("intact");
  });

  it("an MP4 cut off with its index in front: what is complete, per track", async () => {
    const d = await diagnose(blob("sample-cut.mp4"));
    expect(d.kind).toBe("truncated");
    if (d.kind !== "truncated") return;
    expect(d.statedSec).toBe(4);
    expect(d.keepSec).toBeCloseTo(2.43, 1);
    expect(d.tracks).toEqual([
      { id: 1, type: "vide", total: 120, complete: 75 },
      { id: 2, type: "soun", total: 189, complete: 115 },
    ]);
    expect(d.missingBytes).toBeGreaterThan(70_000);
  });

  it("reads sample tables exactly (offsets ascend, sizes sum to the media)", async () => {
    const f = new Uint8Array(readFileSync("tests/fixtures/sample.mp4"));
    const at = f.findIndex((_, i) => String.fromCharCode(...f.subarray(i + 4, i + 8)) === "moov");
    const size = new DataView(f.buffer).getUint32(at);
    const tables = sampleTables(f.slice(at, at + size));
    expect(tables.map((t) => t.type)).toEqual(["vide", "soun"]);
    for (const t of tables) {
      expect(t.offsets.length).toBe(t.sizes.length);
      expect(completeLead(t, f.length)).toBe(t.offsets.length);
      expect(completeLead(t, (t.offsets[10] ?? 0) + 1)).toBe(10);
    }
  });

  it("a fragmented MP4 cut inside a fragment keeps the whole ones", async () => {
    const d = await diagnose(blob("sample-frag-cut.mp4"));
    expect(d).toMatchObject({ kind: "fragments-cut", fragments: 3, completeFragments: 2 });
  });

  it("an MKV that stops early, and a recording with no index", async () => {
    expect(await diagnose(blob("sample-cut.mkv"))).toMatchObject({
      kind: "matroska-cut",
      container: "mkv",
    });
    expect(await diagnose(blob("sample-nomoov.mp4"))).toMatchObject({
      kind: "no-index",
      container: "mp4",
    });
    expect((await diagnose(blob("sample.wav"))).kind).toBe("unknown");
  });
});
