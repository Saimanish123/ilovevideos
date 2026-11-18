import { describe, expect, it } from "vitest";
import {
  audioUnchanged,
  gainAt,
  outputContainer,
  pickRoles,
  placement,
  softClip,
  sourceTime,
} from "@/tools/engines/add-audio/math";
import type { MediaInfo } from "@/tools/engines/types";

const base = { offset: 0, skip: 0, loop: false, fadeOut: 2 };

describe("placement", () => {
  it("cuts a longer song at the video's end and fades it", () => {
    const p = placement(30, 200, base);
    expect(p).toMatchObject({ start: 0, end: 30, cut: true, fade: 2 });
  });
  it("leaves a shorter clip alone: no cut, no fade", () => {
    const p = placement(30, 10, { ...base, offset: 5 });
    expect(p).toMatchObject({ start: 5, end: 15, cut: false, fade: 0 });
  });
  it("loops to the end of the video", () => {
    const p = placement(30, 4, { ...base, loop: true });
    expect(p.end).toBe(30);
    expect(p.passes).toBeCloseTo(7.5);
    expect(sourceTime(9, p, 0)).toBeCloseTo(1);
  });
  it("skips into the audio", () => {
    const p = placement(30, 200, { ...base, skip: 60 });
    expect(p.passLength).toBe(140);
    expect(sourceTime(0, p, 60)).toBe(60);
  });
  it("never fades longer than the audio plays", () => {
    expect(placement(3, 10, { ...base, offset: 2, fadeOut: 4 }).fade).toBe(1);
  });
});

describe("gainAt", () => {
  it("applies the volume and a linear fade-out", () => {
    const p = placement(30, 200, base);
    expect(gainAt(10, p, 0.7, 0)).toBeCloseTo(0.7);
    expect(gainAt(29, p, 1, 0)).toBeCloseTo(0.5);
    expect(gainAt(30, p, 1, 0)).toBe(0);
  });
  it("ramps in over 10 ms after a skip and at loop seams, not at a natural start", () => {
    const p = placement(30, 4, { ...base, loop: true });
    expect(gainAt(0.001, p, 1, 0)).toBe(1);
    expect(gainAt(4.005, p, 1, 0)).toBeCloseTo(0.5);
    const s = placement(30, 200, { ...base, skip: 12 });
    expect(gainAt(0.005, s, 1, 12)).toBeCloseTo(0.5);
  });
});

describe("softClip", () => {
  it("passes quiet samples and keeps loud ones under 1", () => {
    expect(softClip(0.5)).toBe(0.5);
    expect(softClip(1.8)).toBeLessThan(1);
    expect(softClip(-1.8)).toBeGreaterThan(-1);
  });
});

const info = (video: boolean, container = "MP4"): MediaInfo => ({
  container,
  durationSec: 3,
  sizeBytes: 1,
  video: video ? { codec: "avc", width: 640, height: 360, fps: 30 } : undefined,
  audio: [{ codec: "aac", channels: 2, sampleRate: 48_000 }],
});

describe("roles and container", () => {
  it("finds the picture and the sound in either order", () => {
    const a = { id: 1, info: info(false) };
    const v = { id: 2, info: info(true) };
    expect(pickRoles([a, v])).toEqual({ video: v, audio: a });
    expect(pickRoles([v, a])).toEqual({ video: v, audio: a });
    const v2 = { id: 3, info: info(true) };
    expect(pickRoles([v, v2])).toEqual({ video: v, audio: v2 });
    expect(pickRoles([a]).video).toBe(undefined);
  });
  it("keeps the video's container and falls back to MP4", () => {
    const f = (name: string) => new File([], name);
    expect(outputContainer({ file: f("a.mov"), info: info(true, "QuickTime File Format") })).toBe(
      "mov",
    );
    expect(outputContainer({ file: f("a.ts"), info: info(true, "MPEG Transport Stream") })).toBe(
      "mp4",
    );
  });
  it("copies only when nothing about the audio changes", () => {
    const o = { ...base, mode: "replace" as const, volume: 1 };
    expect(audioUnchanged(o, false)).toBe(true);
    expect(audioUnchanged(o, true)).toBe(false);
    expect(audioUnchanged({ ...o, fadeOut: 0 }, true)).toBe(true);
    expect(audioUnchanged({ ...o, offset: 1 }, false)).toBe(false);
    expect(audioUnchanged({ ...o, mode: "mix" }, false)).toBe(false);
  });
});
