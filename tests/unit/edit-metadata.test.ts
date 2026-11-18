import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ALL_FORMATS, BufferSource, EncodedPacketSink, Input } from "mediabunny";
import { describe, expect, it } from "vitest";
import { editMetadata, readEditable } from "@/tools/engines/edit-metadata";
import {
  describeEdit,
  detectTagFormat,
  EditMetadataOptions,
} from "@/tools/engines/edit-metadata/fields";
import { readId3, readId3Tags, updateId3v1, writeId3 } from "@/tools/engines/edit-metadata/id3";

/**
 * Edit metadata rewrites the tag block in place and passes the media through untouched. These run
 * the real engine in Node on the fixtures and check, with mediabunny, that every packet is the
 * source's; where the local ffmpeg is installed (test-only), ffprobe reads the new tags, the kept
 * location and capture time, and the MP3's gapless start.
 */
const F = "tests/fixtures/";
const ctx = () => ({ signal: new AbortController().signal, onProgress: () => undefined });
const cover = () => ({
  name: "logo.png",
  blob: new Blob([readFileSync(`${F}logo.png`)], { type: "image/png" }),
  mime: "image/png" as const,
  width: 64,
  height: 64,
});

async function edit(name: string, options: unknown) {
  const file = new File([readFileSync(F + name)], name);
  const r = await editMetadata(file, EditMetadataOptions.parse(options), ctx());
  return { r, bytes: new Uint8Array(await r.blob.arrayBuffer()), source: file };
}

/** Every packet of every track, base64, in order: the media the file carries. */
async function packets(bytes: Uint8Array) {
  const input = new Input({ source: new BufferSource(bytes), formats: ALL_FORMATS });
  const out: string[][] = [];
  for (const t of await input.getTracks()) {
    if (!t.isVideoTrack() && !t.isAudioTrack()) continue;
    const list: string[] = [];
    for await (const p of new EncodedPacketSink(t).packets())
      list.push(`${p.timestamp.toFixed(6)}:${Buffer.from(p.data).toString("base64")}`);
    out.push(list);
  }
  input.dispose();
  return out;
}

const tmp = mkdtempSync(join(tmpdir(), "edit-metadata-"));
let n = 0;
const onDisk = (bytes: Uint8Array, ext: string) => {
  const path = join(tmp, `out-${n++}.${ext}`);
  writeFileSync(path, bytes);
  return path;
};
const hasFfmpeg = !spawnSync("ffprobe", ["-version"]).error;
const probe = (path: string) =>
  JSON.parse(
    spawnSync("ffprobe", ["-v", "error", "-show_format", "-show_streams", "-of", "json", path], {
      encoding: "utf8",
    }).stdout,
  ) as {
    format: { tags?: Record<string, string>; duration: string; start_time: string };
    streams: { codec_name: string; disposition?: { attached_pic: number } }[];
  };
const md5 = (path: string, map: string) =>
  spawnSync("ffmpeg", ["-v", "error", "-i", path, "-map", map, "-c", "copy", "-f", "md5", "-"], {
    encoding: "utf8",
  }).stdout.trim();

describe("edit metadata", () => {
  it("MP4: new title and cover, comment removed; location, capture time and every packet kept", async () => {
    const { r, bytes, source } = await edit("sample-tagged.mp4", {
      set: { title: "Nouveau titre é", artist: "Some artist", date: "1999-05-04", comment: "" },
      cover: cover(),
    });
    expect(r.filename).toBe("sample-tagged.mp4");
    expect(r.meta).toMatch(/^MP4 · 5\stags changed · picture and sound unchanged$/);
    const back = await readEditable(new Blob([bytes as BlobPart]));
    expect(back.values).toEqual({
      title: "Nouveau titre é",
      artist: "Some artist",
      date: "1999-05-04",
    });
    expect(back.cover?.mime).toBe("image/png");
    expect(await packets(bytes)).toEqual(await packets(new Uint8Array(await source.arrayBuffer())));
    if (!hasFfmpeg) return;
    const p = probe(onDisk(bytes, "mp4"));
    expect(p.format.tags?.title).toBe("Nouveau titre é");
    expect(p.format.tags?.comment).toBeUndefined();
    expect(p.format.tags?.location).toBe("+48.8584+002.2945/");
    expect(p.format.tags?.creation_time).toBe("2026-08-01T10:00:00.000000Z");
    expect(p.streams.some((s) => s.disposition?.attached_pic === 1)).toBe(true);
    expect(Number(p.format.duration)).toBeCloseTo(3, 3);
  });

  it("MP4 with the movie header first: chunk offsets move with the grown header", async () => {
    const { bytes, source } = await edit("sample.mp4", {
      set: { title: "A title long enough to grow the header" },
      cover: cover(),
    });
    expect(bytes.length).toBeGreaterThan(source.size);
    expect(await packets(bytes)).toEqual(await packets(new Uint8Array(await source.arrayBuffer())));
    if (!hasFfmpeg) return;
    const path = onDisk(bytes, "mp4");
    expect(md5(path, "0:v:0")).toBe(md5(`${F}sample.mp4`, "0:v:0"));
    const decode = spawnSync("ffmpeg", ["-v", "error", "-i", path, "-f", "null", "-"], {
      encoding: "utf8",
    });
    expect(decode.stderr).toBe("");
  });

  it("M4A gets iTunes items; MOV gets QuickTime text atoms and refuses a cover", async () => {
    const m4a = await edit("sample.m4a", { set: { album: "An album", genre: "Ambient" } });
    expect((await readEditable(new Blob([m4a.bytes as BlobPart]))).values).toEqual({
      album: "An album",
      genre: "Ambient",
    });
    const mov = await edit("sample.mov", { set: { title: "Clip" } });
    expect((await readEditable(new Blob([mov.bytes as BlobPart]))).format).toBe("mov");
    expect(await packets(mov.bytes)).toEqual(
      await packets(new Uint8Array(await mov.source.arrayBuffer())),
    );
    await expect(edit("sample.mov", { set: {}, cover: cover() })).rejects.toMatchObject({
      code: "unsupported-output",
    });
    if (!hasFfmpeg) return;
    expect(probe(onDisk(mov.bytes, "mov")).format.tags?.title).toBe("Clip");
  });

  it("MP3: the ID3v2 tag is rebuilt and the LAME header (gapless start) is untouched", async () => {
    const { bytes, source } = await edit("sample.mp3", {
      set: { title: "Tone", date: "2001" },
      cover: cover(),
    });
    const tags = await readEditable(new Blob([bytes as BlobPart]));
    expect(tags.values).toMatchObject({ title: "Tone", artist: "Test signal", date: "2001" });
    expect(tags.cover?.data.length).toBe(cover().blob.size);
    // Everything after the old tag is the source's, byte for byte.
    const src = new Uint8Array(await source.arrayBuffer());
    const oldTag =
      10 + ((src[6] ?? 0) << 21) + ((src[7] ?? 0) << 14) + ((src[8] ?? 0) << 7) + (src[9] ?? 0);
    const newTag =
      10 +
      ((bytes[6] ?? 0) << 21) +
      ((bytes[7] ?? 0) << 14) +
      ((bytes[8] ?? 0) << 7) +
      (bytes[9] ?? 0);
    expect(Buffer.from(bytes.subarray(newTag)).equals(Buffer.from(src.subarray(oldTag)))).toBe(
      true,
    );
    if (!hasFfmpeg) return;
    const path = onDisk(bytes, "mp3");
    const p = probe(path);
    expect(p.format.tags?.title).toBe("Tone");
    expect(Number(p.format.start_time)).toBeCloseTo(0.025, 3);
    expect(Number(p.format.duration)).toBeCloseTo(4, 3);
    expect(md5(path, "0:a")).toBe(md5(`${F}sample.mp3`, "0:a"));
  });

  it("FLAC: Vorbis comments and a front-cover picture; the frames untouched", async () => {
    const { bytes } = await edit("sample.flac", { set: { artist: "Someone" }, cover: cover() });
    expect((await readEditable(new Blob([bytes as BlobPart]))).values).toEqual({
      artist: "Someone",
    });
    if (!hasFfmpeg) return;
    const path = onDisk(bytes, "flac");
    expect(probe(path).format.tags?.ARTIST).toBe("Someone");
    expect(md5(path, "0:a")).toBe(md5(`${F}sample.flac`, "0:a"));
  });

  it("no change hands the file back as it is; MKV is refused with the reason", async () => {
    const { r, source } = await edit("sample-tagged.mp4", { set: { title: "Holiday clip" } });
    expect(r.meta).toBe("MP4 · no tags changed · picture and sound unchanged");
    expect(r.blob.size).toBe(source.size);
    await expect(edit("sample.mkv", { set: { title: "x" } })).rejects.toMatchObject({
      code: "unsupported-input",
      message: expect.stringContaining("MKV and WebM"),
    });
  });

  it("ID3: v2.3 writes UTF-16 for text outside Latin-1, and ID3v1 is cut to its fields", () => {
    const tag = writeId3({ size: 0, frames: [] }, { set: { title: "日本語" }, fields: ["title"] });
    expect(tag[3]).toBe(3);
    expect(readId3Tags(readId3(tag)).values.title).toBe("日本語");
    const v1 = new Uint8Array(128);
    v1.set([0x54, 0x41, 0x47]);
    const out = updateId3v1(v1, { set: { title: "x".repeat(40) }, fields: ["title"] });
    expect(new TextDecoder().decode(out.subarray(3, 33))).toBe("x".repeat(30));
  });

  it("describes the edit and detects formats from their first bytes", () => {
    expect(describeEdit({ set: { title: "a", comment: "" }, cover: null })).toBe(
      "New title; comment and cover removed",
    );
    expect(detectTagFormat(new TextEncoder().encode("fLaC\0\0\0\0\0\0\0\0"))).toBe("flac");
    expect(
      detectTagFormat(Uint8Array.of(0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74, 0x20, 0x20)),
    ).toBe("mov");
  });
});
