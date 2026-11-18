import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { joinGapSamples, joinMp3, mp3Mismatch, scanMp3 } from "@/tools/engines/join-audio/mp3-join";

const fixture = (name: string) => {
  const b = readFileSync(join("tests/fixtures", name));
  return new File([b], name);
};

/** Samples ffmpeg decodes (gapless applied), first channel. */
function decoded(path: string): Float32Array {
  const raw = execFileSync("ffmpeg", ["-v", "error", "-i", path, "-ac", "1", "-f", "f32le", "-"], {
    maxBuffer: 1 << 28,
  });
  return new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
}

describe("MP3 frame join", () => {
  it("joins two MP3s frame for frame: start, end and every frame kept, gap as predicted", async () => {
    const a = fixture("sample.mp3");
    const b = fixture("sample-b.mp3");
    const la = await scanMp3(a, a.name);
    const lb = await scanMp3(b, b.name);
    expect(mp3Mismatch([la, lb])).toBeUndefined();
    expect(la.delay).toBeDefined();
    const out = joinMp3([a, b], [la, lb]);
    const dir = mkdtempSync(join(tmpdir(), "join-mp3-"));
    const path = join(dir, "joined.mp3");
    writeFileSync(path, Buffer.from(await out.arrayBuffer()));
    const pcm = decoded(path);
    const gap = joinGapSamples([la, lb])[0] as number;
    // 4 s + 3 s at 44.1 kHz, plus the encoder padding and delay kept at the join.
    expect(pcm.length).toBe(176_400 + 132_300 + gap);
    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeLessThan(2 * 1152);
    // The frames are the source's frames: ffprobe counts the sum, and the bytes are slices.
    const frames = execFileSync("ffprobe", [
      "-v",
      "error",
      "-count_frames",
      "-select_streams",
      "a:0",
      "-show_entries",
      "stream=nb_read_frames",
      "-of",
      "csv=p=0",
      path,
    ])
      .toString()
      .trim();
    expect(Number(frames)).toBe(la.frames + lb.frames);
    // The second file's 550 Hz tone is there after the join.
    const tail = pcm.subarray(pcm.length - 44_100, pcm.length - 4410);
    let crossings = 0;
    for (let i = 1; i < tail.length; i++)
      if ((tail[i - 1] ?? 0) <= 0 && (tail[i] ?? 0) > 0) crossings++;
    expect(Math.abs(crossings / (tail.length / 44_100) - 550)).toBeLessThan(3);
  });

  it("refuses MP3s of different rates or layouts with a reason", async () => {
    const a = await scanMp3(fixture("sample.mp3"), "sample.mp3");
    const b = await scanMp3(fixture("sample-loop.mp3"), "sample-loop.mp3");
    expect(mp3Mismatch([a, b])).toMatch(/stereo|mono|kHz/);
  });
});
