import { describe, expect, it } from "vitest";
import { DEFAULT_PLAN, mergePasses, planPasses } from "@/tools/engines/vision/faces";

const face = (x: number, y: number, w: number, h: number, score = 0.9) => ({
  x,
  y,
  width: w,
  height: h,
  score,
});

describe("face finding passes", () => {
  it("runs one pass at 640 on the long side, padded to 32, never enlarging", () => {
    const [p] = planPasses(1280, 720, { ...DEFAULT_PLAN, tiles: false });
    expect(p).toMatchObject({ scale: 0.5, contentWidth: 640, contentHeight: 360, width: 640 });
    expect(p?.height).toBe(384);
    const [small] = planPasses(320, 240);
    expect(small).toMatchObject({ scale: 1, contentWidth: 320, contentHeight: 240, width: 320 });
    expect(small?.height).toBe(256);
    expect(planPasses(960, 540)).toHaveLength(1);
  });

  it("adds overlapping full-resolution tiles above 960 px that cover the whole frame", () => {
    for (const [w, h] of [
      [1920, 1080],
      [1280, 720],
      [1080, 1920],
    ] as const) {
      const plan = planPasses(w, h);
      const tiles = plan.filter((p) => p.tile);
      expect(tiles.length).toBeGreaterThan(1);
      for (const t of tiles) {
        expect(t.scale).toBe(1);
        expect(t.rect.width).toBeLessThanOrEqual(640);
        expect(t.width % 32).toBe(0);
      }
      // Every point of the frame lies at least 80 px inside some tile (or at the frame's edge),
      // so a face up to 160 px is whole in one tile.
      for (let y = 0; y < h; y += 37)
        for (let x = 0; x < w; x += 37) {
          const inside = tiles.some(
            (t) =>
              (x - t.rect.x >= 80 || t.rect.x === 0) &&
              (t.rect.x + t.rect.width - x >= 80 || t.rect.x + t.rect.width === w) &&
              (y - t.rect.y >= 80 || t.rect.y === 0) &&
              (t.rect.y + t.rect.height - y >= 80 || t.rect.y + t.rect.height === h),
          );
          expect(inside, `${w}x${h} at ${x},${y}`).toBe(true);
        }
    }
    expect(planPasses(1920, 1080)).toHaveLength(9);
  });

  it("maps boxes back, drops faces cut by a tile's inner edge and merges duplicates", () => {
    const plan = planPasses(1920, 1080);
    const whole = plan[0];
    const tileA = plan.find((p) => p.tile && p.rect.x === 0 && p.rect.y === 0);
    const tileB = plan.find((p) => p.tile && p.rect.x === 480 && p.rect.y === 0);
    if (!whole || !tileA || !tileB) throw new Error("plan");
    const merged = mergePasses(
      [
        // The whole pass sees a face at (900, 300) 60×60 picture px, at a third of the size.
        { pass: whole, faces: [face(300, 100, 20, 20, 0.8)] },
        // Tile A (0..640) sees it cut at its right edge: dropped.
        { pass: tileA, faces: [face(600, 300, 39, 60, 0.95)] },
        // Tile B (480..1120) sees all of it, with a better score: kept, the whole pass's merged.
        { pass: tileB, faces: [face(420, 300, 60, 60, 0.9), face(20, 500, 10, 10, 0.7)] },
      ],
      1920,
      1080,
      0.3,
    );
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ x: 900, y: 300, width: 60, height: 60, score: 0.9 });
    // A tile at the frame's own left edge keeps a face touching it.
    expect(
      mergePasses([{ pass: tileA, faces: [face(0, 100, 30, 30)] }], 1920, 1080, 0.3),
    ).toHaveLength(1);
  });
});
