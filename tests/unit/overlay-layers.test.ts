import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  backgroundTime,
  ChromaKeyOptions,
  coverFromRatio,
  detectKey,
  fitRect,
  fromHex,
  hex,
  keyChannel,
  keyCommand,
  keyness,
  patchColor,
  ramp,
  screenName,
} from "@/tools/engines/chroma-key/options";
import {
  frameAt,
  frameEnds,
  ImageOverlayOptions,
  layerRect,
  looksAnimated,
  newPlacement,
  overlayGraph,
  placeFromRect,
  playedDelay,
  restack,
} from "@/tools/engines/image-overlay/options";

const hd = { width: 1920, height: 1080 };

describe("image layers: placement", () => {
  const layer = {
    id: 1,
    name: "a.png",
    blob: new Blob([]),
    type: "image/png",
    width: 400,
    height: 200,
    animated: false,
    ...newPlacement(0),
  };

  it("centres a new layer at 30% of the width, with its own shape", () => {
    expect(layerRect(layer, hd)).toEqual({ x: 672, y: 396, width: 576, height: 288 });
    expect(newPlacement(1)).toMatchObject({ x: 0.55, y: 0.55 });
  });

  it("turns a dragged box back into the same placement", () => {
    const r = layerRect({ ...layer, x: 0.2, y: 0.7, w: 0.1 }, hd);
    expect(placeFromRect(r, hd)).toEqual({ x: 0.2, y: 0.7, w: 0.1 });
  });

  it("moves layers up and down the stack, not past the ends", () => {
    const o = ImageOverlayOptions.parse({
      layers: [layer, { ...layer, id: 2 }, { ...layer, id: 3 }],
    });
    expect(restack(o, 1, 1).map((l) => l.id)).toEqual([2, 1, 3]);
    expect(restack(o, 3, 1).map((l) => l.id)).toEqual([1, 2, 3]);
    expect(restack(o, 1, -1).map((l) => l.id)).toEqual([1, 2, 3]);
  });

  it("writes an ffmpeg graph with scale, turn, opacity and the time range", () => {
    const o = ImageOverlayOptions.parse({
      layers: [{ ...layer, rotation: 90, opacity: 0.5, start: 1, end: 2 }],
    });
    const g = overlayGraph(o, hd, 3);
    expect(g).toContain("scale=576:288,format=rgba,rotate=1.571");
    expect(g).toContain("colorchannelmixer=aa=0.5");
    expect(g).toContain("overlay=x=960-w/2:y=540-h/2");
    expect(g).toContain("enable='between(t,1,2)'");
  });
});

describe("image layers: animation", () => {
  it("plays GIF delays as browsers do and loops from the moment the layer appears", () => {
    expect(playedDelay(0)).toBe(0.1);
    expect(playedDelay(0.01)).toBe(0.1);
    expect(playedDelay(0.02)).toBe(0.02);
    const ends = frameEnds([0.5, 0.5]);
    expect(ends).toEqual([0.5, 1]);
    expect(frameAt(ends, 0.25)).toBe(0);
    expect(frameAt(ends, 0.75)).toBe(1);
    expect(frameAt(ends, 1.25)).toBe(0);
    expect(frameAt(ends, -0.25)).toBe(1);
    expect(frameAt([1], 5)).toBe(0);
  });

  it("tells animated GIF and PNG files from still ones by their bytes", () => {
    const read = (p: string) => new Uint8Array(readFileSync(p));
    expect(looksAnimated(read("tests/fixtures/overlay/blink.gif"))).toBe(true);
    expect(looksAnimated(read("tests/fixtures/overlay/blink-apng.png"))).toBe(true);
    expect(looksAnimated(read("tests/fixtures/overlay/sticker.png"))).toBe(false);
    expect(looksAnimated(read("tests/fixtures/sample.gif"))).toBe(true);
  });
});

describe("green screen: keying maths", () => {
  it("takes the screen channel from the key and measures key-ness against it", () => {
    expect(keyChannel([0, 177, 64])).toBe(1);
    expect(keyChannel([20, 60, 200])).toBe(2);
    expect(keyness(0.2, 0.7, 0.3, 1)).toBeCloseTo(0.4);
    // Yellow and skin score nothing on a green screen.
    expect(keyness(0.9, 0.9, 0.1, 1)).toBeCloseTo(0);
    expect(keyness(0.8, 0.6, 0.5, 1)).toBeLessThan(0);
  });

  it("ramps cover between the softness and tolerance points", () => {
    const r = ramp({ tolerance: 0.05, softness: 0.9 });
    expect(r.lo).toBeCloseTo(0.05);
    expect(r.hi).toBeCloseTo(0.95);
    expect(coverFromRatio(1, r)).toBe(0);
    expect(coverFromRatio(0, r)).toBe(1);
    expect(coverFromRatio(0.5, r)).toBeCloseTo(0.5);
  });

  it("finds a green or blue screen at the edges, and nothing in an ordinary picture", () => {
    const frame = (fill: (x: number, y: number) => [number, number, number]) => {
      const w = 200;
      const h = 120;
      const d = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const [r, g, b] = fill(x, y);
          d.set([r, g, b, 255], (y * w + x) * 4);
        }
      return { d, w, h };
    };
    // Green screen lit unevenly, a grey subject in the middle touching the bottom edge.
    const g = frame((x, y) =>
      Math.abs(x - 100) < 30 && y > 30 ? [128, 128, 128] : [40, Math.round(120 + x * 0.4), 60],
    );
    const found = detectKey(g.d, g.w, g.h);
    expect(found?.key[1]).toBeGreaterThan(150);
    expect(found?.share).toBeGreaterThan(0.6);
    const blue = frame(() => [20, 50, 200]);
    expect(keyChannel(detectKey(blue.d, blue.w, blue.h)?.key ?? [0, 0, 0])).toBe(2);
    const grey = frame((x) => [x, x, x]);
    expect(detectKey(grey.d, grey.w, grey.h)).toBeUndefined();
    expect(patchColor(g.d, g.w, g.h, 2, 2)).toEqual([40, 121, 60]);
  });

  it("fits a background by cover or contain, and times a short background video", () => {
    expect(fitRect({ width: 1000, height: 1000 }, hd, "cover")).toEqual({
      x: 0,
      y: -420,
      width: 1920,
      height: 1920,
    });
    expect(fitRect({ width: 1000, height: 1000 }, hd, "contain")).toEqual({
      x: 420,
      y: 0,
      width: 1080,
      height: 1080,
    });
    expect(backgroundTime(2.5, 2, "loop")).toBeCloseTo(0.5);
    expect(backgroundTime(2.5, 2, "hold", 0.04)).toBeCloseTo(1.98);
    expect(backgroundTime(1, 2, "loop")).toBe(1);
  });

  it("names the screen and reads colours both ways", () => {
    expect(screenName([0, 177, 64])).toBe("green screen");
    expect(screenName([20, 60, 200])).toBe("blue screen");
    expect(screenName([120, 110, 100])).toBe("#786e64 screen");
    expect(hex([0, 177, 64])).toBe("#00b140");
    expect(fromHex("#00B140")).toEqual([0, 177, 64]);
    expect(fromHex("green")).toBeUndefined();
  });

  it("writes an ffmpeg command for each background, with the even cut for odd sizes", () => {
    const o = ChromaKeyOptions.parse({ keyFrom: "auto" });
    const c = keyCommand(o, "in.mp4", "out.mp4", { width: 641, height: 361 }, 3, 2000, "copy");
    expect(c).toContain("chromakey=color=0x00b140");
    expect(c).toContain("despill=type=green");
    expect(c).toContain("crop=640:360:0:0[v]");
    const img = keyCommand(
      {
        ...o,
        background: { kind: "image", name: "bg.png", blob: new Blob([]), width: 10, height: 10 },
      },
      "in.mp4",
      "out.mp4",
      hd,
      3,
      2000,
      "none",
    );
    expect(img).toContain("-loop 1 -i bg.png");
    expect(img).toContain("force_original_aspect_ratio=increase,crop=1920:1080");
  });
});
