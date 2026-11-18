import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ALL_FORMATS, BufferSource, EncodedPacketSink, Input } from "mediabunny";
import { describe, expect, it } from "vitest";
import { convertVideoEngine } from "@/tools/engines/convert-video";
import { planConversion } from "@/tools/engines/convert-video/plan";
import { remux } from "@/tools/engines/mediabunny/packet-copy";
import { inspect } from "@/tools/engines/mediabunny/shared";
import { muteEngine } from "@/tools/engines/mute";
import { rotateEngine } from "@/tools/engines/rotate";
import { splitEngine } from "@/tools/engines/split";
import { stripMetadataEngine } from "@/tools/engines/strip-metadata";
import { trimEngine } from "@/tools/engines/trim";
import type { Engine } from "@/tools/engines/types";
import { copyAudioTrack } from "@/tools/engines/video-to-audio/copy";

/**
 * Every path that claims "streams copied" must hand back the source's packets byte for byte. These
 * run the real engines in Node, where mediabunny has no WebCodecs: a path that fell back to a
 * Conversion would have to decode, would lose its sound track, and fail here. The fixtures' AAC
 * opens with ffmpeg's priming packet at -0.023 s, the case Conversion used to re-encode.
 * Where the local ffmpeg is installed (test-only, never in production), it checks the same packets
 * with its own reader and how the sound plays.
 */
const F = "tests/fixtures/";
const ctx = () => ({ signal: new AbortController().signal, onProgress: () => undefined });

async function run<O>(engine: Engine<O>, path: string, name: string, options: unknown) {
  const file = new File([readFileSync(path)], name);
  const info = await inspect(file);
  const opts = engine.optionsSchema.parse(options);
  const r = await engine.run("webcodecs", [{ file, info }], opts, ctx());
  return {
    bytes: new Uint8Array(await r.blob.arrayBuffer()),
    meta: r.meta,
    files: await Promise.all(
      (r.files ?? []).map(async (f) => new Uint8Array(await f.blob.arrayBuffer())),
    ),
  };
}

/** Packet bytes per primary track, in decode order, read with mediabunny. */
async function packets(bytes: Uint8Array) {
  const input = new Input({ source: new BufferSource(bytes), formats: ALL_FORMATS });
  const read = async (t: Awaited<ReturnType<Input["getPrimaryVideoTrack"]>> | null) => {
    if (!t) return [];
    const out: string[] = [];
    for await (const p of new EncodedPacketSink(t).packets())
      out.push(Buffer.from(p.data).toString("base64"));
    return out;
  };
  const video = await input.getPrimaryVideoTrack();
  const audio = await input.getPrimaryAudioTrack();
  const out = {
    format: (await input.getFormat()).name,
    rotation: video?.rotation ?? 0,
    video: await read(video),
    audio: await read(audio as never),
    tags: await input.getMetadataTags(),
  };
  input.dispose();
  return out;
}

/**
 * H.264 NAL units of an access unit, whichever framing it uses (Annex B start codes in MPEG-TS,
 * 4-byte lengths in MP4), without delimiters and parameter sets (which MP4 keeps in avcC). A remux
 * from TS to MP4 reframes the same NAL units; ffmpeg does the same.
 */
function nalUnits(b64: string): string[] {
  const b = Buffer.from(b64, "base64");
  const units: Buffer[] = [];
  const annexB = b[0] === 0 && b[1] === 0 && (b[2] === 1 || (b[2] === 0 && b[3] === 1));
  if (annexB) {
    let start = -1;
    for (let i = 0; i + 2 < b.length; i++) {
      if (b[i] === 0 && b[i + 1] === 0 && b[i + 2] === 1) {
        if (start >= 0) units.push(b.subarray(start, b[i - 1] === 0 ? i - 1 : i));
        start = i + 3;
        i += 2;
      }
    }
    if (start >= 0) units.push(b.subarray(start));
  } else {
    for (let i = 0; i + 4 <= b.length; ) {
      const len = b.readUInt32BE(i);
      units.push(b.subarray(i + 4, i + 4 + len));
      i += 4 + len;
    }
  }
  return units
    .filter((u) => ![7, 8, 9].includes((u[0] ?? 0) & 0x1f))
    .map((u) => u.toString("base64"));
}

/** An AAC frame without its ADTS header (MPEG-TS frames carry one; MP4 keeps the config in esds). */
function rawAac(b64: string): string {
  const b = Buffer.from(b64, "base64");
  if (b[0] !== 0xff || ((b[1] ?? 0) & 0xf0) !== 0xf0) return b64;
  return b.subarray((b[1] ?? 0) & 1 ? 7 : 9).toString("base64");
}

const tmp = mkdtempSync(join(tmpdir(), "packet-copy-"));
let n = 0;
const onDisk = (bytes: Uint8Array) => {
  const path = join(tmp, `out-${n++}`);
  writeFileSync(path, bytes);
  return path;
};
const hasFfmpeg = !spawnSync("ffprobe", ["-version"]).error;

/** ffprobe's MD5 of every packet of one stream. */
const md5s = (path: string, stream: string) =>
  (
    spawnSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        stream,
        "-show_data_hash",
        "MD5",
        "-show_entries",
        "packet=data_hash",
        "-of",
        "csv=p=0",
        path,
      ],
      { encoding: "utf8" },
    ).stdout.match(/MD5:[0-9a-f]+/g) ?? []
  ).join(" ");

/** Where the sound starts and how long it plays once edit lists are applied, per ffmpeg. */
const sound = (path: string) => {
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
  const s = JSON.parse(probe.stdout).streams[0] as { start_time: string; sample_rate: string };
  const pcm = spawnSync(
    "ffmpeg",
    ["-v", "error", "-i", path, "-map", "0:a:0", "-ac", "1", "-f", "s16le", "-"],
    {
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  return { start: Number(s.start_time), seconds: pcm.stdout.length / 2 / Number(s.sample_rate) };
};

const remuxes: { name: string; path: string; file: string; to: string }[] = [
  { name: "mov-to-mp4", path: `${F}sample.mov`, file: "sample.mov", to: "mp4" },
  { name: "m4v-to-mp4", path: `${F}sample.mp4`, file: "sample.m4v", to: "mp4" },
  { name: "mkv-to-mp4", path: `${F}sample.mkv`, file: "sample.mkv", to: "mp4" },
  { name: "ts-to-mp4", path: `${F}sample.m2t`, file: "sample.m2t", to: "mp4" },
  { name: "mp4-to-mov", path: `${F}sample.mp4`, file: "sample.mp4", to: "mov" },
  { name: "mkv-to-mov", path: `${F}sample.mkv`, file: "sample.mkv", to: "mov" },
  { name: "mp4-to-mkv", path: `${F}sample.mp4`, file: "sample.mp4", to: "mkv" },
  { name: "webm-to-mkv", path: `${F}sample.webm`, file: "sample.webm", to: "mkv" },
];

describe("stream copies are byte for byte", () => {
  for (const c of remuxes) {
    it(`${c.name} copies every packet`, async () => {
      const out = await run(convertVideoEngine, c.path, c.file, { to: c.to });
      const got = await packets(out.bytes);
      const src = await packets(readFileSync(c.path));
      expect(got.video.length).toBeGreaterThan(0);
      if (c.file.endsWith(".m2t")) expect(got.video.map(nalUnits)).toEqual(src.video.map(nalUnits));
      else expect(got.video).toEqual(src.video);
      // Every sound packet, the priming one included.
      expect(got.audio.map(rawAac)).toEqual(src.audio.map(rawAac));
      if (!hasFfmpeg) return;
      const path = onDisk(out.bytes);
      if (!c.file.endsWith(".m2t")) expect(md5s(path, "v:0")).toBe(md5s(c.path, "v:0"));
      if (!c.file.endsWith(".m2t")) expect(md5s(path, "a:0")).toBe(md5s(c.path, "a:0"));
      const s = sound(path);
      const from = sound(c.path);
      if (c.to === "mkv") {
        // Matroska cannot start before zero: everything moved later by the priming, in step.
        expect(s.seconds).toBeGreaterThanOrEqual(from.seconds - 1e-3);
      } else {
        // The edit list skips the priming and ends the sound where the source did.
        expect(s.start).toBeCloseTo(0, 3);
        expect(s.seconds).toBeCloseTo(from.seconds, 2);
      }
    });
  }

  it("remove metadata drops the tags and copies every packet", async () => {
    const out = await run(stripMetadataEngine, `${F}sample-tagged.mp4`, "sample-tagged.mp4", {});
    const got = await packets(out.bytes);
    const src = await packets(readFileSync(`${F}sample-tagged.mp4`));
    expect(src.tags.title).toBe("Holiday clip");
    expect(got.tags.title).toBeUndefined();
    expect(got.video).toEqual(src.video);
    expect(got.audio).toEqual(src.audio);
    expect(out.meta).toMatch(/streams copied/);
  });

  it("rotate by metadata writes the rotation and copies every packet", async () => {
    const out = await run(rotateEngine, `${F}sample.mp4`, "sample.mp4", { rotate: 90 });
    const got = await packets(out.bytes);
    const src = await packets(readFileSync(`${F}sample.mp4`));
    expect(got.rotation).toBe(90);
    expect(got.video).toEqual(src.video);
    expect(got.audio).toEqual(src.audio);
  });

  it("remove audio copies the video and drops the sound", async () => {
    const out = await run(muteEngine, `${F}sample.mp4`, "sample.mp4", {});
    const got = await packets(out.bytes);
    const src = await packets(readFileSync(`${F}sample.mp4`));
    expect(got.video).toEqual(src.video);
    expect(got.audio).toEqual([]);
  });

  it("lossless trim copies from the key frame before the start, sound with one packet of pre-roll", async () => {
    const out = await run(trimEngine, `${F}sample.mp4`, "sample.mp4", { start: 1.2, end: 3 });
    const got = await packets(out.bytes);
    const src = await packets(readFileSync(`${F}sample.mp4`));
    expect(out.meta).toMatch(/^Starts at 0:01\.00, the key frame before 0:01\.20 · 0:02\.00 kept/);
    expect(got.video).toEqual(src.video.slice(30));
    // A run of the source's own packets: from the one before 1 s (pre-roll) to the end.
    const at = src.audio.indexOf(got.audio[0] ?? "");
    expect(at).toBeGreaterThan(0);
    expect(got.audio).toEqual(src.audio.slice(at, at + got.audio.length));
    if (!hasFfmpeg) return;
    const s = sound(onDisk(out.bytes));
    expect(s.start).toBeCloseTo(0, 3);
    expect(s.seconds).toBeCloseTo(2, 2);
  });

  it("lossless split parts are runs of the source's packets and play end to end", async () => {
    const out = await run(splitEngine, `${F}sample.mp4`, "sample.mp4", { mode: "equal", parts: 3 });
    const src = await packets(readFileSync(`${F}sample.mp4`));
    expect(out.files).toHaveLength(3);
    let total = 0;
    for (const [i, bytes] of out.files.entries()) {
      const got = await packets(bytes);
      expect(got.video).toEqual(src.video.slice(i * 30, i * 30 + 30));
      const at = src.audio.indexOf(got.audio[0] ?? "");
      expect(got.audio).toEqual(src.audio.slice(at, at + got.audio.length));
      if (hasFfmpeg) total += sound(onDisk(bytes)).seconds;
    }
    // Edit lists trim each part's sound to its range: the parts add up to the source, no overlap.
    if (hasFfmpeg) expect(total).toBeCloseTo(3, 2);
  });

  it("extract audio to M4A copies every sound packet, priming included", async () => {
    const file = new File([readFileSync(`${F}sample.mp4`)], "sample.mp4");
    const r = await copyAudioTrack({
      file,
      muxer: "m4a",
      mime: "audio/mp4",
      outputName: "sample.m4a",
      ffmpegCommand: "",
      ctx: ctx(),
    });
    const bytes = new Uint8Array(await r.blob.arrayBuffer());
    const got = await packets(bytes);
    const src = await packets(readFileSync(`${F}sample.mp4`));
    expect(got.video).toEqual([]);
    expect(got.audio).toEqual(src.audio);
    if (!hasFfmpeg) return;
    const s = sound(onDisk(bytes));
    expect(s.start).toBeCloseTo(0, 3);
    expect(s.seconds).toBeCloseTo(3, 2);
  });

  it("remux refuses a codec the capability table does not list for the container", async () => {
    // mediabunny's MOV muxer takes Opus, but players that need MOV (Keynote, iMovie) do not.
    const job = (path: string, name: string) => ({
      file: new File([readFileSync(path)], name),
      to: "mov" as const,
      outputName: "out.mov",
      ffmpegCommand: "",
      ctx: ctx(),
    });
    expect(await remux(job(`${F}sample-opus.mp4`, "sample-opus.mp4"))).toBeNull();
    expect(await remux(job(`${F}sample.mp4`, "sample.mp4"))).not.toBeNull();
  });
});

describe("extra sound tracks", () => {
  it("M4V with AAC and AC-3 to MP4 copies the AAC and says the AC-3 was left out", async () => {
    const out = await run(convertVideoEngine, `${F}sample-ac3.m4v`, "sample-ac3.m4v", {
      to: "mp4",
    });
    const got = await packets(out.bytes);
    const src = await packets(readFileSync(`${F}sample-ac3.m4v`));
    expect(got.video).toEqual(src.video);
    // Before: the refusal sent the file to a Conversion, which re-encoded the AAC and dropped AC-3.
    expect(got.audio).toEqual(src.audio);
    expect(out.meta).toMatch(/1 extra sound track \(AC-3\) left out: MP4 cannot hold it/);
    const input = new Input({ source: new BufferSource(out.bytes), formats: ALL_FORMATS });
    expect((await input.getAudioTracks()).map((t) => t.codec)).toEqual(["aac"]);
    input.dispose();
  });
});

describe("conversion plan: sound follows the capability table", () => {
  const info = async (path: string, name: string) => inspect(new File([readFileSync(path)], name));

  it("re-encodes Opus to AAC for MOV, whether the picture is copied or not", async () => {
    const opusMp4 = planConversion(await info(`${F}sample-opus.mp4`, "a.mp4"), "a.mp4", "mov");
    expect([opusMp4.copyVideo, opusMp4.copyAudio, opusMp4.audioCodec]).toEqual([
      true,
      false,
      "aac",
    ]);
    const webm = planConversion(await info(`${F}sample.webm`, "a.webm"), "a.webm", "mov");
    expect([webm.copyVideo, webm.copyAudio, webm.audioCodec]).toEqual([false, false, "aac"]);
  });

  it("forcing H.264 for compatibility also makes the sound AAC", async () => {
    const i = await info(`${F}sample.webm`, "a.webm");
    const forced = planConversion(i, "a.webm", "mp4", true);
    expect([forced.copyVideo, forced.copyAudio, forced.audioCodec]).toEqual([false, false, "aac"]);
    // Keep copies what MP4 can hold, Opus included.
    const keep = planConversion(i, "a.webm", "mp4");
    expect([keep.copyVideo, keep.copyAudio]).toEqual([true, true]);
    // AAC is already the compatible choice: forced H.264 still copies it.
    const aac = planConversion(await info(`${F}sample.mov`, "a.mov"), "a.mov", "mp4", true);
    expect(aac.copyAudio).toBe(true);
  });
});
