import { describe, expect, it } from "vitest";
import { compareFor } from "@/components/tool/compare/context";
import {
  actualPixels,
  boxRect,
  clampView,
  clipRight,
  fit,
  IDENTITY,
  placeInto,
  sameShape,
  sideBySide,
  transformed,
  visible,
  zoomAt,
} from "@/components/tool/compare/geometry";
import { loudnessGains } from "@/components/tool/compare/loudness";
import { correctedRate, DEADBAND_S, followerTime, START_S } from "@/components/tool/compare/sync";
import type { MediaInfo } from "@/tools/engines/types";

const box = { width: 800, height: 450 };

describe("compare geometry", () => {
  it("fits a picture centred in its slot", () => {
    expect(fit(boxRect(box), { width: 1920, height: 1080 })).toEqual({
      left: 0,
      top: 0,
      width: 800,
      height: 450,
    });
    const tall = fit(boxRect(box), { width: 1080, height: 1920 });
    expect(tall.height).toBe(450);
    expect(tall.left).toBeCloseTo((800 - 253.125) / 2);
  });

  it("wipes only between pictures of the same shape", () => {
    expect(sameShape({ width: 1920, height: 1080 }, { width: 1280, height: 720 })).toBe(true);
    // Odd-edge rounding (ADR-0060) stays a wipe.
    expect(sameShape({ width: 1920, height: 1080 }, { width: 1918, height: 1080 })).toBe(true);
    expect(sameShape({ width: 1920, height: 1080 }, { width: 1080, height: 1920 })).toBe(false);
    expect(sameShape({ width: 1920, height: 1080 }, { width: 1080, height: 1080 })).toBe(false);
  });

  it("puts a portrait crop beside a landscape source and stacks two wide pictures on a phone", () => {
    const row = sideBySide(box, { width: 1920, height: 1080 }, { width: 1080, height: 1920 }, 8);
    expect(row.direction).toBe("row");
    expect(row.after.left).toBeGreaterThanOrEqual(row.before.left + row.before.width);
    const phone = { width: 342, height: 400 };
    const col = sideBySide(phone, { width: 1920, height: 1080 }, { width: 1920, height: 1080 }, 8);
    expect(col.direction).toBe("column");
    expect(col.after.top).toBeGreaterThanOrEqual(col.before.top + col.before.height);
  });

  it("moves the result's whole-box picture onto its slot by transform", () => {
    const content = fit(boxRect(box), { width: 1080, height: 1920 });
    const pair = sideBySide(box, { width: 1920, height: 1080 }, { width: 1080, height: 1920 }, 8);
    const v = placeInto(box, content, pair.after);
    const r = transformed(box, content, v);
    expect(r.left).toBeCloseTo(pair.after.left);
    expect(r.top).toBeCloseTo(pair.after.top);
    expect(r.width).toBeCloseTo(pair.after.width);
  });

  it("zooms to actual pixels about a point and keeps the picture covering the box", () => {
    const media = { width: 1920, height: 1080 };
    const content = fit(boxRect(box), media);
    const s = actualPixels(content, media);
    expect(s).toBeCloseTo(2.4);
    // A picture smaller than the box at 1:1 is not zoomed.
    expect(actualPixels(content, { width: 640, height: 360 })).toBe(1);
    const at = { x: 600, y: 225 };
    const v = zoomAt(box, content, s, at);
    // The point under the divider stays put.
    const local = (at.x - 400 - v.x) / v.scale + 400;
    expect(local).toBeCloseTo(600);
    // At the edge, the view clamps so no stage shows beside the picture.
    const edge = zoomAt(box, content, s, { x: 800, y: 0 });
    const r = transformed(box, content, edge);
    expect(r.left + r.width).toBeCloseTo(800);
    expect(r.top).toBeCloseTo(0);
    const far = clampView(box, content, { scale: s, x: 10_000, y: -10_000 });
    expect(far.x).toBeCloseTo((800 * s - 800) / 2);
    expect(visible(box, content, far)).toEqual({ left: 0, top: 0, width: 800, height: 450 });
  });

  it("clips the source at the divider in its own pixels, zoomed or not", () => {
    expect(clipRight(box, IDENTITY, 300)).toBe(500);
    const v = { scale: 2, x: 100, y: 0 };
    // Box x 500 maps to local 400 + (500 - 400 - 100) / 2 = 400.
    expect(clipRight(box, v, 500)).toBeCloseTo(400);
    expect(clipRight(box, IDENTITY, -10)).toBe(800);
    expect(clipRight(box, IDENTITY, 900)).toBe(0);
  });
});

describe("compare sync", () => {
  it("plays at the master's rate inside the dead band and nudges outside it", () => {
    expect(correctedRate(1, DEADBAND_S / 2, 0.1)).toBe(1);
    expect(correctedRate(1, 0.02, 0.1)).toBeCloseTo(0.94);
    expect(correctedRate(1, -0.02, 0.1)).toBeCloseTo(1.06);
    // Capped: a heard follower never moves more than 3 %.
    expect(correctedRate(1, 0.2, 0.03)).toBeCloseTo(0.97);
    expect(correctedRate(2, 0.01, 0.1)).toBeCloseTo(1.94);
    expect(correctedRate(1, Number.NaN, 0.1)).toBe(1);
    // A correction starts only past START_S (a rate change costs the browser a few ms itself).
    expect(correctedRate(1, 0.008, 0.1, START_S)).toBe(1);
    expect(correctedRate(1, 0.02, 0.1, START_S)).toBeCloseTo(0.94);
  });

  it("maps result time to source time for a speed change, inside the source", () => {
    expect(followerTime(2, 2, 10)).toBe(4);
    expect(followerTime(8, 2, 10)).toBe(10);
    expect(followerTime(-1, 1, 10)).toBe(0);
    expect(followerTime(3, 1, Number.NaN)).toBe(3);
  });
});

describe("loudness match", () => {
  it("turns the louder side down to the quieter one", () => {
    const g = loudnessGains(-14, -20);
    expect(g?.after).toBe(1);
    expect(20 * Math.log10(g?.before ?? 0)).toBeCloseTo(-6);
    const h = loudnessGains(-23, -16);
    expect(h?.before).toBe(1);
    expect(20 * Math.log10(h?.after ?? 0)).toBeCloseTo(-7);
  });

  it("leaves silence and unrelated levels alone", () => {
    expect(loudnessGains(Number.NEGATIVE_INFINITY, -20)).toBeUndefined();
    expect(loudnessGains(-10, -40)).toBeUndefined();
  });
});

describe("compareFor", () => {
  const video: MediaInfo = {
    container: "MP4",
    durationSec: 3,
    sizeBytes: 1000,
    video: { codec: "avc", width: 640, height: 360, fps: 30 },
    audio: [{ codec: "aac", channels: 2, sampleRate: 48000 }],
  } as MediaInfo;
  const src = new File(["x"], "a.mp4", { type: "video/mp4" });
  const out = new File(["y"], "a-small.mp4", { type: "video/mp4" });
  const sound = new File(["z"], "a.mp3", { type: "audio/mpeg" });

  it("defaults to a wipe for a video and a switch for a sound", () => {
    expect(compareFor({}, {}, video, src, out, {})?.spec).toEqual({ what: "picture" });
    expect(compareFor({}, {}, video, src, sound, {})?.spec).toEqual({ what: "sound" });
  });

  it("honours the opt-out and the page's own choice", () => {
    expect(compareFor({ compare: false }, {}, video, src, out, {})).toBeUndefined();
    expect(compareFor({ compare: () => false }, {}, video, src, out, {})).toBeUndefined();
    expect(
      compareFor(
        { compare: () => ({ what: "sound", keepLoudness: true }) },
        {},
        video,
        src,
        out,
        {},
      )?.spec.keepLoudness,
    ).toBe(true);
  });

  it("has nothing to compare for several inputs or outputs, a speed it cannot follow, or a source only a fallback reads", () => {
    expect(compareFor({}, {}, video, src, out, { inputs: 2 })).toBeUndefined();
    expect(compareFor({}, {}, video, src, out, { outputs: 3 })).toBeUndefined();
    expect(
      compareFor({ compare: () => ({ what: "picture", timeScale: 8 }) }, {}, video, src, out, {}),
    ).toBeUndefined();
    const avi = { ...video, container: "AVI" } as MediaInfo;
    expect(
      compareFor({}, {}, avi, new File(["x"], "a.avi", { type: "video/x-msvideo" }), out, {}),
    ).toBeUndefined();
    const prores = { ...video, video: { ...video.video, decodable: false } } as MediaInfo;
    expect(compareFor({}, {}, prores, src, out, {})).toBeUndefined();
    // A still is not compared.
    const png = new File(["p"], "a.png", { type: "image/png" });
    expect(compareFor({}, {}, video, src, png, {})).toBeUndefined();
  });
});
