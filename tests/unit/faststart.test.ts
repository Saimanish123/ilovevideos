import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isPlan,
  planFastStart,
  type Read,
  readLayout,
  shiftIndex,
  topLevelBoxes,
} from "@/tools/engines/faststart/boxes";

/**
 * Fast start moves the index in front of the media without touching a packet. Checked on real
 * fixtures: the output's top-level order, and ffmpeg's per-stream MD5 of every packet (streamhash)
 * equal to the source's, so nothing was decoded, dropped or moved out of place.
 */
const bufferReader =
  (b: Buffer): Read =>
  async (offset, length) =>
    new Uint8Array(b.buffer, b.byteOffset + offset, Math.min(length, b.byteLength - offset));

async function rewrite(path: string): Promise<Buffer | null> {
  const src = readFileSync(path);
  const plan = await planFastStart(bufferReader(src), src.byteLength);
  if (!isPlan(plan)) return null;
  return Buffer.concat(
    plan.parts.map((p) => (p instanceof Uint8Array ? Buffer.from(p) : src.subarray(p.from, p.to))),
  );
}

const streamhash = (path: string) =>
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-i",
    path,
    "-map",
    "0",
    "-c",
    "copy",
    "-f",
    "streamhash",
    "-hash",
    "md5",
    "-",
  ])
    .toString()
    .trim();

describe("fast start", () => {
  it("reads the layout: sample.mp4 is already fast start, sample.mov is not", async () => {
    const mp4 = readFileSync("tests/fixtures/sample.mp4");
    const mov = readFileSync("tests/fixtures/sample.mov");
    expect((await readLayout(bufferReader(mp4), mp4.byteLength)).kind).toBe("front");
    const l = await readLayout(bufferReader(mov), mov.byteLength);
    expect(l.kind).toBe("end");
    if (l.kind === "end") expect(l.mdatBytes).toBeGreaterThan(100_000);
  });

  for (const fixture of [
    "sample.mov",
    "sample-silent.mp4",
    "sample-rotated.mp4",
    "sample-ac3.m4v",
  ]) {
    it(`moves the index of ${fixture} to the front and keeps every packet`, async () => {
      const path = join("tests/fixtures", fixture);
      const out = await rewrite(path);
      expect(out).not.toBeNull();
      if (!out) return;
      const boxes = await topLevelBoxes(bufferReader(out), out.byteLength);
      const order = boxes.map((b) => b.type);
      expect(order.indexOf("moov")).toBeLessThan(order.indexOf("mdat"));
      expect(out.byteLength).toBe(readFileSync(path).byteLength);
      const dir = mkdtempSync(join(tmpdir(), "faststart-"));
      const target = join(dir, fixture);
      writeFileSync(target, out);
      expect(streamhash(target)).toBe(streamhash(path));
      // ffprobe agrees the file is whole: same duration and streams.
      const probe = (p: string) =>
        execFileSync("ffprobe", [
          "-v",
          "error",
          "-show_entries",
          "format=duration:stream=codec_name",
          "-of",
          "csv=p=0",
          p,
        ])
          .toString()
          .trim();
      expect(probe(target)).toBe(probe(path));
    });
  }

  it("leaves a file that is already fast start alone", async () => {
    expect(await rewrite("tests/fixtures/sample.mp4")).toBeNull();
  });

  it("widens a chunk table to 64 bits when a shifted offset passes 4 GiB", () => {
    // moov > trak > mdia > minf > stbl > stco with one offset just under 2^32.
    const box = (type: string, body: Uint8Array) => {
      const b = new Uint8Array(8 + body.byteLength);
      new DataView(b.buffer).setUint32(0, b.byteLength);
      for (let i = 0; i < 4; i++) b[4 + i] = type.charCodeAt(i);
      b.set(body, 8);
      return b;
    };
    const stco = new Uint8Array(12);
    new DataView(stco.buffer).setUint32(4, 1);
    new DataView(stco.buffer).setUint32(8, 0xffff_fff0);
    const tree = box("trak", box("mdia", box("minf", box("stbl", box("stco", stco)))));
    const out = shiftIndex(tree, 0x100, 0, 0xffff_ffff);
    const text = String.fromCharCode(...out.subarray(36, 40));
    expect(text).toBe("co64");
    const dv = new DataView(out.buffer);
    expect(Number(dv.getBigUint64(out.byteLength - 8))).toBe(0xffff_fff0 + 0x100);
  });
});
