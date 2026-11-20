/**
 * Recovering a recording cut off by a closed, crashed or reloaded tab (ADR-0130). The recorder writes
 * in place as it goes (./sink); what is on disk is finished here into a playable file:
 *
 * - MP4 and M4A: the packets are found in the media data with the index written beside it
 *   (./journal) and written again into a new MP4 with its index; the AAC priming is signalled as at
 *   Stop.
 * - WebM: the Segment and last cluster sizes are set to "unknown" and the packets are copied into a
 *   new WebM with its duration and cues; if the copy fails, the patched file itself (it plays).
 * - WAV: the RIFF and data sizes are written from the bytes on disk.
 * - Ogg Opus: cut after the last whole page, with the measured pre-skip.
 *
 * Runs on the page, after the user presses Recover. No network access
 * (README.md#privacy-and-processing §2).
 */
import {
  ALL_FORMATS,
  BlobSource,
  EncodedAudioPacketSource,
  EncodedPacket,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Input,
  Mp4OutputFormat,
  Output,
  WebMOutputFormat,
} from "mediabunny";
import { StorageWorker } from "@/lib/storage/opfs";
import type { Interrupted } from "./find";
import {
  avcLengthSize,
  blobReader,
  decodeEntries,
  findPackets,
  fixWavHeader,
  fromBase64,
  mdatStart,
  oggWholeLength,
  type RecordingMeta,
  webmPatches,
} from "./journal";
import { recordingName } from "./plan";
import { CaptureError, type Recording, readBack, signalEncoderDelay } from "./recorder";
import { adoptRecording, openCaptureSink, RECORDINGS_DIR, recordingsRoot } from "./sink";

async function markFinished(it: Interrupted): Promise<void> {
  const w = new StorageWorker();
  try {
    await w.request({
      op: "text",
      dir: [RECORDINGS_DIR, it.session],
      name: `${it.name}.json`,
      text: JSON.stringify({ ...it.meta, finished: true } satisfies RecordingMeta),
    });
  } catch {
    // The directory is held by this page and cleared with it.
  } finally {
    w.terminate();
  }
}

/** MP4 and M4A: every packet the index and the media data agree on, into a new file with its index. */
async function rebuildMp4(
  media: File,
  index: ArrayBuffer,
  meta: RecordingMeta,
  onProgress?: (r: number) => void,
) {
  const entries = decodeEntries(index);
  const reader = blobReader(media);
  const data = await mdatStart(reader);
  if (!data || entries.length === 0)
    throw new CaptureError("Nothing of this recording could be read back.");
  const vConfig = meta.video?.config;
  const aConfig = meta.audio?.config;
  const vDescription = vConfig?.description ? fromBase64(vConfig.description) : undefined;
  const packets = await findPackets(reader, data, entries, avcLengthSize(vDescription));
  const hasVideo = !!vConfig && packets.some((p) => p.track === "video");
  const hasAudio = !!aConfig && packets.some((p) => p.track === "audio");
  if (!hasVideo && !hasAudio)
    throw new CaptureError("Nothing of this recording could be read back.");
  const sink = await openCaptureSink();
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: false }),
    target: sink.target,
  });
  const video = hasVideo ? new EncodedVideoPacketSource("avc") : undefined;
  const audio = hasAudio
    ? new EncodedAudioPacketSource(meta.audio?.codec === "opus" ? "opus" : "aac")
    : undefined;
  if (video) output.addVideoTrack(video, { frameRate: meta.fps });
  if (audio) output.addAudioTrack(audio);
  try {
    await output.start();
    let firstV = true;
    let firstA = true;
    let firstVideoKey = false;
    for (const [i, p] of packets.entries()) {
      const bytes = (await reader.read(p.offset, p.size)).slice();
      const packet = new EncodedPacket(bytes, p.key ? "key" : "delta", p.timestamp, p.duration);
      if (p.track === "video" && video && vConfig) {
        // A video track must start on a key frame (the first packet always is one).
        if (!firstVideoKey && !p.key) continue;
        firstVideoKey = true;
        await video.add(
          packet,
          firstV
            ? {
                decoderConfig: {
                  codec: vConfig.codec,
                  codedWidth: vConfig.codedWidth,
                  codedHeight: vConfig.codedHeight,
                  description: vDescription,
                },
              }
            : undefined,
        );
        firstV = false;
      } else if (p.track === "audio" && audio && aConfig) {
        await audio.add(
          packet,
          firstA
            ? {
                decoderConfig: {
                  codec: aConfig.codec,
                  sampleRate: aConfig.sampleRate,
                  numberOfChannels: aConfig.numberOfChannels,
                  description: aConfig.description ? fromBase64(aConfig.description) : undefined,
                },
              }
            : undefined,
        );
        firstA = false;
      }
      if (i % 200 === 0) onProgress?.(i / packets.length);
    }
    await output.finalize();
  } catch (e) {
    await output.cancel().catch(() => undefined);
    await sink.discard();
    throw e;
  }
  return sink.finish(meta.mime);
}

/** WebM: sizes patched, then copied packet for packet into a new file (duration and cues written). */
async function rebuildWebm(media: File, meta: RecordingMeta): Promise<Blob> {
  const repair = await webmPatches(blobReader(media, 64));
  if (!repair) throw new CaptureError("This recording's header could not be read.");
  const parts: BlobPart[] = [];
  let at = 0;
  for (const p of [...repair.patches].sort((a, b) => a.at - b.at)) {
    parts.push(media.slice(at, p.at), p.bytes as Uint8Array<ArrayBuffer>);
    at = p.at + p.bytes.length;
  }
  parts.push(media.slice(at, repair.end));
  const patched = new Blob(parts, { type: meta.mime });
  try {
    return await copyPackets(patched, meta);
  } catch {
    // The patched file plays as it is, without a duration in its header.
    return patched;
  }
}

async function copyPackets(blob: Blob, meta: RecordingMeta): Promise<Blob> {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  const sink = await openCaptureSink();
  const output = new Output({ format: new WebMOutputFormat(), target: sink.target });
  try {
    const [v] = await input.getVideoTracks();
    const [a] = await input.getAudioTracks();
    const lanes: {
      next: () => Promise<EncodedPacket | null>;
      add: (p: EncodedPacket) => Promise<void>;
      head: EncodedPacket | null;
    }[] = [];
    if (v?.codec) {
      const src = new EncodedVideoPacketSource(v.codec);
      output.addVideoTrack(src, { frameRate: meta.fps });
      const config = await v.getDecoderConfig();
      const it = new EncodedPacketSink(v).packets();
      let first = true;
      lanes.push({
        next: async () => (await it.next()).value ?? null,
        add: async (p) => {
          await src.add(p, first && config ? { decoderConfig: config } : undefined);
          first = false;
        },
        head: null,
      });
    }
    if (a?.codec) {
      const src = new EncodedAudioPacketSource(a.codec);
      output.addAudioTrack(src);
      const config = await a.getDecoderConfig();
      const it = new EncodedPacketSink(a).packets();
      let first = true;
      lanes.push({
        next: async () => (await it.next()).value ?? null,
        add: async (p) => {
          await src.add(p, first && config ? { decoderConfig: config } : undefined);
          first = false;
        },
        head: null,
      });
    }
    if (lanes.length === 0) throw new CaptureError("This recording has no tracks to recover.");
    await output.start();
    for (const l of lanes) l.head = await l.next();
    // In time order across the tracks, so the muxer never holds one track waiting for the other.
    for (;;) {
      const live = lanes.filter((l) => l.head);
      if (live.length === 0) break;
      const l = live.reduce((x, y) =>
        (x.head?.timestamp ?? 0) <= (y.head?.timestamp ?? 0) ? x : y,
      );
      const p = l.head;
      if (!p) break;
      await l.add(p);
      l.head = await l.next().catch(() => null);
    }
    await output.finalize();
    return await sink.finish(meta.mime);
  } catch (e) {
    await output.cancel().catch(() => undefined);
    await sink.discard();
    throw e;
  } finally {
    input.dispose();
  }
}

/** Finishes an interrupted recording into a playable file and removes what it was made from. */
export async function recoverInterrupted(
  it: Interrupted,
  onProgress?: (ratio: number) => void,
): Promise<Recording> {
  if (!(await adoptRecording(it.session)))
    throw new CaptureError(
      "This recording is open in another tab.",
      "Recover it there, or close that tab.",
    );
  const root = await recordingsRoot();
  const dir = await root?.getDirectoryHandle(it.session).catch(() => undefined);
  if (!dir) throw new CaptureError("This recording is no longer stored.");
  const media = await (await dir.getFileHandle(it.name)).getFile();
  const { meta } = it;
  const ext = meta.extension;
  let blob: Blob;
  let rebuilt = false;
  if (ext === "mp4" || ext === "m4a") {
    const index = await (await dir.getFileHandle(`${it.name}.index`))
      .getFile()
      .then((f) => f.arrayBuffer());
    blob = await rebuildMp4(media, index, meta, onProgress);
    rebuilt = true;
  } else if (ext === "webm") {
    blob = await rebuildWebm(media, meta);
    rebuilt = true;
  } else if (ext === "wav") {
    const head = new Uint8Array(await media.slice(0, 4096).arrayBuffer());
    const fixed = fixWavHeader(head, media.size);
    if (!fixed || fixed.dataLength === 0)
      throw new CaptureError("Nothing of this recording could be read back.");
    blob = new Blob(
      [
        fixed.header as Uint8Array<ArrayBuffer>,
        media.slice(fixed.dataStart, fixed.dataStart + fixed.dataLength),
      ],
      { type: meta.mime },
    );
  } else if (ext === "opus" || ext === "ogg") {
    const bytes = new Uint8Array(await media.arrayBuffer());
    const end = oggWholeLength(bytes);
    if (end === 0) throw new CaptureError("Nothing of this recording could be read back.");
    blob = new Blob([bytes.subarray(0, end)], { type: meta.mime });
  } else throw new CaptureError("This kind of recording cannot be recovered.");
  blob = await signalEncoderDelay(blob, ext, meta.audio?.codec);
  onProgress?.(1);
  await markFinished(it);
  // A rebuilt file no longer needs what it was made from.
  if (rebuilt)
    for (const n of [it.name, `${it.name}.index`]) await dir.removeEntry(n).catch(() => undefined);
  const filename = recordingName(meta.kind, new Date(meta.started), ext);
  const file = new File([blob], filename, { type: meta.mime });
  const info = await readBack(file, {
    video: meta.video?.codec,
    audio: meta.audio?.codec,
    channels: meta.audio?.channels ?? 1,
    sampleRate: meta.audio?.sampleRate ?? 48_000,
    fallbackSeconds: it.seconds,
  });
  const line = [
    info.video && meta.fps ? `${meta.fps} fps` : undefined,
    !info.video && meta.audio?.bitrate
      ? `${Math.round(meta.audio.bitrate / 1000)} kb/s`
      : undefined,
    "recovered",
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    file,
    info,
    meta: line,
    ffmpegCommand:
      ext === "mp4" || ext === "m4a" ? "" : `ffmpeg -i ${filename} -c copy recovered-${filename}`,
  };
}
