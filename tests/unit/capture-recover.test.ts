import { readFileSync } from "node:fs";
import {
  ALL_FORMATS,
  BlobSource,
  BufferSource,
  BufferTarget,
  EncodedAudioPacketSource,
  EncodedPacket,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Input,
  Mp4OutputFormat,
  OggOutputFormat,
  Output,
  type OutputFormat,
  StreamTarget,
  type StreamTargetChunk,
  WebMOutputFormat,
} from "mediabunny";
import { describe, expect, it } from "vitest";
import {
  avcLengthSize,
  blobReader,
  decodeEntries,
  encodeEntries,
  findPackets,
  fixWavHeader,
  isAvcPacket,
  type JournalEntry,
  mdatStart,
  oggWholeLength,
  webmPatches,
} from "@/tools/engines/capture/journal";

/**
 * A recording cut off mid-way, as a crash leaves it: the fixture's packets are muxed the way the
 * recorder muxes them (streamed, 64 KiB chunks), and the bytes on "disk" are taken before Stop
 * (no finalize); 8 KiB chunks keep the short fixtures from fitting in one. The journal is what the recorder writes beside the file.
 */
async function cutOff(
  fixture: string,
  format: OutputFormat,
  share: number,
  opts: { audioOnly?: boolean } = {},
) {
  const input = new Input({
    source: new BufferSource(readFileSync(`tests/fixtures/${fixture}`)),
    formats: ALL_FORMATS,
  });
  const [v] = opts.audioOnly ? [] : await input.getVideoTracks();
  const [a] = await input.getAudioTracks();
  let disk = new Uint8Array(1 << 20);
  let size = 0;
  const writable = new WritableStream<StreamTargetChunk>({
    write(c) {
      const end = c.position + c.data.byteLength;
      if (end > disk.length) {
        const g = new Uint8Array(Math.max(end, disk.length * 2));
        g.set(disk);
        disk = g;
      }
      disk.set(c.data, c.position);
      size = Math.max(size, end);
    },
  });
  const output = new Output({
    format,
    target: new StreamTarget(writable, { chunked: true, chunkSize: 8 * 1024 }),
  });
  type Lane = {
    packets: EncodedPacket[];
    add: (p: EncodedPacket, first: boolean) => Promise<void>;
    track: "video" | "audio";
  };
  const lanes: Lane[] = [];
  const configs: { video?: VideoDecoderConfig; audio?: AudioDecoderConfig } = {};
  if (v?.codec) {
    const src = new EncodedVideoPacketSource(v.codec);
    output.addVideoTrack(src, { frameRate: 30 });
    const config = (await v.getDecoderConfig()) ?? undefined;
    configs.video = config;
    const packets: EncodedPacket[] = [];
    for await (const p of new EncodedPacketSink(v).packets()) packets.push(p);
    lanes.push({
      packets,
      track: "video",
      add: (p, first) => src.add(p, first && config ? { decoderConfig: config } : undefined),
    });
  }
  if (a?.codec) {
    const src = new EncodedAudioPacketSource(a.codec);
    output.addAudioTrack(src);
    const config = (await a.getDecoderConfig()) ?? undefined;
    configs.audio = config;
    const packets: EncodedPacket[] = [];
    for await (const p of new EncodedPacketSink(a).packets()) packets.push(p);
    lanes.push({
      packets,
      track: "audio",
      add: (p, first) => src.add(p, first && config ? { decoderConfig: config } : undefined),
    });
  }
  await output.start();
  // Recordings start at zero; some fixtures start their sound a little before it.
  const t0 = Math.min(0, ...lanes.flatMap((l) => l.packets.map((p) => p.timestamp)));
  const all = lanes
    .flatMap((l) =>
      l.packets.map((p, i) => ({ l, p: p.clone({ timestamp: p.timestamp - t0 }), first: i === 0 })),
    )
    .sort((x, y) => x.p.timestamp - y.p.timestamp);
  const take = all.slice(0, Math.floor(all.length * share));
  const journal: JournalEntry[] = [];
  for (const { l, p, first } of take) {
    await l.add(p, first);
    journal.push({
      track: l.track,
      key: p.type === "key",
      size: p.byteLength,
      timestamp: p.timestamp,
      duration: p.duration,
    });
  }
  // Let the stream settle, then "crash": the bytes on disk now are all there is.
  await new Promise((r) => setTimeout(r, 20));
  const bytes = disk.slice(0, size);
  input.dispose();
  return { bytes, journal, configs, sent: take };
}

describe("journal", () => {
  it("round-trips entries and ignores a torn last one", () => {
    const e: JournalEntry[] = [
      { track: "video", key: true, size: 1234, timestamp: 0.0333, duration: 0.0333 },
      { track: "audio", key: true, size: 371, timestamp: 0.021, duration: 0.0213 },
    ];
    const buf = encodeEntries(e);
    expect(decodeEntries(buf)).toEqual(e);
    expect(decodeEntries(buf.slice(0, 24 + 10))).toEqual([e[0]]);
  });

  it("tells an H.264 packet from other bytes", () => {
    // Two NAL units: an IDR slice (type 5) of 3 bytes and an SEI (type 6) of 2.
    expect(isAvcPacket(new Uint8Array([0, 0, 0, 3, 0x65, 1, 2, 0, 0, 0, 2, 0x06, 9]))).toBe(true);
    expect(isAvcPacket(new Uint8Array([0, 0, 0, 3, 0x65, 1, 2, 0, 0, 0, 3, 0x06, 9]))).toBe(false);
    expect(isAvcPacket(new Uint8Array([0x21, 0x10, 0x05, 0x40, 0x9a]))).toBe(false);
    expect(avcLengthSize(new Uint8Array([1, 0x64, 0, 0x1f, 0xff]))).toBe(4);
  });
});

describe("recovering a cut-off MP4", () => {
  it("finds every packet that reached the disk, byte for byte, and rebuilds a playable file", async () => {
    const { bytes, journal, configs, sent } = await cutOff(
      "sample.mp4",
      new Mp4OutputFormat({ fastStart: false }),
      0.7,
    );
    const reader = blobReader(new Blob([bytes]), 4096);
    const data = await mdatStart(reader);
    expect(data).toBeDefined();
    if (!data) return;
    const lengthSize = avcLengthSize(configs.video?.description as Uint8Array | undefined);
    const found = await findPackets(reader, data, journal, lengthSize);
    // Most of what was sent made it (the last 64 KiB chunk was still being filled).
    expect(found.length).toBeGreaterThan(sent.length * 0.5);
    expect(found.length).toBeLessThanOrEqual(sent.length);
    const byTrack = {
      video: sent.filter((s) => s.l.track === "video"),
      audio: sent.filter((s) => s.l.track === "audio"),
    };
    const seen = { video: 0, audio: 0 };
    for (const f of found) {
      const original = byTrack[f.track][seen[f.track]++]?.p;
      expect(original).toBeDefined();
      const got = bytes.subarray(f.offset, f.offset + f.size);
      expect(Buffer.from(got).equals(Buffer.from(original?.data ?? []))).toBe(true);
    }
    expect(seen.video).toBeGreaterThan(0);
    expect(seen.audio).toBeGreaterThan(0);

    // The packets, indexed again, make a file that opens with the expected length.
    const target = new BufferTarget();
    const out = new Output({ format: new Mp4OutputFormat(), target });
    const vs = new EncodedVideoPacketSource("avc");
    const as = new EncodedAudioPacketSource("aac");
    out.addVideoTrack(vs, { frameRate: 30 });
    out.addAudioTrack(as);
    await out.start();
    let fv = true;
    let fa = true;
    for (const f of found) {
      const p = new EncodedPacket(
        bytes.slice(f.offset, f.offset + f.size),
        f.key ? "key" : "delta",
        f.timestamp,
        f.duration,
      );
      if (f.track === "video") {
        await vs.add(p, fv ? { decoderConfig: configs.video as VideoDecoderConfig } : undefined);
        fv = false;
      } else {
        await as.add(p, fa ? { decoderConfig: configs.audio as AudioDecoderConfig } : undefined);
        fa = false;
      }
    }
    await out.finalize();
    const back = new Input({
      source: new BufferSource(target.buffer as ArrayBuffer),
      formats: ALL_FORMATS,
    });
    const lastVideo = found.filter((f) => f.track === "video").at(-1);
    const duration = await back.computeDuration();
    expect(duration).toBeGreaterThan((lastVideo?.timestamp ?? 0) - 0.1);
    const [bv] = await back.getVideoTracks();
    let n = 0;
    if (bv) for await (const _ of new EncodedPacketSink(bv).packets()) n++;
    expect(n).toBe(seen.video);
    back.dispose();
  });

  it("steps over an indexed picture packet that never reached the file", async () => {
    const { bytes, journal, configs } = await cutOff(
      "sample.mp4",
      new Mp4OutputFormat({ fastStart: false }),
      0.7,
    );
    const reader = blobReader(new Blob([bytes]), 4096);
    const data = await mdatStart(reader);
    if (!data) throw new Error("no mdat");
    const lengthSize = avcLengthSize(configs.video?.description as Uint8Array | undefined);
    const clean = await findPackets(reader, data, journal, lengthSize);
    // A phantom entry before the fifth picture packet: the walk must still find every real one.
    const fifth = journal.findIndex(
      (e, i) =>
        e.track === "video" && journal.slice(0, i).filter((x) => x.track === "video").length === 4,
    );
    const at = journal[fifth];
    if (!at) throw new Error("no fifth picture packet");
    const phantom = [...journal.slice(0, fifth), { ...at, size: 777 }, ...journal.slice(fifth)];
    const found = await findPackets(reader, data, phantom, lengthSize);
    expect(found.map((f) => f.offset)).toEqual(clean.map((f) => f.offset));
  });

  it("stops where one track's index ends rather than taking the other track's bytes", async () => {
    const { bytes, journal, configs } = await cutOff(
      "sample.mp4",
      new Mp4OutputFormat({ fastStart: false }),
      0.9,
    );
    const reader = blobReader(new Blob([bytes]), 4096);
    const data = await mdatStart(reader);
    if (!data) throw new Error("no mdat");
    const lengthSize = avcLengthSize(configs.video?.description as Uint8Array | undefined);
    // The sound's index stops halfway (its last entries never written); the picture's runs on.
    const audio = journal.filter((e) => e.track === "audio");
    const cutAt = audio[Math.floor(audio.length / 2)];
    const shortSound = journal.filter(
      (e) => e.track === "video" || e.timestamp < (cutAt?.timestamp ?? 0),
    );
    const found = await findPackets(reader, data, shortSound, lengthSize);
    for (const f of found.filter((x) => x.track === "video"))
      expect(isAvcPacket(bytes.subarray(f.offset, f.offset + f.size), lengthSize)).toBe(true);
    // And the other way round: the picture's index stops halfway.
    const video = journal.filter((e) => e.track === "video");
    const vCut = video[Math.floor(video.length / 2)];
    const shortPicture = journal.filter(
      (e) => e.track === "audio" || e.timestamp < (vCut?.timestamp ?? 0),
    );
    const found2 = await findPackets(reader, data, shortPicture, lengthSize);
    const sentAudio = journal.filter((e) => e.track === "audio");
    const clean = await findPackets(reader, data, journal, lengthSize);
    const cleanAudio = clean.filter((x) => x.track === "audio").map((x) => x.offset);
    for (const f of found2.filter((x) => x.track === "audio"))
      expect(cleanAudio).toContain(f.offset);
    expect(sentAudio.length).toBeGreaterThan(0);
  });

  it("finds an audio-only M4A's packets in order", async () => {
    const { bytes, journal, sent } = await cutOff(
      "sample.mp4",
      new Mp4OutputFormat({ fastStart: false }),
      0.8,
      {
        audioOnly: true,
      },
    );
    const reader = blobReader(new Blob([bytes]));
    const data = await mdatStart(reader);
    if (!data) throw new Error("no mdat");
    const found = await findPackets(reader, data, journal);
    expect(found.length).toBeGreaterThan(sent.length * 0.5);
    found.forEach((f, i) => {
      expect(
        Buffer.from(bytes.subarray(f.offset, f.offset + f.size)).equals(
          Buffer.from(sent[i]?.p.data ?? []),
        ),
      ).toBe(true);
    });
  });
});

describe("recovering a cut-off WebM", () => {
  it("patches the sizes so the written clusters read back", async () => {
    const { bytes, sent } = await cutOff("sample.webm", new WebMOutputFormat(), 0.7);
    const blob = new Blob([bytes]);
    // As written, the segment claims only its header: nothing after it is read.
    const repair = await webmPatches(blobReader(blob, 64));
    expect(repair?.patches.length).toBe(2);
    const fixed = new Uint8Array(bytes);
    for (const p of repair?.patches ?? []) fixed.set(p.bytes, p.at);
    const cut = fixed.slice(0, repair?.end);
    const input = new Input({ source: new BlobSource(new Blob([cut])), formats: ALL_FORMATS });
    const [v] = await input.getVideoTracks();
    expect(v).toBeDefined();
    let n = 0;
    if (v) for await (const _ of new EncodedPacketSink(v).packets()) n++;
    const sentVideo = sent.filter((s) => s.l.track === "video").length;
    expect(n).toBeGreaterThan(sentVideo * 0.4);
    expect(n).toBeLessThanOrEqual(sentVideo);
    input.dispose();
  });
});

describe("recovering a cut-off Ogg Opus", () => {
  it("ends at the last whole page, which reads back", async () => {
    const { bytes } = await cutOff("sample.webm", new OggOutputFormat(), 0.6, { audioOnly: true });
    const end = oggWholeLength(bytes);
    expect(end).toBeGreaterThan(0);
    expect(end).toBeLessThanOrEqual(bytes.length);
    // A page cut in half is left out.
    expect(oggWholeLength(bytes.subarray(0, end - 3))).toBeLessThan(end);
    const input = new Input({
      source: new BufferSource(bytes.slice(0, end).buffer),
      formats: ALL_FORMATS,
    });
    expect(await input.computeDuration()).toBeGreaterThan(0.5);
    input.dispose();
  });
});

describe("recovering a cut-off WAV", () => {
  it("writes the sizes from the bytes on disk, whole sample frames only", async () => {
    const wav = new Uint8Array(readFileSync("tests/fixtures/sample-48k-mono.wav"));
    const cut = wav.slice(0, 44 + 48_000 * 2 + 1); // one second and an odd byte
    // The placeholders a recording has before Stop.
    new DataView(cut.buffer).setUint32(4, 0, true);
    const head = cut.slice(0, 4096);
    const fixed = fixWavHeader(head, cut.length);
    expect(fixed).toBeDefined();
    if (!fixed) return;
    expect(fixed.dataLength % 2).toBe(0);
    const whole = new Uint8Array(fixed.dataStart + fixed.dataLength);
    whole.set(fixed.header);
    whole.set(cut.subarray(fixed.dataStart, fixed.dataStart + fixed.dataLength), fixed.dataStart);
    const input = new Input({ source: new BufferSource(whole.buffer), formats: ALL_FORMATS });
    const d = await input.computeDuration();
    expect(Math.abs(d - fixed.dataLength / 2 / 48_000)).toBeLessThan(0.001);
    input.dispose();
  });
});
