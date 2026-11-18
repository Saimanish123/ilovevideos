/**
 * Audio delay / sync fix (E6): moves every sound track of a video earlier or later against the
 * picture without decoding anything. Picture and sound packets are copied byte for byte; only the
 * sound's timestamps change. The equivalent of ffmpeg's `-itsoffset` with `-c copy`.
 *
 * How exact it is depends on the container:
 * - MP4 and MOV: exact to the sample. The first kept sound packet is written where it belongs and an
 *   edit list (../mediabunny/edit-list) tells players where the sound really starts, the way the
 *   source's own AAC priming is signalled (ADR-0018, ADR-0021). Moving the sound earlier keeps one
 *   packet before the cut as decoder pre-roll, skipped by the same edit.
 * - Matroska and WebM: to the nearest sound frame (about 21 ms for AAC at 48 kHz, 20 ms for Opus),
 *   because mediabunny cannot write a codec delay there; packets whose middle falls before the start
 *   are dropped. The page says so.
 * Sound past the end of the picture is cut so the video keeps its length; moving the sound earlier
 * leaves that much silence at the end. Runs in the engine worker (and in Node for the tests).
 * No network access (README.md#privacy-and-processing §2).
 */

import {
  EncodedAudioPacketSource,
  type EncodedPacket,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  type InputAudioTrack,
  Output,
} from "mediabunny";
import { containerFromFormatName } from "@/content/formats/containers";
import { baseName, formatDuration } from "@/lib/format";
import { classifyError, EngineError } from "../errors";
import { sourceDelay } from "../mediabunny/matroska-timing";
import { editOutputSound, openOutputStore } from "../mediabunny/output-store";
import { containers, openInput } from "../mediabunny/shared";
import type { Engine } from "../types";
import {
  AudioSyncOptions,
  exactShift,
  type SyncContainer,
  shiftWords,
  syncCommand,
} from "./options";

export { AudioSyncOptions };

const EPS = 1e-6;

/** The container a shift writes for this file: its own when it is one of the four, else MP4. */
export function syncContainer(
  containerName: string,
  fileName: string,
  videoCodec?: string,
): SyncContainer {
  const id = containerFromFormatName(containerName, fileName)?.id;
  if (id === "mp4" || id === "mov" || id === "mkv" || id === "webm") return id;
  return videoCodec === "vp8" || videoCodec === "vp9" ? "mkv" : "mp4";
}

export const audioSyncEngine: Engine<AudioSyncOptions> = {
  id: "audio-sync",
  backends: ["webcodecs"],
  optionsSchema: AudioSyncOptions,
  // A packet copy needs no codec support at all: any file mediabunny can read and write works.
  async supports(backend, input) {
    return backend === "webcodecs" && !!input.info?.video && !!input.info.audio?.length;
  },
  async run(_backend, inputs, o, ctx) {
    const src = inputs[0];
    if (!src) throw new EngineError("internal", "No input file.");
    const { file } = src;
    const check = () => {
      if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
    };
    check();
    ctx.onProgress({ phase: "analyzing", ratio: 0, detail: "Reading the file" });
    const input = openInput(file);
    try {
      const video = await input.getPrimaryVideoTrack();
      const audios = await input.getAudioTracks();
      if (!video?.codec)
        throw new EngineError(
          "unsupported-input",
          "This file has no picture to line the sound up with.",
        );
      if (audios.length === 0)
        throw new EngineError("unsupported-input", "This video has no sound track to move.");
      const to = syncContainer((await input.getFormat()).name, file.name, video.codec);
      const format = containers[to].format();
      const supported = format.getSupportedCodecs() as string[];
      if (!supported.includes(video.codec))
        throw new EngineError(
          "unsupported-output",
          `The ${to.toUpperCase()} container cannot hold this picture as it is.`,
          "Convert the video to MP4 first.",
        );
      const kept = audios.filter((a) => !!a.codec && supported.includes(a.codec));
      if (kept.length === 0)
        throw new EngineError(
          "unsupported-output",
          `The ${to.toUpperCase()} container cannot hold this sound as it is.`,
          "Convert the video to MP4 first.",
        );
      const iso = exactShift(to);
      const d = o.offsetMs / 1000;
      const vSink = new EncodedPacketSink(video);
      const vFirst = await vSink.getFirstPacket({ metadataOnly: true });
      const vLast = await vSink.getPacket(Number.POSITIVE_INFINITY, { metadataOnly: true });
      // The picture keeps its timeline; one that starts before zero moves everything up with it.
      const zero = Math.min(0, vFirst?.timestamp ?? 0);
      const videoEnd = (vLast ? vLast.timestamp + vLast.duration : 0) - zero;

      // A copy as large as the file; large ones stream to disk (../mediabunny/output-store).
      const store = await openOutputStore(file.size);
      const output = new Output({
        format: containers[to].format({ streamed: store.streamed }),
        target: store.target,
      });
      try {
        output.setMetadataTags(await input.getMetadataTags());
      } catch {
        // Tags are a convenience; the shift does not depend on them.
      }
      const meta = async (t: typeof video | InputAudioTrack) => ({
        languageCode:
          /^[a-z]{3}$/.test(t.languageCode) && t.languageCode !== "und"
            ? t.languageCode
            : undefined,
        name: (await t.getName()) ?? undefined,
        disposition: await t.getDisposition(),
      });
      const videoSource = new EncodedVideoPacketSource(video.codec);
      output.addVideoTrack(videoSource, { rotation: video.rotation, ...(await meta(video)) });

      interface Plan {
        track: InputAudioTrack;
        /** Seconds the source's packet times run late (Matroska CodecDelay: AAC priming). */
        delay: number;
        source: EncodedAudioPacketSource;
        from: EncodedPacket;
        /** Output time = packet time + shift. */
        shift: number;
        /** Edit-list skip at the start of the written sound, seconds (MP4/MOV only). */
        skip: number;
      }
      const plans: Plan[] = [];
      for (const a of kept) {
        const sink = new EncodedPacketSink(a);
        const first = await sink.getFirstPacket();
        if (!first || !a.codec) continue;
        // An MKV's AAC priming sits behind a CodecDelay mediabunny does not read: its packet times
        // are that much late (before: a 200 ms shift moved the sound 170.7 ms, priming played).
        const delay = await sourceDelay(a);
        let from = first;
        if (d < 0) {
          // The sound that now starts the video is at source time −d: start one packet before the
          // one holding it (decoder pre-roll, skipped by the edit) or, without edit lists, on the
          // packet holding it.
          const holding = (await sink.getPacket(-d + delay)) ?? first;
          from = iso ? ((await sink.getPacket(holding.timestamp - EPS)) ?? holding) : holding;
        }
        const t0 = from.timestamp - delay;
        let shift: number;
        let skip = 0;
        if (iso) {
          // Write the first kept packet at `lead` and skip `skip` of it, so source time s plays at
          // s + d: lead − skip = t0 + d. AAC priming before zero is skipped the same way.
          skip = Math.max(0, -t0 - Math.min(d, 0));
          const lead = t0 + d + skip;
          shift = lead - t0;
        } else {
          shift = d;
        }
        const source = new EncodedAudioPacketSource(a.codec);
        output.addAudioTrack(source, await meta(a));
        plans.push({ track: a, delay, source, from, shift: shift - zero, skip });
      }

      const total = Math.max(EPS, videoEnd);
      const pumps: Promise<void>[] = [];
      pumps.push(
        (async () => {
          const config = await video.getDecoderConfig();
          let sent = false;
          for await (const p of vSink.packets()) {
            check();
            await videoSource.add(
              p.clone({ timestamp: p.timestamp - zero }),
              sent ? undefined : { decoderConfig: config ?? undefined },
            );
            sent = true;
            ctx.onProgress({
              phase: "processing",
              ratio: Math.min(1, (p.timestamp - zero) / total),
              detail: `${formatDuration(Math.max(0, p.timestamp - zero))} of ${formatDuration(total)} copied`,
            });
          }
        })(),
      );
      for (const plan of plans) {
        pumps.push(
          (async () => {
            const config = await plan.track.getDecoderConfig();
            let sent = false;
            for await (const p of new EncodedPacketSink(plan.track).packets(plan.from)) {
              check();
              const ts = p.timestamp - plan.delay + plan.shift;
              // Sound past the picture's end is cut (the edit list ends it exactly in MP4/MOV).
              if (ts >= videoEnd + (iso ? plan.skip : 0) - EPS) break;
              // Without an edit list, a packet whose middle is before zero is dropped, and so is
              // priming (before the source's own zero), which is not sound.
              if (
                !iso &&
                (ts + p.duration / 2 < 0 || p.timestamp - plan.delay + p.duration / 2 < 0)
              )
                continue;
              await plan.source.add(
                p.clone({ timestamp: Math.max(0, ts) }),
                sent ? undefined : { decoderConfig: config ?? undefined },
              );
              sent = true;
            }
          })(),
        );
      }
      try {
        await output.start();
        await Promise.all(pumps);
        ctx.onProgress({ phase: "finishing", ratio: 1, detail: "Writing the file" });
        await output.finalize();
      } catch (e) {
        await output.cancel().catch(() => undefined);
        await store.discard();
        throw e;
      }
      const data = await store.finish();
      let parts: BlobPart[] = [data];
      if (iso)
        parts =
          (await editOutputSound(data, (written) =>
            plans.flatMap((p, i) => {
              const t = written[i];
              return t && p.skip > EPS
                ? [{ trackId: t.id, primingSec: p.skip, endSec: videoEnd }]
                : [];
            }),
          )) ?? parts;
      const outputName = `${baseName(file.name) || "video"}-synced.${to}`;
      const direction = o.offsetMs < 0 ? "earlier" : "later";
      const left = audios.length - kept.length;
      return {
        blob: new Blob(parts, { type: containers[to].mime }),
        filename: outputName,
        ffmpegCommand: syncCommand(file.name, outputName, o.offsetMs),
        meta: [
          `Sound ${shiftWords(o.offsetMs)} ${direction}`,
          iso ? "exact to the sample" : "to the nearest sound frame",
          "picture and sound copied, nothing re-encoded",
          kept.length > 1 ? `${kept.length} sound tracks moved` : "",
          left > 0
            ? `${left} sound ${left === 1 ? "track" : "tracks"} ${to.toUpperCase()} cannot hold left out`
            : "",
        ]
          .filter(Boolean)
          .join(" · "),
      };
    } catch (e) {
      if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
      throw classifyError(e);
    } finally {
      input.dispose();
    }
  },
};
