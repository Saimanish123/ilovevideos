import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ALL_FORMATS, BufferSource, EncodedPacketSink, Input } from "mediabunny";
import { describe, expect, it } from "vitest";
import { audioTracksEngine } from "@/tools/engines/audio-tracks";
import { inspect } from "@/tools/engines/mediabunny/shared";

/**
 * Select audio tracks is a packet copy: the real engine runs in Node (no WebCodecs). The kept
 * tracks must be the source's packets byte for byte, in the chosen order, with their languages, and
 * the main one marked default (checked with ffprobe when it is installed; test-only).
 */
const ctx = () => ({ signal: new AbortController().signal, onProgress: () => undefined });

async function run(path: string, keep: number[], primary: number) {
  const name = path.split("/").pop() ?? "in.mkv";
  const file = new File([readFileSync(path)], name);
  const info = await inspect(file);
  const r = await audioTracksEngine.run(
    "webcodecs",
    [{ file, info }],
    audioTracksEngine.optionsSchema.parse({ keep, primary }),
    ctx(),
  );
  const bytes = new Uint8Array(await r.blob.arrayBuffer());
  const out = join(mkdtempSync(join(tmpdir(), "tracks-")), r.filename);
  writeFileSync(out, bytes);
  return { bytes, out, r, info };
}

async function audioPackets(bytes: Uint8Array) {
  const input = new Input({ source: new BufferSource(bytes), formats: ALL_FORMATS });
  const out: string[][] = [];
  for (const t of await input.getAudioTracks()) {
    const list: string[] = [];
    for await (const p of new EncodedPacketSink(t).packets())
      list.push(Buffer.from(p.data).toString("base64"));
    out.push(list);
  }
  return out;
}

describe("select audio tracks", () => {
  it("reads every track's language, name and default flag", async () => {
    const file = new File([readFileSync("tests/fixtures/sample-tracks.mkv")], "sample-tracks.mkv");
    const info = await inspect(file);
    expect(info.audio?.map((a) => [a.codec, a.language, a.name, a.default])).toEqual([
      ["aac", "eng", "English", true],
      ["aac", "fra", "Français", false],
      ["opus", "eng", "Commentary", false],
    ]);
  });

  it("keeps French first and the commentary, copied byte for byte, French marked default", async () => {
    const src = "tests/fixtures/sample-tracks.mkv";
    const { bytes, out, r } = await run(src, [1, 2], 1);
    expect(r.filename).toBe("sample-tracks-tracks.mkv");
    expect(r.meta).toContain("2 of 3 sound tracks kept");
    const got = await audioPackets(bytes);
    const source = await audioPackets(readFileSync(src));
    expect(got).toEqual([source[1], source[2]]);
    const probe = spawnSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "a",
        "-show_entries",
        "stream=codec_name:stream_tags=language:stream_disposition=default",
        "-of",
        "json",
        out,
      ],
      { encoding: "utf8" },
    );
    if (probe.status === 0) {
      const streams = JSON.parse(probe.stdout).streams as {
        codec_name: string;
        tags?: { language?: string };
        disposition: { default: number };
      }[];
      expect(streams.map((s) => [s.codec_name, s.tags?.language, s.disposition.default])).toEqual([
        ["aac", "fra", 1],
        ["opus", "eng", 0],
      ]);
    }
  });

  it("drops the second track of an MP4 and keeps its container", async () => {
    const { bytes, r } = await run("tests/fixtures/sample-tracks.mp4", [0], 0);
    expect(r.filename.endsWith(".mp4")).toBe(true);
    expect((await audioPackets(bytes)).length).toBe(1);
  });

  it("copies a track the browser cannot decode (AC-3) as well as AAC", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tracks-ac3-"));
    const mkv = join(dir, "film.mkv");
    const made = spawnSync("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-i",
      "tests/fixtures/sample-ac3.m4v",
      "-map",
      "0",
      "-c",
      "copy",
      mkv,
    ]);
    if (made.status !== 0) return;
    const { bytes, r } = await run(mkv, [1], 1);
    expect(r.meta).toContain("1 of 2 sound tracks kept");
    const input = new Input({ source: new BufferSource(bytes), formats: ALL_FORMATS });
    expect((await input.getAudioTracks()).map((t) => t.codec)).toEqual(["ac3"]);
  });
});
