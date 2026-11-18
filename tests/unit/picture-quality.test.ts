import { describe, expect, it } from "vitest";
import {
  audioLabel,
  BitrateOptions,
  bitrateCommand,
  defaultKbps,
  niceKbps,
  planBitrate,
  preferredCodec,
  rateWords,
  sliderMaxKbps,
} from "@/tools/engines/bitrate/plan";
import {
  ClarityOptions,
  clarityFilter,
  denoiseH,
  estimateNoise,
  jobWords,
  medianNoise,
  strengthWord,
} from "@/tools/engines/clarity/options";
import { gaussianWeights } from "@/tools/engines/clarity/render";
import {
  barsKind,
  barsRect,
  combineBars,
  type Edges,
  frameBars,
  hasBars,
  sampleTimes,
  scaleBars,
} from "@/tools/engines/crop/bars";
import { CropOptions } from "@/tools/engines/crop/options";
import { nearestFrame, toGray } from "@/tools/engines/stabilize/analyze";
import {
  apply,
  compose,
  estimateMotion,
  type Gray,
  IDENTITY,
  invert,
  type Motion,
  plausible,
  pyramid,
} from "@/tools/engines/stabilize/motion";
import {
  analysisSize,
  StabilizeOptions,
  stabilizeCommand,
  stabilizeWords,
} from "@/tools/engines/stabilize/options";
import { cameraPath, planPath, smoothSeries, zoomNeeded } from "@/tools/engines/stabilize/path";
import type { MediaInfo } from "@/tools/engines/types";

/** A deterministic random generator (LCG). */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Normal deviates (Box-Muller). */
function gauss(r: () => number) {
  return Math.sqrt(-2 * Math.log(Math.max(1e-12, r()))) * Math.cos(2 * Math.PI * r());
}

/** A textured scene: smooth blobs plus sharp discs, values 0–255, `w`×`h`. */
function scene(w: number, h: number, seed = 1): Float32Array {
  const r = rng(seed);
  const img = new Float32Array(w * h);
  const blobs = Array.from({ length: 40 }, () => ({
    x: r() * w,
    y: r() * h,
    s: 6 + r() * 30,
    a: (r() - 0.5) * 160,
  }));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let v = 120;
      for (const b of blobs) {
        const d2 = (x - b.x) ** 2 + (y - b.y) ** 2;
        v += b.a * Math.exp(-d2 / (2 * b.s * b.s));
        if (d2 < (b.s / 2) ** 2) v += b.a > 0 ? 25 : -25;
      }
      img[y * w + x] = Math.max(0, Math.min(255, v));
    }
  return img;
}

/** Bilinear sample of a scene at (x, y), edges clamped. */
function sampleAt(img: Float32Array, w: number, h: number, x: number, y: number) {
  const cx = Math.max(0, Math.min(w - 1.001, x));
  const cy = Math.max(0, Math.min(h - 1.001, y));
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const fx = cx - x0;
  const fy = cy - y0;
  const i = y0 * w + x0;
  return (
    ((img[i] as number) * (1 - fx) + (img[i + 1] as number) * fx) * (1 - fy) +
    ((img[i + w] as number) * (1 - fx) + (img[i + w + 1] as number) * fx) * fy
  );
}

/** A view of a larger scene through `m` (centred view point → centred scene point). */
function view(big: Float32Array, bw: number, bh: number, w: number, h: number, m: Motion): Gray {
  const data = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [X, Y] = apply(m, x - (w - 1) / 2, y - (h - 1) / 2);
      data[y * w + x] = sampleAt(big, bw, bh, X + (bw - 1) / 2, Y + (bh - 1) / 2);
    }
  return { data, width: w, height: h };
}

describe("stabilize: motion between frames", () => {
  const bw = 400;
  const bh = 260;
  const big = scene(bw, bh, 7);
  const turn = (deg: number, tx: number, ty: number, s = 1): Motion => ({
    a: s * Math.cos((deg * Math.PI) / 180),
    b: s * Math.sin((deg * Math.PI) / 180),
    tx,
    ty,
  });

  it("recovers a known shift, turn and scale to a fraction of a pixel", () => {
    const a = turn(0, 0, 0);
    const b = turn(1.2, 5.4, -3.1, 1.02);
    const fa = view(big, bw, bh, 320, 180, a);
    const fb = view(big, bw, bh, 320, 180, b);
    // Frame b's point p shows scene b(p); frame a shows it at a⁻¹(b(p)).
    const truth = compose(invert(a), b);
    const e = estimateMotion(pyramid(fa), pyramid(fb));
    expect(e.agreement).toBeGreaterThan(0.8);
    expect(e.motion.tx).toBeCloseTo(truth.tx, 1);
    expect(e.motion.ty).toBeCloseTo(truth.ty, 1);
    expect(Math.atan2(e.motion.b, e.motion.a)).toBeCloseTo(Math.atan2(truth.b, truth.a), 3);
    expect(Math.hypot(e.motion.a, e.motion.b)).toBeCloseTo(1.02, 3);
    expect(plausible(e, 320, 180)).toBe(true);
  });

  it("finds a fast pan of 24 px through the pyramid", () => {
    const fa = view(big, bw, bh, 320, 180, turn(0, 0, 0));
    const fb = view(big, bw, bh, 320, 180, turn(0, 24, 9));
    const e = estimateMotion(pyramid(fa), pyramid(fb));
    expect(e.motion.tx).toBeCloseTo(24, 0);
    expect(e.motion.ty).toBeCloseTo(9, 0);
  });

  it("ignores a subject that moves on its own", () => {
    const fa = view(big, bw, bh, 320, 180, turn(0, 0, 0));
    const fb = view(big, bw, bh, 320, 180, turn(0, 3, 2));
    // A bright box crossing a fifth of the frame, in a different place in each frame.
    for (const [f, x0] of [
      [fa, 40],
      [fb, 90],
    ] as const)
      for (let y = 60; y < 130; y++) for (let x = x0; x < x0 + 70; x++) f.data[y * 320 + x] = 250;
    const e = estimateMotion(pyramid(fa), pyramid(fb));
    expect(e.motion.tx).toBeCloseTo(3, 0);
    expect(e.motion.ty).toBeCloseTo(2, 0);
  });

  it("calls a cut implausible", () => {
    const fa = view(big, bw, bh, 320, 180, turn(0, 0, 0));
    const other = scene(320, 180, 99);
    const e = estimateMotion(pyramid(fa), pyramid({ data: other, width: 320, height: 180 }));
    expect(plausible(e, 320, 180)).toBe(false);
  });

  it("composes and inverts similarities", () => {
    const m = turn(10, 3, -4, 1.1);
    const back = compose(invert(m), m);
    expect(back.a).toBeCloseTo(1, 9);
    expect(back.b).toBeCloseTo(0, 9);
    expect(back.tx).toBeCloseTo(0, 9);
    expect(back.ty).toBeCloseTo(0, 9);
  });
});

describe("stabilize: path", () => {
  it("smoothing keeps a steady pan steady up to both ends", () => {
    const v = Array.from({ length: 50 }, (_, i) => 3 * i + 7);
    const s = smoothSeries(v, 10);
    for (let i = 0; i < v.length; i++) expect(s[i]).toBeCloseTo(v[i] as number, 6);
  });

  it("zoomNeeded is 1 for no correction and grows with a shift", () => {
    expect(zoomNeeded(IDENTITY, 320, 180)).toBe(1);
    // A 18 px shift of a 360-tall frame needs 180 / (180 − 18) = 1.111.
    expect(zoomNeeded({ ...IDENTITY, ty: 18 }, 320, 180)).toBeCloseTo(180 / 162, 6);
    expect(zoomNeeded({ ...IDENTITY, tx: 400 }, 320, 180)).toBe(Number.POSITIVE_INFINITY);
  });

  it("takes out shake, keeps the pan and never shows an edge", () => {
    const r = rng(3);
    // Frame k's camera: a pan of 2 px per frame plus ±6 px shake and ±0.8° turn.
    const cams: Motion[] = Array.from({ length: 120 }, (_, k) => {
      const th = ((r() - 0.5) * 1.6 * Math.PI) / 180;
      return {
        a: Math.cos(th),
        b: Math.sin(th),
        tx: 2 * k + (r() - 0.5) * 12,
        ty: (r() - 0.5) * 12,
      };
    });
    // Motions between neighbours: Mₖ = Cₖ₋₁⁻¹ ∘ Cₖ.
    const motions = cams.map((c, k) =>
      k === 0 ? IDENTITY : compose(invert(cams[k - 1] as Motion), c),
    );
    const path = cameraPath(motions);
    // The rebuilt path matches the cameras relative to the first.
    const rel = compose(invert(cams[0] as Motion), cams[60] as Motion);
    expect(path[60]?.tx).toBeCloseTo(rel.tx, 6);
    const plan = planPath(motions, { sigma: 30, maxZoom: 1.15, fill: true, hw: 320, hh: 180 });
    expect(plan.zoom).toBeGreaterThan(1);
    expect(plan.zoom).toBeLessThanOrEqual(1.15);
    for (const w of plan.warps)
      expect(zoomNeeded(w, 320, 180)).toBeLessThanOrEqual(plan.zoom + 1e-6);
    // Steadied view per frame: Cₖ ∘ Wₖ maps output to frame 0; its jerk (second difference) is small.
    const steady = path.map((c, k) => compose(c, plan.warps[k] as Motion));
    const jerk = (pick: (m: Motion) => number, ms: Motion[]) => {
      let s = 0;
      for (let k = 2; k < ms.length; k++)
        s +=
          (pick(ms[k] as Motion) - 2 * pick(ms[k - 1] as Motion) + pick(ms[k - 2] as Motion)) ** 2;
      return Math.sqrt(s / (ms.length - 2));
    };
    expect(jerk((m) => m.tx, path)).toBeGreaterThan(5);
    expect(jerk((m) => m.tx, steady)).toBeLessThan(0.5);
    expect(jerk((m) => m.ty, steady)).toBeLessThan(0.5);
    // The pan is kept: frame 119 is still about 238 px along.
    expect(steady[119]?.tx).toBeGreaterThan(200);
  });

  it("borders keep the frame's size", () => {
    const motions = [IDENTITY, { ...IDENTITY, tx: 5 }, { ...IDENTITY, tx: -5 }, IDENTITY];
    const plan = planPath(motions, { sigma: 2, maxZoom: 1.1, fill: false, hw: 100, hh: 50 });
    expect(plan.zoom).toBe(1);
  });

  it("analysis size keeps the shape at 320 wide", () => {
    expect(analysisSize(1920, 1080)).toEqual({ width: 320, height: 180 });
    expect(analysisSize(1080, 1920)).toEqual({ width: 320, height: 568 });
    expect(analysisSize(200, 100)).toEqual({ width: 200, height: 100 });
  });

  it("nearest frame by timestamp", () => {
    const t = [0, 0.033, 0.067, 0.1];
    expect(nearestFrame(t, 0.055)).toBe(2);
    expect(nearestFrame(t, 0.04)).toBe(1);
    expect(nearestFrame(t, 5)).toBe(3);
    expect(nearestFrame([], 1)).toBe(-1);
  });

  it("grey from RGBA uses BT.601 weights", () => {
    const g = toGray(new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]), 2, 1);
    expect(g.data[0]).toBeCloseTo(76.245, 2);
    expect(g.data[1]).toBeCloseTo(149.685, 2);
  });

  it("options, words and the vidstab command", () => {
    const o = StabilizeOptions.parse({});
    expect(o).toEqual({ strength: "medium", edges: "zoom" });
    expect(stabilizeWords(o, 1.09)).toBe("medium, zoomed 9%");
    expect(stabilizeWords({ ...o, edges: "borders" })).toBe("medium, borders at moving edges");
    const cmd = stabilizeCommand("a.mp4", "a-stabilized.mp4", o, 30, 2000, "copy", "");
    expect(cmd).toContain("vidstabdetect");
    expect(cmd).toContain("smoothing=60:optzoom=1");
    expect(cmd).toContain("-c:a copy");
  });
});

describe("clarity: grain and options", () => {
  const W = 256;
  const H = 256;
  const picture = (sigma: number, seed = 5) => {
    const r = rng(seed);
    const base = scene(W, H, 11);
    const rgba = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      const v = (base[i] as number) * 0.6 + 50 + sigma * gauss(r);
      rgba[i * 4] = v;
      rgba[i * 4 + 1] = v;
      rgba[i * 4 + 2] = v;
      rgba[i * 4 + 3] = 255;
    }
    return rgba;
  };

  it("measures added grain within 15%", () => {
    for (const sigma of [3, 6, 10]) {
      const n = estimateNoise(picture(sigma), W, H);
      expect(n).toBeGreaterThan(sigma * 0.85);
      expect(n).toBeLessThan(sigma * 1.15);
    }
  });

  it("measures a clean picture under 1.5 levels", () => {
    expect(estimateNoise(picture(0), W, H)).toBeLessThan(1.5);
  });

  it("median of frames ignores one odd frame", () => {
    expect(medianNoise([3, 3.2, 40, 2.9, 3.1])).toBe(3.1);
    expect(medianNoise([])).toBe(0);
  });

  it("defaults, words and filters", () => {
    const o = ClarityOptions.parse({ job: "sharpen" });
    expect(o.strength).toBe(1);
    expect(strengthWord("sharpen", 1.5)).toBe("medium");
    expect(strengthWord("denoise", 1.4)).toBe("strong");
    expect(strengthWord("sharpen", 0.75)).toBe("50%");
    expect(jobWords({ ...o, strength: 1.5 })).toBe("medium sharpening");
    expect(clarityFilter({ ...o, strength: 1.5 })).toBe(
      "unsharp=luma_msize_x=7:luma_msize_y=7:luma_amount=1.50:chroma_amount=0",
    );
    expect(clarityFilter({ job: "denoise", strength: 1, radius: 1, noise: 8.7 })).toBe(
      "nlmeans=s=6.1:p=3:r=5",
    );
    expect(denoiseH(8.7, 1)).toBeCloseTo(8.7 / 255, 9);
    // A clean video is filtered as if it had a little grain, not divided by zero.
    expect(denoiseH(0, 1)).toBeGreaterThan(0);
  });

  it("Gaussian weights sum to one over the kernel", () => {
    for (const sigma of [0.5, 1, 1.8, 4]) {
      const { radius, weights } = gaussianWeights(sigma);
      let s = weights[0] as number;
      for (let k = 1; k <= radius; k++) s += 2 * (weights[k] as number);
      expect(s).toBeCloseTo(1, 6);
    }
  });
});

describe("black bars", () => {
  /** A frame with bars of the given sizes around a textured picture. */
  function framed(w: number, h: number, b: Edges, opts: { dark?: boolean; sub?: number } = {}) {
    const rgba = new Uint8ClampedArray(w * h * 4);
    const r = rng(9);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const inside = y >= b.top && y < h - b.bottom && x >= b.left && x < w - b.right;
        // Bars: black with compression noise; picture: mid grey texture (or near black when dark).
        const v = inside ? (opts.dark ? 10 + r() * 12 : 60 + r() * 150) : r() * 14;
        rgba[i] = v;
        rgba[i + 1] = v;
        rgba[i + 2] = v;
        rgba[i + 3] = 255;
      }
    if (opts.sub)
      // White subtitle strokes in the bottom bar, `opts.sub` rows above the bottom edge.
      for (let y = h - opts.sub; y < h - opts.sub + 8; y++)
        for (let x = w * 0.3; x < w * 0.7; x += 3) {
          const i = (y * w + Math.floor(x)) * 4;
          rgba[i] = rgba[i + 1] = rgba[i + 2] = 240;
        }
    return rgba;
  }
  const lb = { top: 40, bottom: 40, left: 0, right: 0 };

  it("finds letterbox and pillarbox in one frame", () => {
    expect(frameBars(framed(320, 180, lb), 320, 180)).toEqual(lb);
    const pb = { top: 0, bottom: 0, left: 40, right: 38 };
    expect(frameBars(framed(320, 180, pb), 320, 180)).toEqual(pb);
  });

  it("counts a line of bleed beside the bar as bar (WebKit's drawing of the fixture)", () => {
    const rgba = framed(320, 180, lb);
    // The first picture row mixed with the bar: mean about 30, max about 40.
    for (let x = 0; x < 320; x++) {
      const i = (40 * 320 + x) * 4;
      const v = 20 + (x % 3) * 10;
      rgba[i] = rgba[i + 1] = rgba[i + 2] = v;
    }
    expect(frameBars(rgba, 320, 180)?.top).toBe(41);
  });

  it("skips a frame that is dark everywhere", () => {
    expect(frameBars(framed(320, 180, lb, { dark: true }), 320, 180)).toBeNull();
  });

  it("agrees across frames despite dark scenes and subtitles, and names the subtitles", () => {
    const src = { width: 320, height: 180 };
    const frames = [
      ...Array.from({ length: 12 }, (_, i) => ({
        t: i,
        bars: frameBars(framed(320, 180, lb), 320, 180),
      })),
      // Dark scenes: content dims near the edge, so the bar reads larger.
      { t: 20, bars: { ...lb, top: 55, bottom: 60 } },
      { t: 21, bars: { ...lb, top: 52, bottom: 49 } },
      { t: 22, bars: null },
      // Subtitles inside the bottom bar.
      { t: 30, bars: frameBars(framed(320, 180, lb, { sub: 30 }), 320, 180) },
      { t: 31, bars: frameBars(framed(320, 180, lb, { sub: 30 }), 320, 180) },
    ];
    const r = combineBars(frames, src);
    expect(r.bars).toEqual(lb);
    expect(r.frames).toBe(16);
    expect(r.sampled).toBe(17);
    expect(r.intrusions.bottom?.times).toEqual([30, 31]);
    expect(r.intrusions.bottom?.keep).toBe(22);
    expect(r.intrusions.top).toBeUndefined();
    expect(barsKind(r.bars)).toBe("letterbox bars");
    expect(barsRect(r.bars, src)).toEqual({ x: 0, y: 40, width: 320, height: 100 });
    // Keeping the subtitle strip: the bottom edge moves down to 22 px from the bottom.
    expect(barsRect(r.bars, src, { bottom: r.intrusions.bottom?.keep })).toEqual({
      x: 0,
      y: 40,
      width: 320,
      height: 118,
    });
  });

  it("reports no bars for a full picture, and treats thin edges as none", () => {
    const src = { width: 320, height: 180 };
    const none = { top: 0, bottom: 0, left: 0, right: 0 };
    const thin = { top: 2, bottom: 3, left: 0, right: 1 };
    const r = combineBars(
      Array.from({ length: 6 }, (_, t) => ({ t, bars: t % 2 ? none : thin })),
      src,
    );
    expect(hasBars(r.bars)).toBe(false);
  });

  it("scales bars to the source and samples between 5% and 95%", () => {
    expect(scaleBars(lb, { width: 320, height: 180 }, { width: 1920, height: 1080 })).toEqual({
      top: 240,
      bottom: 240,
      left: 0,
      right: 0,
    });
    const t = sampleTimes(100);
    expect(t).toHaveLength(24);
    expect(t[0]).toBeCloseTo(5, 6);
    expect(t[23]).toBeCloseTo(95, 6);
  });

  it("the page's flag passes the crop schema", () => {
    expect(CropOptions.parse({ x: 0, y: 40, width: 320, height: 100, bars: true }).bars).toBe(true);
  });
});

describe("change bitrate", () => {
  const info = (over: Partial<MediaInfo> = {}): MediaInfo => ({
    container: "mp4",
    durationSec: 60,
    sizeBytes: 100e6,
    video: { codec: "avc", width: 1920, height: 1080, fps: 30, bitrate: 12_000_000 },
    audio: [{ codec: "aac", channels: 2, sampleRate: 48000, bitrate: 128_000 }],
    ...over,
  });

  it("rounds to figures people type", () => {
    expect(niceKbps(4666)).toBe(4700);
    expect(niceKbps(512)).toBe(500);
    expect(niceKbps(12_345)).toBe(12_000);
    expect(niceKbps(0)).toBe(100);
  });

  it("defaults to the balanced density, never above 70% of the source", () => {
    // Balanced 1080p30: 0.075 × 1920 × 1080 × 30 = 4.67 Mb/s.
    expect(defaultKbps(info())).toBe(4700);
    const thin = info({
      video: { codec: "avc", width: 1920, height: 1080, fps: 30, bitrate: 2_000_000 },
    });
    expect(defaultKbps(thin)).toBe(1400);
    expect(sliderMaxKbps(info())).toBeGreaterThanOrEqual(36_000);
  });

  it("plans sound copy, re-encode and removal, and the size", () => {
    const o = BitrateOptions.parse({ videoKbps: 4000 });
    const copy = planBitrate(info(), "a.mp4", o);
    expect(copy.sound).toBe("copy");
    expect(copy.to).toBe("mp4");
    // (4,000 + 128) kb/s × 60 s ÷ 8 = 30.96 MB, plus 1%.
    expect(copy.bytes).toBe(Math.round(30_960_000 * 1.01));
    expect(planBitrate(info(), "a.mp4", { ...o, audio: "192" })).toMatchObject({
      sound: "encode",
      audioBps: 192_000,
    });
    expect(planBitrate(info(), "a.mp4", { ...o, audio: "none" }).sound).toBe("dropped");
    const opus = info({ audio: [{ codec: "opus", channels: 2, sampleRate: 48000 }] });
    expect(planBitrate(opus, "a.mp4", o)).toMatchObject({ sound: "encode", audioBps: 128_000 });
    expect(planBitrate(info({ audio: [] }), "a.mp4", o).sound).toBe("none");
    expect(planBitrate(info(), "a.webm", { ...o, codec: "vp9", audio: "96" })).toMatchObject({
      to: "webm",
      audioCodec: "opus",
    });
  });

  it("keeps the source's codec where it can be written", () => {
    expect(preferredCodec(info())).toBe("avc");
    expect(
      preferredCodec(info({ video: { codec: "hevc", width: 1920, height: 1080, fps: 30 } })),
    ).toBe("hevc");
    expect(
      preferredCodec(info({ video: { codec: "prores", width: 1920, height: 1080, fps: 30 } })),
    ).toBe("avc");
  });

  it("words and the ffmpeg command", () => {
    expect(rateWords(4500)).toBe("4,500 kb/s");
    expect(rateWords(12_500)).toBe("12.5 Mb/s");
    expect(audioLabel("copy")).toBe("Copy");
    expect(audioLabel("128")).toBe("128 kb/s");
    const o = BitrateOptions.parse({ videoKbps: 3000, mode: "constant" });
    const plan = planBitrate(info(), "a.mp4", o);
    expect(bitrateCommand("a.mp4", "a-3000k.mp4", plan, "constant", "")).toBe(
      "ffmpeg -i a.mp4 -c:v libx264 -b:v 3000k -minrate 3000k -maxrate 3000k -bufsize 3000k -c:a copy -movflags +faststart a-3000k.mp4",
    );
  });
});
