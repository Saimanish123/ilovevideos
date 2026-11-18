import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { parseSubtitles } from "@/tools/engines/subtitles";
import { subtitlesExtractEngine } from "@/tools/engines/subtitles-extract";
import { tx3gText } from "@/tools/engines/subtitles-extract/isobmff";
import { listSubtitleTracks, outputNames } from "@/tools/engines/subtitles-extract/tracks";

/**
 * Extract subtitles reads soft tracks straight from the container. These run the engine in Node on
 * fixtures ffmpeg wrote (SRT and ASS in MKV, timed text in MP4, WebVTT in WebM) and compare the cues
 * with what the local ffmpeg extracts from the same file (test-only; skipped without ffmpeg).
 */
const F = "tests/fixtures/";
const ctx = () => ({ signal: new AbortController().signal, onProgress: () => undefined });
const hasFfmpeg = !spawnSync("ffmpeg", ["-version"]).error;
const tmp = mkdtempSync(join(tmpdir(), "subs-extract-"));

async function run(name: string, options: Record<string, unknown> = {}, bytes?: Uint8Array) {
  const file = new File([(bytes ?? readFileSync(F + name)) as BlobPart], name);
  const r = await subtitlesExtractEngine.run(
    "canvas",
    [{ file }],
    subtitlesExtractEngine.optionsSchema.parse(options),
    ctx(),
  );
  const files = r.files ?? [{ blob: r.blob, filename: r.filename, meta: r.meta }];
  return {
    r,
    files: await Promise.all(files.map(async (f) => ({ ...f, text: await f.blob.text() }))),
  };
}

/** What ffmpeg writes for one subtitle stream, as cues (start, end, text). */
function ffmpegCues(name: string, stream: number, ext: "srt" | "vtt" | "ass") {
  const out = join(tmp, `ff-${name}-${stream}.${ext}`);
  spawnSync("ffmpeg", ["-v", "error", "-y", "-i", F + name, "-map", `0:s:${stream}`, out]);
  return parseSubtitles(readFileSync(out, "utf8")).cues.map((c) => [c.start, c.end, c.text]);
}
const cues = (text: string) => parseSubtitles(text).cues.map((c) => [c.start, c.end, c.text]);

describe("extract subtitles", () => {
  it("lists MKV tracks from the header with language, name, default and forced", async () => {
    const list = await listSubtitleTracks(new Blob([readFileSync(`${F}sample-subs.mkv`)]));
    expect(list.container).toBe("matroska");
    expect(list.tracks).toEqual([
      expect.objectContaining({
        index: 0,
        kind: "srt",
        language: "eng",
        name: "English",
        default: true,
        forced: false,
      }),
      expect.objectContaining({ index: 1, kind: "ass", language: "fre", forced: true }),
    ]);
  });

  it("MKV: SRT and ASS tracks come out as ffmpeg extracts them", async () => {
    const { files, r } = await run("sample-subs.mkv", { format: "original" });
    expect(files.map((f) => f.filename)).toEqual([
      "sample-subs.en.srt",
      "sample-subs.fr.forced.ass",
    ]);
    expect(r.ffmpegCommand).toBe(
      "ffmpeg -i sample-subs.mkv -map 0:s:0 -c:s srt sample-subs.en.srt -map 0:s:1 -c:s copy sample-subs.fr.forced.ass",
    );
    // The ASS script keeps its styles and sections.
    expect(files[1]?.text).toContain("Style: Sign,Georgia,40");
    expect(files[1]?.text).toContain("[Aegisub Extradata]");
    if (!hasFfmpeg) return;
    expect(cues(files[0]?.text ?? "")).toEqual(ffmpegCues("sample-subs.mkv", 0, "srt"));
    expect(cues(files[1]?.text ?? "")).toEqual(ffmpegCues("sample-subs.mkv", 1, "ass"));
  });

  it("ASS to SRT and WebVTT comes out in time order; ASS kept as ASS keeps its ReadOrder", async () => {
    // QA 2026-10-08: the French ASS track's "CITY HALL" sign (0:00 to 0:06) is ReadOrder 2, so the SRT
    // listed 0:00.5, 0:02, 0:00, 0:04, ... ; ffmpeg writes it first.
    for (const format of ["srt", "vtt"] as const) {
      const { files } = await run("sample-subs.mkv", { format });
      const starts = parseSubtitles(files[1]?.text ?? "").cues.map((c) => c.start);
      expect(starts).toEqual([...starts].sort((a, b) => a - b));
      expect(starts[0]).toBe(0);
    }
    const { files } = await run("sample-subs.mkv", { format: "original" });
    const ass = parseSubtitles(files[1]?.text ?? "").cues.map((c) => c.start);
    expect(ass[0]).toBe(500);
    if (!hasFfmpeg) return;
    // Same order as ffmpeg's SRT (which also keeps a drawing-only line, 0:06, that the library drops).
    const { files: srt } = await run("sample-subs.mkv", { format: "srt" });
    const ours = cues(srt[1]?.text ?? "").map((c) => c[0]);
    const theirs = ffmpegCues("sample-subs.mkv", 1, "srt").map((c) => c[0]);
    expect(theirs.filter((t) => ours.includes(t))).toEqual(ours);
  });

  it("MP4 timed text: both tracks, italics restored from the style box", async () => {
    const { files } = await run("sample-subs.mp4");
    expect(files.map((f) => f.filename)).toEqual(["sample-subs.en.srt", "sample-subs.es.srt"]);
    expect(files[0]?.text).toContain("<i>Second line</i>, in italics");
    if (!hasFfmpeg) return;
    expect(cues(files[0]?.text ?? "")).toEqual(ffmpegCues("sample-subs.mp4", 0, "srt"));
    expect(cues(files[1]?.text ?? "")).toEqual(ffmpegCues("sample-subs.mp4", 1, "srt"));
  });

  it("WebM WebVTT: settings kept in WebVTT, one track chosen by id", async () => {
    const { files } = await run("sample-subs.webm", { format: "vtt", tracks: [3] });
    expect(files).toHaveLength(1);
    expect(files[0]?.filename).toBe("sample-subs.en.vtt");
    if (!hasFfmpeg) return;
    expect(cues(files[0]?.text ?? "")).toEqual(ffmpegCues("sample-subs.webm", 0, "vtt"));
  });

  it("a file without subtitle tracks gets the specific message", async () => {
    await expect(run("sample.mp4")).rejects.toMatchObject({
      code: "unsupported-input",
      message: "This file has no text subtitle track to extract.",
    });
  });

  it("reads a zlib-compressed Matroska track (mkvmerge's form) and a header-stripped one", async () => {
    for (const algo of [0, 3] as const) {
      const bytes = syntheticMkv(algo);
      const { files } = await run("synthetic.mkv", {}, bytes);
      expect(cues(files[0]?.text ?? "")).toEqual([
        [1000, 2500, "<i>Hello there</i>"],
        [3000, 4000, "<i>Second</i>"],
      ]);
    }
  });

  it("tx3g style runs map to tags; names stay unique per language", () => {
    const text = new TextEncoder().encode("ab cd");
    const styl = [
      0, 0, 0, 22, 0x73, 0x74, 0x79, 0x6c, 0, 1, 0, 3, 0, 5, 0, 1, 2, 18, 255, 255, 255, 255,
    ];
    expect(tx3gText(Uint8Array.from([0, text.length, ...text, ...styl]))).toBe("ab <i>cd</i>");
    const t = { kind: "srt" as const, codec: "S_TEXT/UTF8", language: "eng" };
    expect(
      outputNames(
        "film.mkv",
        [
          { ...t, id: 1, index: 0 },
          { ...t, id: 2, index: 1 },
        ],
        ["srt", "srt"],
      ),
    ).toEqual(["film.en.srt", "film.en.2.srt"]);
  });
});

// ---- a minimal MKV with one compressed subtitle track -----------------------------------------

function vint(n: number): number[] {
  if (n < 0x7f) return [0x80 | n];
  if (n < 0x3fff) return [0x40 | (n >> 8), n & 0xff];
  return [0x20 | (n >> 16), (n >> 8) & 0xff, n & 0xff];
}
const id = (x: number) => {
  const out: number[] = [];
  for (let v = x; v > 0; v = Math.floor(v / 256)) out.unshift(v & 0xff);
  return out;
};
const el = (x: number, body: number[]) => [...id(x), ...vint(body.length), ...body];
const uint = (x: number, v: number) => el(x, [v]);
const str = (x: number, s: string) => el(x, [...new TextEncoder().encode(s)]);

function syntheticMkv(algo: 0 | 3): Uint8Array {
  const strip = [...new TextEncoder().encode("<i>")];
  const frame = (text: string) => {
    const raw = [...new TextEncoder().encode(text)];
    if (algo === 0) return [...deflateSync(Uint8Array.from(raw))];
    return raw.slice(strip.length); // header stripping removes the shared prefix
  };
  const compression = el(0x5034, [...uint(0x4254, algo), ...(algo === 3 ? el(0x4255, strip) : [])]);
  const track = el(0xae, [
    ...uint(0xd7, 1),
    ...uint(0x83, 0x11),
    ...str(0x86, "S_TEXT/UTF8"),
    ...str(0x22b59c, "eng"),
    ...el(0x6d80, el(0x6240, [...uint(0x5032, 1), ...compression])),
  ]);
  const block = (rel: number, text: string, dur: number) =>
    el(0xa0, [
      ...el(0xa1, [0x81, (rel >> 8) & 0xff, rel & 0xff, 0, ...frame(text)]),
      ...el(0x9b, [dur >> 8, dur & 0xff]),
    ]);
  // Header stripping stores every frame without its first bytes: both cues start with "<i>".
  const first = "<i>Hello there</i>";
  const cluster = el(0x1f43b675, [
    ...el(0xe7, [0x03, 0xe8]),
    ...block(0, first, 1500),
    ...block(2000, "<i>Second</i>", 1000),
  ]);
  const segment = el(0x18538067, [
    ...el(0x1549a966, el(0x2ad7b1, [0x0f, 0x42, 0x40])),
    ...el(0x1654ae6b, track),
    ...cluster,
  ]);
  const ebml = el(0x1a45dfa3, str(0x4282, "matroska"));
  return Uint8Array.from([...ebml, ...segment]);
}
