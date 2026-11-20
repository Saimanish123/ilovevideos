import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyRamp,
  backgroundReady,
  blurSigma,
  EDGE_CENTRE,
  edgeRamp,
  effectWords,
  matteCommand,
  modelFor,
  PortraitMatteOptions,
} from "@/tools/engines/portrait-matte/options";
import { passSizes } from "@/tools/engines/portrait-matte/render";
import { flicker, steady, toBytes, uncertainty } from "@/tools/engines/portrait-matte/smooth";

const o = (patch: Partial<PortraitMatteOptions> = {}) => PortraitMatteOptions.parse({ ...patch });

describe("portrait matte: model choice", () => {
  it("wide pictures get the 144×256 model, square and vertical the 256×256 one", () => {
    expect(modelFor(1920, 1080)).toBe("landscape");
    expect(modelFor(640, 360)).toBe("landscape");
    expect(modelFor(1440, 1080)).toBe("landscape"); // 4:3 sits on the boundary
    expect(modelFor(1280, 1024)).toBe("general"); // 5:4
    expect(modelFor(1080, 1080)).toBe("general");
    expect(modelFor(1080, 1920)).toBe("general");
  });

  it("the model files on disk are the sizes the loading line states", () => {
    for (const [kind, bytes] of [
      ["landscape", 123_195 + 212_980],
      ["general", 119_532 + 212_900],
    ] as const) {
      const dir = `public/models/selfie-segmenter/${kind}/1`;
      const total =
        readFileSync(`${dir}/model.json`).length +
        readFileSync(`${dir}/group1-shard1of1.bin`).length;
      expect(total).toBe(bytes);
      const json = JSON.parse(readFileSync(`${dir}/model.json`, "utf8"));
      expect(json.format).toBe("graph-model");
      expect(json.weightsManifest[0].paths).toEqual(["group1-shard1of1.bin"]);
      // The graph needs no op outside the kernels tfjs.ts registers (checked by the e2e run too).
      const ops = new Set<string>(json.modelTopology.node.map((n: { op: string }) => n.op));
      for (const op of ops)
        expect([
          "Const",
          "Placeholder",
          "_FusedConv2D",
          "FusedDepthwiseConv2dNative",
          "Mul",
          "AddV2",
          "Relu6",
          "Sigmoid",
          "AvgPool",
          "Mean",
          "ResizeBilinear",
          "Shape",
          "StridedSlice",
          "Pack",
          "Conv2DBackpropInput",
          "BiasAdd",
          "Sub",
          "ConcatV2",
          "Identity",
        ]).toContain(op);
    }
  });
});

describe("portrait matte: options maths", () => {
  it("blur strength is a share of the shorter edge, so preview and file look alike", () => {
    expect(blurSigma(40, { width: 1920, height: 1080 })).toBeCloseTo(21.6, 5);
    expect(blurSigma(40, { width: 640, height: 360 })).toBeCloseTo(7.2, 5);
    expect(blurSigma(100, { width: 1080, height: 1920 })).toBeCloseTo(54, 5);
    expect(blurSigma(1, { width: 64, height: 36 })).toBe(0.5);
  });

  it("the edge ramp sits a little above ½ by default and moves with the edge position", () => {
    const r = edgeRamp({ edge: 35, shift: 0 });
    expect((r.lo + r.hi) / 2).toBeCloseTo(EDGE_CENTRE, 6);
    expect(applyRamp(EDGE_CENTRE, r)).toBeCloseTo(0.5, 6);
    expect(applyRamp(r.lo, r)).toBe(0);
    expect(applyRamp(r.hi, r)).toBe(1);
    // Tighter needs more certainty: the same value is less person.
    expect(applyRamp(0.5, edgeRamp({ edge: 35, shift: -50 }))).toBeLessThan(0.1);
    expect(applyRamp(0.5, edgeRamp({ edge: 35, shift: 50 }))).toBeGreaterThan(0.9);
    // Crisp edges are nearly a step.
    const crisp = edgeRamp({ edge: 0, shift: 0 });
    expect(crisp.hi - crisp.lo).toBeCloseTo(0.04, 6);
  });

  it("names the effect in words, and blocks only an image or video without its file", () => {
    expect(effectWords(o())).toBe("Background blurred, medium");
    expect(effectWords(o({ blur: 80 }))).toBe("Background blurred, strong");
    expect(effectWords(o({ effect: "color", color: [255, 255, 255] }))).toBe(
      "Background removed, on #FFFFFF",
    );
    expect(effectWords(o({ output: "mask" }))).toBe("Person mask only");
    expect(backgroundReady(o({ effect: "image" }))).toBe(false);
    expect(backgroundReady(o({ effect: "video" }))).toBe(false);
    expect(backgroundReady(o({ effect: "image", output: "mask" }))).toBe(true);
    const img = {
      kind: "image" as const,
      name: "beach.jpg",
      blob: new Blob([]),
      width: 4,
      height: 3,
    };
    expect(backgroundReady(o({ effect: "image", background: img }))).toBe(true);
    expect(effectWords(o({ effect: "image", background: img }))).toBe(
      "Background replaced with a picture",
    );
  });

  it("the FFmpeg command composites with a mask file, blur or colour, even size", () => {
    const blur = matteCommand(
      o(),
      "in.mp4",
      "in-blurred.mp4",
      { width: 641, height: 360 },
      3,
      900,
      "copy",
    );
    expect(blur).toContain("gblur=sigma=7.2");
    expect(blur).toContain("-i mask.mp4");
    expect(blur).toContain("alphamerge");
    expect(blur).toContain("-c:a copy");
    expect(blur).toContain("crop=640:360");
    const color = matteCommand(
      o({ effect: "color", color: [0, 177, 64] }),
      "a.mp4",
      "b.mp4",
      { width: 640, height: 360 },
      2,
      800,
      "none",
    );
    expect(color).toContain("color=c=0x00b140:s=640x360:d=2.000");
    expect(color).toContain("-an");
    expect(
      matteCommand(
        o({ output: "mask" }),
        "a.mp4",
        "a-mask.mp4",
        { width: 640, height: 360 },
        2,
        800,
        "none",
      ),
    ).toMatch(/^# /);
  });

  it("guided filter and blur run at sizes that keep their kernels small", () => {
    const s = passSizes({ width: 1920, height: 1080 }, 21.6);
    expect(s.guide).toEqual({ width: 512, height: 288 });
    expect(s.blurSigma).toBeLessThanOrEqual(6.01);
    expect(s.blur.width).toBe(Math.round(1920 * (6 / 21.6)));
    const small = passSizes({ width: 320, height: 180 }, 2);
    expect(small.guide).toEqual({ width: 320, height: 180 });
    expect(small.blur).toEqual({ width: 320, height: 180 });
  });
});

describe("portrait matte: steadying over time", () => {
  it("uncertainty is 1 at one half and 0 when the model is sure", () => {
    expect(uncertainty(0.5)).toBe(1);
    expect(uncertainty(0)).toBeCloseTo(0, 2);
    expect(uncertainty(1)).toBeCloseTo(0, 2);
    expect(uncertainty(0.3)).toBeGreaterThan(uncertainty(0.1));
  });

  it("sure pixels keep their new value; unsure ones lean on their neighbours in time", () => {
    const cur = new Float32Array([1, 0, 0.5, 0.5]);
    const prev = new Float32Array([0, 1, 1, 0.2]);
    const next = new Float32Array([0, 1, 1, 0.6]);
    steady(cur, prev, next);
    expect(cur[0]).toBeCloseTo(1, 2); // a person who just arrived is not dragged behind
    expect(cur[1]).toBeCloseTo(0, 2);
    expect(cur[2]).toBeCloseTo(0.5 + 0.5 * 0.9, 5);
    expect(cur[3]).toBeCloseTo(0.5 + (0.4 - 0.5) * 0.9, 5);
    // Without neighbours nothing changes.
    const alone = new Float32Array([0.4]);
    steady(alone, undefined, undefined);
    expect(alone[0]).toBeCloseTo(0.4, 6);
  });

  it("cuts flicker on a noisy edge and leaves a still mask still", () => {
    // An edge pixel the model scores 0.45 and 0.55 by turns, frame after frame.
    let rng = 1;
    const noise = () => {
      rng = (rng * 16807) % 2147483647;
      return rng / 2147483647 - 0.5;
    };
    const raw: Float32Array[] = Array.from({ length: 60 }, () =>
      Float32Array.from({ length: 50 }, () => 0.5 + 0.12 * noise()),
    );
    const smoothed: Float32Array[] = [];
    let prev: Float32Array | undefined;
    for (let f = 0; f < raw.length; f++) {
      const c = new Float32Array(raw[f] as Float32Array);
      steady(c, prev, raw[f + 1]);
      smoothed.push(c);
      prev = c;
    }
    expect(flicker(smoothed)).toBeLessThan(flicker(raw) * 0.4);
    expect(flicker([new Float32Array([1, 0]), new Float32Array([1, 0])])).toBe(0);
  });

  it("bytes are the mask scaled to 0 to 255 and clamped", () => {
    expect([...toBytes(new Float32Array([0, 0.5, 1, 1.4, -0.2]))]).toEqual([0, 128, 255, 255, 0]);
  });
});
