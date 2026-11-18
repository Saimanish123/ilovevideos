import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ALL_FORMATS,
  AudioSample,
  BlobSource,
  BufferSource,
  BufferTarget,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  Input,
  MkvOutputFormat,
  OggOutputFormat,
  Output,
  type OutputFormat,
  WebMOutputFormat,
} from "mediabunny";
import { describe, expect, it } from "vitest";
import { fixSample, pcmScale, reencodeWindow } from "@/tools/engines/mediabunny/audio-window";
import { annexBSps, parseAvcSps } from "@/tools/engines/mediabunny/avc-sps";
import { flacTailPad } from "@/tools/engines/mediabunny/flac-tail";
import { fixMatroskaOpus, matroskaOpusTracks } from "@/tools/engines/mediabunny/matroska-timing";
import { clearMovieTimes, readMovieHeaderTime } from "@/tools/engines/mediabunny/movie-header";
import { MP3_DECODER_DELAY, readMp3Gapless } from "@/tools/engines/mediabunny/mp3-gapless";
import { fixOggOpus } from "@/tools/engines/mediabunny/ogg-opus";
import {
  opusEndGate,
  opusPacketSamples,
  readOpusHead,
} from "@/tools/engines/mediabunny/opus-delay";
import { lastOggGranule, opusSourceEnd } from "@/tools/engines/mediabunny/opus-source";
import { soundTrackEnd } from "@/tools/engines/mediabunny/pre-roll";
import { convert, inspect, openInput } from "@/tools/engines/mediabunny/shared";
import { stripMetadataEngine } from "@/tools/engines/strip-metadata";
import { videoToAudioEngine } from "@/tools/engines/video-to-audio";

/**
 * The media gaps closed on 2026-09-30 (see the engine modules for the measurements). PCM and the
 * container work run end to end here, since mediabunny decodes and encodes PCM itself; AAC, MP3 and
 * FLAC decoding needs WebCodecs, so for those the decode window is checked here and the sound in
 * the browser specs.
 */
const F = "tests/fixtures/";
const fileOf = (name: string) => new File([readFileSync(`${F}${name}`)], name);
const ctx = () => ({ signal: new AbortController().signal, onProgress: () => undefined });
const hasFfmpeg = !spawnSync("ffprobe", ["-version"]).error;

describe("16-bit PCM round trip", () => {
  it("MOV with loud big-endian PCM to WAV keeps every sample", async () => {
    const file = fileOf("sample-pcm.mov");
    const info = await inspect(file);
    const opts = videoToAudioEngine.optionsSchema.parse({ to: "wav" });
    const r = await videoToAudioEngine.run("webcodecs", [{ file, info }], opts, ctx());
    const wav = Buffer.from(await r.blob.arrayBuffer());
    const data = wav.subarray(wav.indexOf("data") + 8);
    const out = new Int16Array(data.buffer, data.byteOffset, Math.floor(data.length / 2));
    // The source's own samples, big-endian, read straight from its packets.
    const input = new Input({
      source: new BufferSource(readFileSync(`${F}sample-pcm.mov`)),
      formats: ALL_FORMATS,
    });
    const track = await input.getPrimaryAudioTrack();
    const src: number[] = [];
    let loud = 0;
    if (track)
      for await (const p of new EncodedPacketSink(track).packets()) {
        const v = new DataView(p.data.buffer, p.data.byteOffset, p.data.byteLength);
        for (let i = 0; i + 1 < p.data.byteLength; i += 2) {
          const s = v.getInt16(i, false);
          if (Math.abs(s) > 16384) loud++;
          src.push(s);
        }
      }
    input.dispose();
    expect(loud).toBeGreaterThan(10_000);
    expect(out.length).toBe(src.length);
    let differing = 0;
    for (let i = 0; i < src.length; i++) if (out[i] !== src[i]) differing++;
    // Before the scale step, every sample above half scale came back one step low.
    expect(differing).toBe(0);
  });

  it("the scale makes mediabunny's writer invert its reader at 16 and 24 bits", () => {
    for (const bits of [16, 24]) {
      const full = 2 ** (bits - 1);
      for (const v of [-full, -full + 1, -1, 0, 1, full / 2 + 1, full - 2, full - 1]) {
        const read = Math.fround(v / full);
        const written = Math.max(
          -full,
          Math.min(full - 1, Math.round(Math.fround(read * pcmScale(bits)) * (full - 1))),
        );
        expect(written).toBe(v);
      }
    }
  });
});

describe("MP3 gapless window", () => {
  it("reads the encoder delay and padding ffmpeg wrote into the Info frame", () => {
    const g = readMp3Gapless(new Uint8Array(readFileSync(`${F}sample.mp3`).subarray(0, 65_536)));
    expect(g).toMatchObject({ sampleRate: 44_100, delay: 576, padding: 1584, frames: 155 });
    // ffmpeg: skip 1105 at the start, discard 1055 at the end; the sound is exactly 4 s.
    expect(Math.round((g?.skipSec ?? 0) * 44_100)).toBe(576 + MP3_DECODER_DELAY);
    expect(((g?.endSec ?? 0) - (g?.skipSec ?? 0)) * 44_100).toBeCloseTo(176_400, 6);
  });

  it("decodes from the file's start and drops the delay, or cuts a range in sound time", async () => {
    const whole = await reencodeWindow(fileOf("sample.mp3"));
    expect(whole.trim.start).toBe(0);
    expect(whole.lead * 44_100).toBeCloseTo(1105, 6);
    expect(whole.soundSec).toBeCloseTo(4, 6);
    const part = await reencodeWindow(fileOf("sample.mp3"), { range: { start: 1, end: 2 } });
    expect(part.origin).toBeCloseTo(1 + 1105 / 44_100, 6);
    expect(part.lead).toBeCloseTo(0.05, 6);
    expect(part.soundSec).toBeCloseTo(1, 6);
  });

  it("returns nothing for a file without a Xing/Info frame", () => {
    expect(
      readMp3Gapless(new Uint8Array(readFileSync(`${F}sample.wav`).subarray(0, 4096))),
    ).toBeUndefined();
  });
});

describe("AAC re-encode pre-roll", () => {
  it("decodes from the priming packet and drops it", async () => {
    const w = await reencodeWindow(fileOf("sample.mp4"));
    expect(w.trim.start).toBeCloseTo(-1024 / 44_100, 6);
    expect(w.lead).toBeCloseTo(1024 / 44_100, 6);
    expect(w.soundSec).toBeCloseTo(3, 6);
    expect(w.process).toBeDefined();
  });

  it("drops the pre-roll frames and moves the rest back to zero", () => {
    const mk = (timestamp: number, frames: number) =>
      new AudioSample({
        data: Float32Array.from({ length: frames }, (_, i) => i),
        format: "f32-planar",
        numberOfChannels: 1,
        sampleRate: 1000,
        timestamp,
      });
    expect(fixSample(mk(0, 10), 0.02, 1)).toBeNull();
    const cut = fixSample(mk(0.01, 20), 0.02, 1);
    expect(cut?.numberOfFrames).toBe(10);
    expect(cut?.timestamp).toBeCloseTo(0, 9);
    const plane = new Float32Array(10);
    cut?.copyTo(plane, { planeIndex: 0, format: "f32-planar" });
    expect(plane[0]).toBe(10);
    expect(fixSample(mk(0.05, 5), 0.02, 1)?.timestamp).toBeCloseTo(0.03, 9);
  });
});

describe("interlaced H.264 size", () => {
  it("parses a field-coded SPS as the full frame", () => {
    // SPS of a 720×576 top-field-first stream (from the fixture, avcC form).
    const sps = Buffer.from("6764001eacd940b424d8088000000300800000190f8a14cb", "hex");
    expect(parseAvcSps(sps)).toEqual({ width: 720, height: 576, frameMbsOnly: false });
  });

  it("inspect reports 720×576 for interlaced MPEG-TS, and progressive TS is unchanged", async () => {
    const il = await inspect(fileOf("sample-interlaced.m2t"));
    expect([il.video?.width, il.video?.height]).toEqual([720, 576]);
    const p = await inspect(fileOf("sample.m2t"));
    expect([p.video?.width, p.video?.height]).toEqual([640, 360]);
  });

  it("finds SPS units in an Annex B access unit", () => {
    const au = Buffer.concat([
      Buffer.from([0, 0, 0, 1, 0x09, 0xf0]),
      Buffer.from([0, 0, 1, 0x67, 1, 2]),
      Buffer.from([0, 0, 1, 0x68, 3]),
    ]);
    expect(annexBSps(au).map((u) => Buffer.from(u).toString("hex"))).toEqual(["670102"]);
  });
});

describe("remove metadata leaves no recording time", () => {
  it("clears the header times the muxer stamps, and the re-read finds none", async () => {
    const file = fileOf("sample-tagged.mp4");
    expect(await readMovieHeaderTime(file)).toBe("2026-08-01T10:00:00.000Z");
    const info = await inspect(file);
    const r = await stripMetadataEngine.run("webcodecs", [{ file, info }], {}, ctx());
    const out = new Uint8Array(await r.blob.arrayBuffer());
    expect(await readMovieHeaderTime(new Blob([out]))).toBeUndefined();
    const back = await inspect(new File([out], "clean.mp4"));
    expect(back.tags?.recordedAt).toBeUndefined();
    // Nothing left to clear: mvhd, and tkhd and mdhd of both tracks, are already zero.
    const copy = out.slice();
    expect(clearMovieTimes(copy)).toBe(5);
    expect(Buffer.compare(Buffer.from(copy), Buffer.from(out))).toBe(0);
    if (!hasFfmpeg) return;
    const dir = mkdtempSync(join(tmpdir(), "strip-"));
    writeFileSync(join(dir, "o.mp4"), out);
    const tags = spawnSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format_tags:stream_tags",
        "-of",
        "json",
        join(dir, "o.mp4"),
      ],
      { encoding: "utf8" },
    ).stdout;
    expect(tags).not.toMatch(/creation_time/);
  });
});

describe("lossless merge keeps the sound with the picture", () => {
  it("starts on the priming packet and never drifts at the joins", async () => {
    const { concatCopy, openClip } = await import("@/tools/engines/merge/concat");
    const names = [
      "sample-clicks.mp4",
      "sample-clicks-b.mp4",
      "sample-clicks.mp4",
      "sample-clicks-b.mp4",
    ];
    const clips = await Promise.all(names.map((n) => openClip(fileOf(n))));
    const blob = await concatCopy(clips, "mp4", ctx());
    for (const c of clips) c.input.dispose();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const input = new Input({ source: new BufferSource(bytes), formats: ALL_FORMATS });
    const audio = await input.getPrimaryAudioTrack();
    const src = new Input({
      source: new BufferSource(readFileSync(`${F}sample-clicks.mp4`)),
      formats: ALL_FORMATS,
    });
    const srcAudio = await src.getPrimaryAudioTrack();
    const [first, srcFirst] = await Promise.all([
      audio ? new EncodedPacketSink(audio).getFirstPacket() : null,
      srcAudio ? new EncodedPacketSink(srcAudio).getFirstPacket() : null,
    ]);
    // The first clip's priming packet is kept (and skipped by an edit list, so it reads as before 0).
    expect(first?.timestamp).toBeCloseTo(-1024 / 44_100, 6);
    expect(Buffer.from(first?.data ?? []).equals(Buffer.from(srcFirst?.data ?? [1]))).toBe(true);
    input.dispose();
    src.dispose();
    if (!hasFfmpeg) return;
    const dir = mkdtempSync(join(tmpdir(), "merge-"));
    writeFileSync(join(dir, "m.mp4"), bytes);
    const pcm = spawnSync(
      "ffmpeg",
      ["-v", "error", "-i", join(dir, "m.mp4"), "-map", "0:a:0", "-ac", "1", "-f", "f32le", "-"],
      { maxBuffer: 1 << 26 },
    ).stdout;
    const x = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.length / 4);
    expect(x.length / 44_100).toBeCloseTo(10, 3);
    const clicks: number[] = [];
    for (let i = 0, last = -1e9; i < x.length; i++)
      if (Math.abs(x[i] ?? 0) > 0.2 && i - last > 2000) {
        clicks.push(i / 44.1);
        last = i;
      }
    // The click at 0 ms survives (the first packet is decoded after its priming).
    expect(clicks[0]).toBeLessThan(1);
    // Each clip's clicks sit within half an AAC frame (11.6 ms) of where its picture puts them.
    // Before: +18.6, +38.7 and +57.3 ms at the three joins.
    const starts = [0, 3000, 5000, 8000];
    const phase = [0, 50, 0, 50];
    for (const [k, s] of starts.entries()) {
      const near = clicks.filter((t) => t >= s - 30 && t < s + 250);
      const err = near.map((t) => ((((t - s - (phase[k] ?? 0)) % 100) + 150) % 100) - 50);
      for (const e of err) expect(Math.abs(e)).toBeLessThan(11.7);
    }
  });
});

/** Samples ffmpeg decodes from the first sound track (mono mix), or null without ffmpeg. */
function decodedSamples(bytes: Uint8Array, ext: string): number | null {
  if (!hasFfmpeg) return null;
  const dir = mkdtempSync(join(tmpdir(), "gap-"));
  const path = join(dir, `f.${ext}`);
  writeFileSync(path, bytes);
  const pcm = spawnSync(
    "ffmpeg",
    ["-v", "error", "-i", path, "-map", "0:a:0", "-ac", "1", "-f", "s16le", "-"],
    { maxBuffer: 1 << 26 },
  );
  expect(pcm.stderr.toString()).toBe("");
  return pcm.stdout.length / 2;
}

describe("FLAC final partial frame", () => {
  // sample-flac-tail.flac: 88 204 samples; the last 140 (held at +0.25/-0.25) are a 15-byte frame.
  const count = async (input: Input) => {
    const track = await input.getPrimaryAudioTrack();
    let samples = 0;
    let last: Uint8Array | undefined;
    if (track)
      for await (const p of new EncodedPacketSink(track).packets()) {
        samples += Math.round(p.duration * track.sampleRate);
        last = p.data;
      }
    input.dispose();
    return { samples, last };
  };

  it("mediabunny alone stops one frame early (re-check this on a mediabunny upgrade)", async () => {
    const file = fileOf("sample-flac-tail.flac");
    const plain = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    expect((await count(plain)).samples).toBe(88_064);
  });

  it("openInput reads the last frame, so FLAC decodes sample-complete", async () => {
    const { samples, last } = await count(openInput(fileOf("sample-flac-tail.flac")));
    expect(samples).toBe(88_204);
    // The frame plus the one zero byte reported after the file (16 bytes for the reader).
    expect(last?.length).toBe(16);
    expect(last?.[15]).toBe(0);
    if (hasFfmpeg) {
      const n = decodedSamples(readFileSync(`${F}sample-flac-tail.flac`), "flac");
      expect(n).toBe(88_204);
    }
  });

  it("pads only a file whose last frame is shorter than 16 bytes, and leaves others alone", async () => {
    const tail = (name: string) => new Uint8Array(readFileSync(`${F}${name}`).subarray(-16));
    expect(flacTailPad(tail("sample-flac-tail.flac"))).toBe(1);
    expect(flacTailPad(tail("sample.flac"))).toBe(0);
    const whole = await count(openInput(fileOf("sample.flac")));
    expect(whole.samples).toBe(176_400);
  });
});

/**
 * What mediabunny writes for an Opus encode, built here from an ffmpeg-made Opus file's packets
 * (the same muxer path; Node has no Opus encoder): OpusHead pre-skip 312, every packet counted.
 */
async function muxOpus(name: string, format: OutputFormat): Promise<Uint8Array<ArrayBuffer>> {
  const input = new Input({
    source: new BufferSource(readFileSync(`${F}${name}`)),
    formats: ALL_FORMATS,
  });
  const track = await input.getPrimaryAudioTrack();
  if (!track) throw new Error("no sound");
  const config = await track.getDecoderConfig();
  const output = new Output({ format, target: new BufferTarget() });
  const source = new EncodedAudioPacketSource("opus");
  output.addAudioTrack(source);
  await output.start();
  const sink = new EncodedPacketSink(track);
  const first = (await sink.getFirstPacket())?.timestamp ?? 0;
  let meta = true;
  for await (const p of sink.packets()) {
    await source.add(
      p.clone({ timestamp: p.timestamp - first }),
      meta && config ? { decoderConfig: config } : undefined,
    );
    meta = false;
  }
  await output.finalize();
  input.dispose();
  return new Uint8Array(output.target.buffer ?? new ArrayBuffer(0));
}

const join2 = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

describe("Opus outputs end where the sound ends", () => {
  it("Ogg: the end granule trims the padding, and the measured pre-skip is written", async () => {
    const raw = await muxOpus("sample.opus", new OggOutputFormat());
    // Before: mediabunny's last granule is the sum of the packets, 13.5 ms of padding played.
    expect(decodedSamples(raw, "opus") ?? 192_648).toBe(192_648);
    const fixed = fixOggOpus(raw, { endSec: 4 });
    expect(fixed).not.toBeNull();
    if (!fixed) return;
    expect(lastOggGranule(fixed)).toBe(192_312n);
    expect(decodedSamples(fixed, "opus") ?? 192_000).toBe(192_000);
    // A larger real delay (Chromium resampling 44.1 kHz input: 347) moves the start, not the length.
    const later = fixOggOpus(raw, { endSec: 4, preSkip: 347 });
    if (!later) throw new Error("not fixed");
    const head = later.subarray(28, 47);
    expect(readOpusHead(head)?.preSkip).toBe(347);
    expect(lastOggGranule(later)).toBe(192_347n);
    expect(decodedSamples(later, "opus") ?? 192_000).toBe(192_000);
  });

  it("Ogg: packets wholly past the end are dropped, never the last real one", async () => {
    const raw = await muxOpus("sample.opus", new OggOutputFormat());
    const fixed = fixOggOpus(raw, { endSec: 3.99 });
    if (!fixed) throw new Error("not fixed");
    // 3.99 s + 312 = 191 832 samples: 200 packets of 960 (192 000) hold it, the 201st is dropped.
    const input = new Input({ source: new BufferSource(fixed), formats: ALL_FORMATS });
    const track = await input.getPrimaryAudioTrack();
    let packets = 0;
    if (track) for await (const _ of new EncodedPacketSink(track).packets()) packets++;
    input.dispose();
    expect(packets).toBe(200);
    expect(decodedSamples(fixed, "opus") ?? 191_520).toBe(191_520);
  });

  for (const [label, format, ext] of [
    ["WebM", () => new WebMOutputFormat(), "webm"],
    ["Matroska", () => new MkvOutputFormat(), "mkv"],
  ] as const) {
    it(`${label}: CodecDelay, SeekPreRoll and DiscardPadding say where the sound is`, async () => {
      const raw = await muxOpus("sample.opus", format());
      expect(decodedSamples(raw, ext) ?? 192_648).toBe(192_648);
      const heads = matroskaOpusTracks(raw);
      expect(heads).toEqual([{ trackNumber: 1, channels: 2, preSkip: 312, inputRate: 48_000 }]);
      const parts = fixMatroskaOpus(raw, { endSec: 4, preSkip: new Map([[1, 347]]) });
      if (!parts) throw new Error("not fixed");
      const fixed = join2(parts);
      expect(decodedSamples(fixed, ext) ?? 192_000).toBe(192_000);
      expect(matroskaOpusTracks(fixed)[0]?.preSkip).toBe(347);
      if (!hasFfmpeg) return;
      const dir = mkdtempSync(join(tmpdir(), "mka-"));
      writeFileSync(join(dir, `f.${ext}`), fixed);
      const probe = JSON.parse(
        spawnSync(
          "ffprobe",
          [
            "-v",
            "error",
            "-show_entries",
            "stream=initial_padding",
            "-show_packets",
            "-of",
            "json",
            join(dir, `f.${ext}`),
          ],
          { encoding: "utf8" },
        ).stdout,
      );
      expect(probe.streams[0].initial_padding).toBe(347);
      const last = probe.packets.at(-1);
      // DiscardPadding of the last block: 201 × 960 − 347 − 192 000 = 613 samples.
      expect(JSON.stringify(last.side_data_list ?? [])).toMatch(
        /"skip_end":\s*613|discard_padding.*613/,
      );
    });
  }
});

describe("Opus sources are read to where their sound ends", () => {
  it("Ogg end granule and WebM DiscardPadding, exact to the sample", async () => {
    for (const [name, want, before] of [
      ["sample.opus", 4, 4.0135],
      ["sample.webm", 3, 3.008],
    ] as const) {
      const file = fileOf(name);
      const input = openInput(file);
      const track = await input.getPrimaryAudioTrack();
      if (!track) throw new Error("no sound");
      // mediabunny alone reads the encoder's padding as sound.
      const plain = (await track.getDurationFromMetadata()) ?? (await track.computeDuration());
      expect(plain).toBeCloseTo(before, 6);
      expect(await opusSourceEnd(file, track)).toBeCloseTo(want, 9);
      expect(await soundTrackEnd(track, file)).toBeCloseTo(want, 9);
      input.dispose();
    }
  });

  it("leaves other codecs to mediabunny", async () => {
    const file = fileOf("sample.mp4");
    const input = openInput(file);
    const track = await input.getPrimaryAudioTrack();
    if (track) expect(await opusSourceEnd(file, track)).toBeUndefined();
    input.dispose();
  });
});

describe("Opus encoder end gate", () => {
  const mk = (timestamp: number, frames: number) =>
    new AudioSample({
      data: new Float32Array(frames).fill(0.5),
      format: "f32-planar",
      numberOfChannels: 1,
      sampleRate: 48_000,
      timestamp,
    });

  it("cuts at the end, drops what follows and appends the flush silence once", async () => {
    const gate = opusEndGate(0.05);
    const a = await gate(mk(0, 1920));
    expect(Array.isArray(a) ? a.length : a?.numberOfFrames).toBe(1920);
    const b = await gate(mk(0.04, 960));
    if (!Array.isArray(b)) throw new Error("expected the cut sample and the silence");
    expect(b[0]?.numberOfFrames).toBe(480);
    expect(b[1]?.timestamp).toBeCloseTo(0.05, 9);
    // No WebCodecs in Node: the fallback is the declared look-ahead plus one frame.
    expect(b[1]?.numberOfFrames).toBe(312 + 960);
    const plane = new Float32Array(b[1]?.numberOfFrames ?? 0);
    b[1]?.copyTo(plane, { planeIndex: 0, format: "f32-planar" });
    expect(plane.every((v) => v === 0)).toBe(true);
    expect(await gate(mk(0.06, 960))).toBeNull();
  });

  it("counts Opus packet lengths from the TOC byte", () => {
    expect(opusPacketSamples(Uint8Array.of(0xfc))).toBe(960); // CELT 20 ms, one frame
    expect(opusPacketSamples(Uint8Array.of(0xfd))).toBe(1920); // two frames
    expect(opusPacketSamples(Uint8Array.of(0xfb, 0x03))).toBe(2880); // code 3, three 20 ms frames
    expect(opusPacketSamples(Uint8Array.of(0x08))).toBe(960); // SILK 20 ms
  });
});

describe("sound re-encoded beside a picture runs in its own Conversion", () => {
  it("joins a copied picture and a re-encoded sound on one output, both from zero", async () => {
    // PCM decodes and encodes in Node, so the composable split runs end to end here; the AAC case
    // (pre-roll, first frame whole) needs WebCodecs and is measured in the engines e2e spec.
    const file = fileOf("sample-pcm.mov");
    const r = await convert({
      file,
      to: "mov",
      outputName: "o.mov",
      audio: { codec: "pcm-s24", forceTranscode: true },
      ffmpegCommand: "",
      ctx: ctx(),
    });
    const bytes = new Uint8Array(await r.blob.arrayBuffer());
    const back = new Input({ source: new BufferSource(bytes), formats: ALL_FORMATS });
    const [v, a] = [await back.getPrimaryVideoTrack(), await back.getPrimaryAudioTrack()];
    expect(v?.codec).toBe("avc");
    expect(a?.codec).toBe("pcm-s24");
    expect(await v?.getFirstTimestamp()).toBe(0);
    expect(await a?.getFirstTimestamp()).toBe(0);
    // The picture is copied packet for packet.
    const src = openInput(file);
    const sv = await src.getPrimaryVideoTrack();
    let same = 0;
    let total = 0;
    if (sv && v) {
      const outs = new EncodedPacketSink(v).packets();
      for await (const p of new EncodedPacketSink(sv).packets()) {
        const q = (await outs.next()).value;
        total++;
        if (q && Buffer.from(q.data).equals(Buffer.from(p.data))) same++;
      }
    }
    expect(total).toBeGreaterThan(0);
    expect(same).toBe(total);
    src.dispose();
    back.dispose();
    if (hasFfmpeg) expect(decodedSamples(bytes, "mov")).toBe(88_200);
  });
});
