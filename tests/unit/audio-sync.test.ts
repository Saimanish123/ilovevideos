import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ALL_FORMATS, BufferSource, EncodedPacketSink, Input } from "mediabunny";
import { describe, expect, it } from "vitest";
import { audioSyncEngine } from "@/tools/engines/audio-sync";
import { inspect } from "@/tools/engines/mediabunny/shared";

/**
 * Audio sync is a packet copy: it runs in Node (no WebCodecs) on the real engine. The picture and
 * sound packets must come back byte for byte, and, read with the local ffmpeg (test-only), the sound
 * must start where the shift puts it: exact in MP4 (edit list), within a sound frame in MKV.
 */
const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
const ctx = () => ({ signal: new AbortController().signal, onProgress: () => undefined });

async function shift(path: string, offsetMs: number) {
  const name = path.split("/").pop() ?? "in.mp4";
  const file = new File([readFileSync(path)], name);
  const info = await inspect(file);
  const r = await audioSyncEngine.run(
    "webcodecs",
    [{ file, info }],
    audioSyncEngine.optionsSchema.parse({ offsetMs }),
    ctx(),
  );
  const bytes = new Uint8Array(await r.blob.arrayBuffer());
  const dir = mkdtempSync(join(tmpdir(), "sync-"));
  const out = join(dir, r.filename);
  writeFileSync(out, bytes);
  return { bytes, out, r };
}

async function packets(bytes: Uint8Array, kind: "video" | "audio") {
  const input = new Input({ source: new BufferSource(bytes), formats: ALL_FORMATS });
  const t =
    kind === "video" ? await input.getPrimaryVideoTrack() : await input.getPrimaryAudioTrack();
  const out: string[] = [];
  if (t)
    for await (const p of new EncodedPacketSink(t).packets())
      out.push(Buffer.from(p.data).toString("base64"));
  return out;
}

/** Seconds (on the movie timeline, as a player hears it) until the sound first passes `level`. */
function onset(path: string, level: number): number | null {
  const probe = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "a:0",
      "-show_entries",
      "stream=start_time,sample_rate",
      "-of",
      "json",
      path,
    ],
    { encoding: "utf8" },
  );
  if (probe.error || probe.status !== 0) return null;
  const s = JSON.parse(probe.stdout).streams[0] as { start_time: string; sample_rate: string };
  const pcm = spawnSync(
    "ffmpeg",
    ["-v", "error", "-i", path, "-map", "0:a:0", "-ac", "1", "-f", "f32le", "-"],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  if (pcm.status !== 0) return null;
  const f = new Float32Array(
    pcm.stdout.buffer,
    pcm.stdout.byteOffset,
    Math.floor(pcm.stdout.length / 4),
  );
  const i = f.findIndex((v) => Math.abs(v) > level);
  return i < 0 ? null : Number(s.start_time) + i / Number(s.sample_rate);
}

describe("audio sync", () => {
  it("delays the sound in an MP4 exactly, copying every packet", async () => {
    const src = "tests/fixtures/sample-clicks.mp4";
    const { bytes, out, r } = await shift(src, 250);
    expect(r.filename).toBe("sample-clicks-synced.mp4");
    expect(r.meta).toContain("exact to the sample");
    expect(await packets(bytes, "video")).toEqual(await packets(readFileSync(src), "video"));
    const a = await packets(bytes, "audio");
    const s = await packets(readFileSync(src), "audio");
    // Every packet written is the source's own, in order (the tail past the picture is cut).
    expect(s.slice(0, a.length)).toEqual(a);
    const t = onset(out, 0.3);
    const ref = onset(src, 0.3);
    if (hasFfmpeg) expect(t).not.toBeNull();
    if (t !== null && ref !== null) expect(Math.abs(t - ref - 0.25)).toBeLessThan(0.002);
  });

  it("moves the sound earlier in an MP4 to the sample", async () => {
    const src = "tests/fixtures/sample-clicks.mp4";
    const { out } = await shift(src, -130);
    // Clicks every 100 ms from 0: moved 130 ms earlier, the first one heard is at 70 ms.
    const t = onset(out, 0.3);
    const ref = onset(src, 0.3);
    if (hasFfmpeg) expect(t).not.toBeNull();
    if (t !== null && ref !== null) expect(Math.abs(t - (ref + 0.07))).toBeLessThan(0.002);
  });

  it("shifts the sound in an MKV to the nearest sound frame", async () => {
    const src = "tests/fixtures/sample.mkv";
    const { bytes, out, r } = await shift(src, 400);
    expect(r.filename.endsWith(".mkv")).toBe(true);
    expect(r.meta).toContain("nearest sound frame");
    expect(await packets(bytes, "video")).toEqual(await packets(readFileSync(src), "video"));
    const t = onset(out, 0.05);
    const ref = onset(src, 0.05);
    if (hasFfmpeg) expect(t).not.toBeNull();
    if (t !== null && ref !== null) expect(Math.abs(t - ref - 0.4)).toBeLessThan(0.03);
  });
});
