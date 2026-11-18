import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ALL_FORMATS,
  BufferSource,
  BufferTarget,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Input,
  MovOutputFormat,
  Mp4OutputFormat,
  Output,
} from "mediabunny";
import { describe, expect, it } from "vitest";
import { applyPrimingEdits } from "@/tools/engines/mediabunny/edit-list";

/**
 * The edit list the runner writes after a WebCodecs AAC encode (see mediabunny/priming). Files are
 * muxed here by mediabunny from the fixture's packets, the way an engine would write them, then
 * edited and read back by mediabunny and, when it is installed, by ffprobe.
 */
const PRIMING = 2112 / 44100;
const concat = (parts: Uint8Array[]) => new Uint8Array(Buffer.concat(parts));

/** Re-muxes sample.mp4's packets with mediabunny; `audioShift` delays the sound (an empty edit). */
async function mux(opts: { mov?: boolean; audioShift?: number } = {}) {
  const input = new Input({
    source: new BufferSource(readFileSync("tests/fixtures/sample.mp4")),
    formats: ALL_FORMATS,
  });
  const video = await input.getPrimaryVideoTrack();
  const audio = await input.getPrimaryAudioTrack();
  if (!video?.codec || !audio?.codec) throw new Error("fixture needs video and audio");
  const output = new Output({
    format: opts.mov
      ? new MovOutputFormat({ fastStart: "in-memory" })
      : new Mp4OutputFormat({ fastStart: "in-memory" }),
    target: new BufferTarget(),
  });
  const vs = new EncodedVideoPacketSource(video.codec);
  const as = new EncodedAudioPacketSource(audio.codec);
  output.addVideoTrack(vs);
  output.addAudioTrack(as);
  await output.start();
  const vc = await video.getDecoderConfig();
  const ac = await audio.getDecoderConfig();
  let first = true;
  for await (const p of new EncodedPacketSink(video).packets()) {
    await vs.add(p, first ? { decoderConfig: vc ?? undefined } : undefined);
    first = false;
  }
  first = true;
  let n = 0;
  for await (const p of new EncodedPacketSink(audio).packets()) {
    // Like an encoder's output: back to back from zero (or the shift), priming included.
    const timestamp = (n++ * 1024) / 44100 + (opts.audioShift ?? 0);
    await as.add(p.clone({ timestamp }), first ? { decoderConfig: ac ?? undefined } : undefined);
    first = false;
  }
  await output.finalize();
  input.dispose();
  const buffer = output.target.buffer;
  if (!buffer) throw new Error("no output");
  return new Uint8Array(buffer);
}

async function read(bytes: Uint8Array) {
  const input = new Input({ source: new BufferSource(bytes), formats: ALL_FORMATS });
  const video = await input.getPrimaryVideoTrack();
  const audio = await input.getPrimaryAudioTrack();
  if (!video || !audio) throw new Error("tracks missing");
  const hashes = async (t: typeof video | typeof audio) => {
    const out: string[] = [];
    for await (const p of new EncodedPacketSink(t).packets())
      out.push(Buffer.from(p.data).toString("base64"));
    return out;
  };
  const firstAudio = await new EncodedPacketSink(audio).getFirstPacket();
  const out = {
    audioId: audio.id,
    firstAudioTimestamp: firstAudio?.timestamp ?? Number.NaN,
    videoPackets: await hashes(video),
    audioPackets: await hashes(audio),
  };
  input.dispose();
  return out;
}

/**
 * What ffmpeg makes of the file: the sound's start time and how many seconds of sound it decodes
 * once the edit list is applied. Null when ffmpeg is not installed (mediabunny's reading is the check).
 */
const ffmpegView = (bytes: Uint8Array) => {
  const dir = mkdtempSync(join(tmpdir(), "edit-list-"));
  const path = join(dir, "out.mp4");
  writeFileSync(path, bytes);
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
  if (probe.error) return null;
  const stream = JSON.parse(probe.stdout).streams[0] as { start_time: string; sample_rate: string };
  const pcm = spawnSync(
    "ffmpeg",
    ["-v", "error", "-i", path, "-map", "0:a:0", "-ac", "1", "-f", "s16le", "-"],
    {
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  return {
    audioStart: Number(stream.start_time),
    audioSeconds: pcm.stdout.length / 2 / Number(stream.sample_rate),
  };
};

describe("applyPrimingEdits", () => {
  it("skips the priming, ends the sound on time and keeps every packet intact", async () => {
    const before = await mux();
    const a = await read(before);
    const parts = applyPrimingEdits(before, [
      { trackId: a.audioId, primingSec: PRIMING, endSec: 2.9 },
    ]);
    expect(parts).not.toBeNull();
    const after = concat(parts ?? []);
    const b = await read(after);
    // The first packet now sits the priming before zero, where players start skipping from.
    expect(a.firstAudioTimestamp).toBe(0);
    expect(b.firstAudioTimestamp).toBeCloseTo(-PRIMING, 4);
    // Chunk offsets moved with the inserted box: every packet reads back byte for byte.
    expect(b.videoPackets).toEqual(a.videoPackets);
    expect(b.audioPackets).toEqual(a.audioPackets);
    // ffmpeg skips the priming and stops at the end asked for.
    const view = ffmpegView(after);
    if (view) {
      expect(view.audioStart).toBeCloseTo(0, 3);
      expect(view.audioSeconds).toBeCloseTo(2.9, 3);
    }
  });

  it("keeps an audio start offset (empty edit) and edits MOV the same way", async () => {
    const before = await mux({ mov: true, audioShift: 0.5 });
    const a = await read(before);
    const after = concat(
      applyPrimingEdits(before, [{ trackId: a.audioId, primingSec: PRIMING, endSec: 3 }]) ?? [],
    );
    const b = await read(after);
    expect(b.firstAudioTimestamp).toBeCloseTo(0.5 - PRIMING, 3);
    expect(b.audioPackets).toEqual(a.audioPackets);
    // Sound from 0.5 s to the 3 s asked for.
    const view = ffmpegView(after);
    if (view) {
      expect(view.audioStart).toBeCloseTo(0.5, 3);
      expect(view.audioSeconds).toBeCloseTo(2.5, 3);
    }
  });

  it("leaves files alone that it cannot or should not edit", async () => {
    // ffmpeg already signalled its own AAC priming in the fixture's edit list.
    const fixture = new Uint8Array(readFileSync("tests/fixtures/sample.mp4"));
    expect(applyPrimingEdits(fixture, [{ trackId: 2, primingSec: PRIMING }])).toBeNull();
    // Not ISO BMFF.
    const webm = new Uint8Array(readFileSync("tests/fixtures/sample.webm"));
    expect(applyPrimingEdits(webm, [{ trackId: 2, primingSec: PRIMING }])).toBeNull();
    // The video track is not a sound track.
    const muxed = await mux();
    expect(applyPrimingEdits(muxed, [{ trackId: 1, primingSec: PRIMING }])).toBeNull();
  });
});
