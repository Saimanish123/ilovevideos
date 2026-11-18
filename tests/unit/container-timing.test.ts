import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { addAudioEngine } from "@/tools/engines/add-audio";
import { audioSyncEngine } from "@/tools/engines/audio-sync";
import { planConversion } from "@/tools/engines/convert-video/plan";
import { classifyError, isEngineError } from "@/tools/engines/errors";
import { flacTailPad, renumberFlacFrame } from "@/tools/engines/mediabunny/flac-tail";
import { planMatroskaRepair } from "@/tools/engines/mediabunny/matroska-repair";
import { readMatroskaDelays } from "@/tools/engines/mediabunny/matroska-timing";
import { copyPrimaryAudio } from "@/tools/engines/mediabunny/packet-copy";
import { convert, inspect } from "@/tools/engines/mediabunny/shared";
import { splitEngine } from "@/tools/engines/split";
import { trimEngine } from "@/tools/engines/trim";
import type { MediaInfo } from "@/tools/engines/types";

/**
 * Where sound and picture start and end when files are copied between containers, cut short, or
 * start late (2026-10-08). Everything here is a packet copy or a read, so it runs in Node; ffmpeg
 * (test-only) decodes the results the way players do.
 */
const F = "tests/fixtures/";
const fileOf = (name: string, bytes?: Uint8Array<ArrayBuffer>) =>
  new File([bytes ?? readFileSync(`${F}${name}`)], name);
const ctx = () => ({ signal: new AbortController().signal, onProgress: () => undefined });
const hasFfmpeg = !spawnSync("ffprobe", ["-version"]).error;
const dir = mkdtempSync(join(tmpdir(), "timing-"));
const save = async (blob: Blob, name: string) => {
  const path = join(dir, name);
  writeFileSync(path, new Uint8Array(await blob.arrayBuffer()));
  return path;
};

/** The first sound track decoded mono at 44.1 kHz, as a player hears it. */
function pcm(path: string): Float32Array {
  const out = spawnSync(
    "ffmpeg",
    ["-v", "error", "-i", path, "-map", "0:a:0", "-ac", "1", "-ar", "44100", "-f", "f32le", "-"],
    { maxBuffer: 1 << 27 },
  ).stdout;
  return new Float32Array(out.buffer, out.byteOffset, out.length / 4);
}

/**
 * Largest difference between two decodings over their first 0.5 s, sample for sample. A lossless
 * copy decodes to the same samples when both start in the same place; 1024 samples of misplaced
 * priming make this large on a tone.
 */
function mismatch(a: Float32Array, b: Float32Array): number {
  let worst = 0;
  for (let i = 0; i < 22_050; i++) worst = Math.max(worst, Math.abs((a[i] ?? 0) - (b[i] ?? 0)));
  return worst;
}

/** Times (s) of the clicks fixture's bursts: the first loud sample after a quiet stretch. */
function clicks(x: Float32Array): number[] {
  const out: number[] = [];
  for (let i = 0, last = -1e9; i < x.length; i++)
    if (Math.abs(x[i] ?? 0) > 0.2 && i - last > 2000) {
      out.push(i / 44_100);
      last = i;
    }
  return out;
}

describe("Matroska start delay", () => {
  it("reads CodecDelay (AAC priming) and the Opus pre-skip from the Tracks element", () => {
    const head = (n: string) => new Uint8Array(readFileSync(`${F}${n}`).subarray(0, 1 << 20));
    expect(readMatroskaDelays(head("sample.mkv")).get(2)).toBeCloseTo(1024 / 44_100, 6);
    expect(readMatroskaDelays(head("sample.webm")).get(2)).toBeCloseTo(312 / 48_000, 9);
  });

  it.runIf(hasFfmpeg)(
    "MKV → MP4 keeps the priming behind an edit list (before: 1024 samples late)",
    async () => {
      const r = await convert({
        file: fileOf("sample.mkv"),
        to: "mp4",
        outputName: "o.mp4",
        ffmpegCommand: "",
        ctx: ctx(),
      });
      const out = await save(r.blob, "mkv.mp4");
      expect(mismatch(pcm(`${F}sample.mkv`), pcm(out))).toBeLessThan(1e-3);
    },
  );

  it.runIf(hasFfmpeg)(
    "MP4 → MKV states the priming as CodecDelay and the end as DiscardPadding",
    async () => {
      const r = await convert({
        file: fileOf("sample-clicks.mp4"),
        to: "mkv",
        outputName: "o.mkv",
        ffmpegCommand: "",
        ctx: ctx(),
      });
      const x = pcm(await save(r.blob, "clicks.mkv"));
      // Before: 133 120 samples (priming and padding played) and every click 23 ms late.
      expect(x.length).toBe(132_300);
      expect(Math.abs(clicks(x)[0] ?? 1)).toBeLessThan(0.0005);
    },
  );

  it.runIf(hasFfmpeg)("WebM Opus copied into MKV keeps its pre-skip and its end", async () => {
    const r = await convert({
      file: fileOf("sample.webm"),
      to: "mkv",
      outputName: "o.mkv",
      ffmpegCommand: "",
      ctx: ctx(),
    });
    const out = await save(r.blob, "opus.mkv");
    // 3 s at 48 kHz exactly (before: 144 576, the source's padding played).
    expect(pcm(out).length).toBe(132_300);
    expect(mismatch(pcm(`${F}sample.webm`), pcm(out))).toBeLessThan(1e-3);
  });

  it.runIf(hasFfmpeg)(
    "fix audio sync on an MKV moves the sound by the asked amount (before: 21 ms short)",
    async () => {
      const mkv = join(dir, "clicks-src.mkv");
      spawnSync("ffmpeg", ["-v", "error", "-y", "-i", `${F}sample-clicks.mp4`, "-c", "copy", mkv]);
      const file = new File([readFileSync(mkv)], "clicks.mkv");
      const info = await inspect(file);
      const r = await audioSyncEngine.run(
        "webcodecs",
        [{ file, info }],
        audioSyncEngine.optionsSchema.parse({ offsetMs: -200 }),
        ctx(),
      );
      const c = clicks(pcm(await save(r.blob, "synced.mkv")));
      // The click at 0.2 s now plays at 0; MKV lands on the nearest AAC frame (±11.6 ms).
      for (const t of c.slice(0, 10)) {
        const err = ((((t * 1000) % 100) + 150) % 100) - 50;
        expect(Math.abs(err)).toBeLessThan(11.7);
      }
    },
  );
});

describe("a Matroska file cut short", () => {
  const whole = readFileSync(`${F}sample.mkv`);
  const cut = new Uint8Array(whole.subarray(0, Math.round(whole.length * 0.6)));

  it("is read up to its cut (before: mediabunny read no packet at all)", async () => {
    const plan = await planMatroskaRepair(cut.length, async (s, e) => cut.slice(s, e));
    expect(plan).not.toBeNull();
    expect(plan?.size).toBeLessThanOrEqual(cut.length);
    expect(
      await planMatroskaRepair(whole.length, async (s, e) => new Uint8Array(whole.subarray(s, e))),
    ).toBeNull();
    const r = await convert({
      file: fileOf("cut.mkv", cut),
      to: "mp4",
      outputName: "o.mp4",
      ffmpegCommand: "",
      ctx: ctx(),
    });
    expect(r.blob.size).toBeGreaterThan(cut.length * 0.8);
    if (!hasFfmpeg) return;
    const out = await save(r.blob, "cut.mp4");
    const count = (p: string) =>
      spawnSync(
        "ffprobe",
        [
          "-v",
          "error",
          "-count_packets",
          "-show_entries",
          "stream=nb_read_packets",
          "-of",
          "csv=p=0",
          p,
        ],
        { encoding: "utf8" },
      ).stdout.trim();
    const src = join(dir, "cut.mkv");
    writeFileSync(src, cut);
    // The same packets ffmpeg recovers (it drops the partial block at the cut too).
    expect(count(out)).toBe(count(src));
  });

  it("with nothing readable is an error, never a 148-byte success", async () => {
    const r = convert({
      file: fileOf("head.mkv", new Uint8Array(whole.subarray(0, 1000))),
      to: "mp4",
      outputName: "o.mp4",
      ffmpegCommand: "",
      ctx: ctx(),
    });
    await expect(r).rejects.toMatchObject({ code: "unsupported-input" });
  });
});

describe("files that start late (MPEG-TS)", () => {
  it("inspect reports the start and the length from it, not the end", async () => {
    const info = await inspect(fileOf("sample.m2t"));
    expect(info.startSec ?? 0).toBeGreaterThan(1);
    expect(info.durationSec).toBeCloseTo(3, 1);
  });

  it.runIf(hasFfmpeg)("trim and split take page times from the file's start", async () => {
    const file = fileOf("sample.m2t");
    const info = await inspect(file);
    const t = await trimEngine.run(
      "webcodecs",
      [{ file, info }],
      trimEngine.optionsSchema.parse({ start: 1.05, end: 2, precise: false }),
      ctx(),
    );
    const out = await save(t.blob, "trim.mp4");
    const d = Number(
      spawnSync(
        "ffprobe",
        ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out],
        {
          encoding: "utf8",
        },
      ).stdout,
    );
    // From the key frame at 1.02 s (page time) to 2 s. Before: the source's 1.4 s start was ignored and
    // the cut came out 1.62 s long from 0.467 s.
    expect(d).toBeGreaterThan(0.9);
    expect(d).toBeLessThan(1.05);
    const s = await splitEngine.run(
      "webcodecs",
      [{ file, info }],
      splitEngine.optionsSchema.parse({}),
      ctx(),
    );
    expect(s.files?.length).toBeGreaterThanOrEqual(2);
    expect(s.files?.[0]?.meta).toMatch(/^0:00\.00–/);
  });
});

describe("files that cannot be read as they should", () => {
  it("an MP4/MOV cut before its index is refused at read with the reason", async () => {
    const whole = readFileSync(`${F}sample.mov`);
    const r = inspect(fileOf("cut.mov", new Uint8Array(whole.subarray(0, whole.length * 0.6))));
    await expect(r).rejects.toMatchObject({
      code: "unsupported-input",
      message: expect.stringMatching(/cut off/),
    });
  });

  it("settings that fail their schema say what is wrong, not zod's issue list", () => {
    const parsed = trimEngine.optionsSchema.safeParse({ start: 2, end: 1 });
    const e = classifyError(parsed.success ? null : parsed.error);
    expect(isEngineError(e)).toBe(true);
    expect(e.message).toBe("End must be after start.");
  });

  it("a picture this browser cannot decode is routed away from the native path", () => {
    const info: MediaInfo = {
      container: "QuickTime",
      durationSec: 3,
      sizeBytes: 1,
      video: { codec: "hevc", width: 640, height: 360, fps: 25, decodable: false },
      audio: [{ codec: "aac", channels: 2, sampleRate: 48_000, decodable: true }],
    };
    expect(planConversion(info, "a.mov", "mp4", true).backend).toBe("ffmpeg-wasm");
    // Copying the picture needs no decoder.
    expect(planConversion(info, "a.mov", "mp4", false)).toMatchObject({
      backend: "webcodecs",
      copyVideo: true,
    });
    // A rotated picture is not copied into Matroska (no rotation flag), it is turned upright.
    const rotated = {
      ...info,
      video: { ...info.video, codec: "avc", rotation: 90, decodable: true },
    };
    expect(planConversion(rotated as MediaInfo, "a.mp4", "mkv", false).copyVideo).toBe(false);
    expect(planConversion(rotated as MediaInfo, "a.mp4", "mov", false).copyVideo).toBe(true);
  });
});

describe("MP3 sound placed on a video", () => {
  it.runIf(hasFfmpeg)("is copied from its gapless start (before: 1105 samples late)", async () => {
    const video = fileOf("sample.mp4");
    const audio = fileOf("sample.mp3");
    const inputs = [
      { file: video, info: await inspect(video) },
      { file: audio, info: await inspect(audio) },
    ];
    const r = await addAudioEngine.run(
      "webcodecs",
      inputs,
      addAudioEngine.optionsSchema.parse({ fadeOut: 0 }),
      ctx(),
    );
    const out = await save(r.blob, "with-mp3.mp4");
    expect(r.meta ?? "").toMatch(/MP3 copied/);
    expect(mismatch(pcm(`${F}sample.mp3`), pcm(out))).toBeLessThan(1e-3);
  });

  it("inspect gives an MP3 its gapless length", async () => {
    expect((await inspect(fileOf("sample.mp3"))).durationSec).toBeCloseTo(4, 6);
  });
});

describe("FLAC cut out of a longer file", () => {
  it.runIf(hasFfmpeg)(
    "is renumbered from 0 with valid checksums (before: start time 0.464 s)",
    async () => {
      const blob = await copyPrimaryAudio({
        file: fileOf("sample.flac"),
        to: "flac",
        range: { start: 1, end: 2.5 },
        ctx: ctx(),
      });
      const out = await save(blob, "cut.flac");
      const start = spawnSync(
        "ffprobe",
        ["-v", "error", "-show_entries", "stream=start_time", "-of", "csv=p=0", out],
        { encoding: "utf8" },
      ).stdout.trim();
      expect(Number(start)).toBe(0);
      const errors = spawnSync(
        "ffmpeg",
        ["-v", "error", "-err_detect", "crccheck", "-i", out, "-f", "null", "-"],
        {
          encoding: "utf8",
        },
      ).stderr;
      expect(errors).toBe("");
    },
  );

  it("renumbering keeps a frame's header readable", () => {
    const flac = readFileSync(`${F}sample.flac`);
    // The first frame follows the metadata blocks; find its sync code.
    let at = 42;
    while (!(flac[at] === 0xff && ((flac[at + 1] ?? 0) & 0xfe) === 0xf8)) at++;
    const frame = new Uint8Array(flac.subarray(at, at + 2000));
    const again = renumberFlacFrame(renumberFlacFrame(frame, 300), 0);
    expect(Buffer.from(again.subarray(0, 8)).equals(Buffer.from(frame.subarray(0, 8)))).toBe(true);
    expect(flacTailPad(again.subarray(-16))).toBe(0);
  });
});

describe("outputs too large for memory", () => {
  it("without disk storage, an output past about 1.8 GB is refused before any work", async () => {
    const { openOutputStore } = await import("@/tools/engines/mediabunny/output-store");
    // Node has no OPFS: the in-memory fallback is all there is.
    await expect(openOutputStore(2.3e9)).rejects.toMatchObject({
      code: "resource",
      message: expect.stringMatching(/more than a browser can hold in memory/),
    });
    const small = await openOutputStore(1000);
    expect(small.streamed).toBe(false);
  });

  it("a 2 GiB allocation failure is named as a size limit, not missing memory", () => {
    const e = classifyError(new RangeError("Array buffer allocation failed"));
    expect(e.code).toBe("resource");
    expect(e.message).toMatch(/2 GB/);
    expect(e.hint ?? "").not.toMatch(/memory|desktop Chrome/i);
  });

  it.runIf(hasFfmpeg)(
    "a streamed MP4 (index last) gets its edit list on the index alone",
    async () => {
      const {
        ALL_FORMATS,
        BufferSource,
        BufferTarget,
        EncodedAudioPacketSource,
        EncodedPacketSink,
        Input,
        Mp4OutputFormat,
        Output,
      } = await import("mediabunny");
      const { editOutputSound } = await import("@/tools/engines/mediabunny/output-store");
      const src = new Input({
        source: new BufferSource(readFileSync(`${F}sample.m4a`)),
        formats: ALL_FORMATS,
      });
      const track = await src.getPrimaryAudioTrack();
      if (!track) throw new Error("no sound");
      const out = new Output({
        format: new Mp4OutputFormat({ fastStart: false }),
        target: new BufferTarget(),
      });
      const source = new EncodedAudioPacketSource("aac");
      out.addAudioTrack(source);
      await out.start();
      const config = await track.getDecoderConfig();
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
      await out.finalize();
      src.dispose();
      const muxed = new Blob([out.target.buffer ?? new ArrayBuffer(0)]);
      const parts = await editOutputSound(muxed, (tracks) =>
        tracks[0] ? [{ trackId: tracks[0].id, primingSec: -first, endSec: 4 }] : [],
      );
      expect(parts).not.toBeNull();
      const file = await save(new Blob(parts ?? []), "streamed.m4a");
      // The priming is skipped and the sound ends at 4 s, exactly as in the source.
      expect(pcm(file).length).toBe(176_400);
      expect(mismatch(pcm(`${F}sample.m4a`), pcm(file))).toBeLessThan(1e-3);
    },
  );
});

describe("AAC encoder quirks (WebKit, Safari 26.5 engine)", () => {
  it("finds the AudioSpecificConfig inside the ES_Descriptor WebKit hands out", async () => {
    const { aacConfig } = await import("@/tools/engines/mediabunny/priming");
    // As measured from WebKit's AudioEncoder: ES_Descriptor → DecoderConfig → DecoderSpecificInfo.
    const esds = Uint8Array.from([
      3, 128, 128, 128, 34, 0, 0, 0, 4, 128, 128, 128, 20, 64, 20, 0, 24, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      5, 128, 128, 128, 2, 18, 16, 6, 128, 128, 128, 1, 2,
    ]);
    expect([...aacConfig(esds, 44_100, 2)]).toEqual([0x12, 0x10]);
    // A plain AudioSpecificConfig is kept; none at all is built for AAC-LC.
    expect([...aacConfig(Uint8Array.of(0x11, 0x90), 48_000, 2)]).toEqual([0x11, 0x90]);
    expect([...aacConfig(undefined, 48_000, 1)]).toEqual([0x11, 0x88]);
  });

  it.runIf(hasFfmpeg)(
    "rewrites jittered packet durations to 1024 samples and sets the start",
    async () => {
      const {
        ALL_FORMATS,
        BufferSource,
        BufferTarget,
        EncodedAudioPacketSource,
        EncodedPacketSink,
        Input,
        Mp4OutputFormat,
        Output,
      } = await import("mediabunny");
      const { editOutputSound } = await import("@/tools/engines/mediabunny/output-store");
      const src = new Input({
        source: new BufferSource(readFileSync(`${F}sample.m4a`)),
        formats: ALL_FORMATS,
      });
      const track = await src.getPrimaryAudioTrack();
      if (!track) throw new Error("no sound");
      const out = new Output({
        format: new Mp4OutputFormat({ fastStart: "in-memory" }),
        target: new BufferTarget(),
      });
      const source = new EncodedAudioPacketSource("aac");
      out.addAudioTrack(source);
      await out.start();
      const config = await track.getDecoderConfig();
      const sink = new EncodedPacketSink(track);
      const first = (await sink.getFirstPacket())?.timestamp ?? 0;
      let k = 0;
      // As WebKit stamps them: 13.5 ms late, and 2.4 % long.
      for await (const p of sink.packets()) {
        await source.add(
          p.clone({
            timestamp: 0.0135 + k * (1024 / 44_100) * 1.024,
            duration: (1024 / 44_100) * 1.024,
          }),
          k === 0 && config ? { decoderConfig: config } : undefined,
        );
        k++;
      }
      await out.finalize();
      src.dispose();
      const data = out.target.buffer ?? new ArrayBuffer(0);
      const before = await save(new Blob([data]), "jitter.m4a");
      const parts = await editOutputSound(data.slice(0), (tracks) =>
        tracks[0]
          ? [
              {
                trackId: tracks[0].id,
                primingSec: -first,
                endSec: 4,
                frameSec: 1024 / 44_100,
                startSec: 0,
              },
            ]
          : [],
      );
      const after = await save(new Blob(parts ?? []), "fixed.m4a");
      // Before: the sound starts 13.5 ms late and is cut short by the stretched table.
      expect(mismatch(pcm(`${F}sample.m4a`), pcm(before))).toBeGreaterThan(0.05);
      expect(pcm(after).length).toBe(176_400);
      expect(mismatch(pcm(`${F}sample.m4a`), pcm(after))).toBeLessThan(1e-3);
    },
  );
});

describe("MP3 copied out of a file", () => {
  it.runIf(hasFfmpeg)(
    "from MKV gets a LAME tag: exact length, sound on time (before: 25.08 ms late)",
    async () => {
      const blob = await copyPrimaryAudio({
        file: fileOf("sample-clicks-mp3.mkv"),
        to: "mp3",
        ctx: ctx(),
      });
      const x = pcm(await save(blob, "from-mkv.mp3"));
      // Before: 133 632 samples and the click at 0 s at 25.08 ms (1105 samples).
      expect(x.length).toBe(132_300);
      expect(clicks(x)[0]).toBeLessThan(0.0001);
      const head = new Uint8Array(await blob.slice(0, 4096).arrayBuffer());
      const { readMp3Gapless } = await import("@/tools/engines/mediabunny/mp3-gapless");
      expect(readMp3Gapless(head)?.delay).toBe(576);
    },
  );

  it.runIf(hasFfmpeg)("a cut keeps two frames of pre-roll and its exact length", async () => {
    const blob = await copyPrimaryAudio({
      file: fileOf("sample-clicks-mp3.mkv"),
      to: "mp3",
      range: { start: 1, end: 2 },
      ctx: ctx(),
    });
    const x = pcm(await save(blob, "cut.mp3"));
    expect(x.length).toBe(44_100);
    // The click at the cut survives (one frame of pre-roll decoded it as silence: bit reservoir).
    expect(Math.max(...Array.from(x.subarray(0, 150), Math.abs))).toBeGreaterThan(0.5);
    const c = clicks(x);
    for (const t of c) expect(Math.abs(((t * 1000 + 50) % 100) - 50)).toBeLessThan(0.1);
  });

  it.runIf(hasFfmpeg)("from an MP3 keeps its gapless window", async () => {
    const blob = await copyPrimaryAudio({ file: fileOf("sample.mp3"), to: "mp3", ctx: ctx() });
    const out = await save(blob, "again.mp3");
    expect(pcm(out).length).toBe(pcm(`${F}sample.mp3`).length);
    expect(mismatch(pcm(`${F}sample.mp3`), pcm(out))).toBeLessThan(1e-3);
  });
});

describe("frame-accurate trim of odd sizes", () => {
  it("crops H.264 to even edges, keeps VP9 as it is, and uses the shared bitrate", async () => {
    const { preciseVideo } = await import("@/tools/engines/trim");
    const v = { codec: "vp9", width: 641, height: 361, fps: 30, bitrate: 300_000 };
    const mp4 = preciseVideo("mp4", v);
    expect(mp4.codec).toBe("avc");
    expect(mp4.size).toEqual({ width: 640, height: 360 });
    expect(mp4.options).toMatchObject({ crop: { left: 0, top: 0, width: 640, height: 360 } });
    const webm = preciseVideo("webm", v);
    expect(webm.size).toEqual({ width: 641, height: 361 });
    expect("crop" in webm.options).toBe(false);
    // Held near the source's own rate, not the "best" density for the size (a 364 kB cut grew to 1.3 MB).
    expect(webm.bitrate ?? 0).toBeLessThan(1_000_000);
  });
});

describe("conversion of odd sizes", () => {
  const info = (codec: string): MediaInfo => ({
    container: "WebM",
    durationSec: 1,
    sizeBytes: 1,
    video: { codec, width: 641, height: 361, fps: 30 },
    audio: [{ codec: "opus", sampleRate: 48_000, channels: 2 }],
  });
  it("cuts an odd edge for H.264 and says so; VP9 and copies keep the size", () => {
    const mp4 = planConversion(info("vp9"), "odd.webm", "mp4", true);
    expect(mp4.backend).toBe("webcodecs");
    expect(mp4.copyVideo).toBe(false);
    expect(mp4.size).toEqual({ width: 640, height: 360 });
    expect(mp4.sizeNote).toBe("641×361 becomes 640×360: H.264 needs even edges.");
    const webm = planConversion(info("avc"), "odd.mkv", "webm");
    expect(webm.size).toEqual({ width: 641, height: 361 });
    expect(webm.sizeNote).toBe("");
    const mkv = planConversion(info("vp9"), "odd.webm", "mkv");
    expect(mkv.copyVideo).toBe(true);
    expect(mkv.size).toBeUndefined();
    expect(mkv.sizeNote).toBe("");
  });
});
