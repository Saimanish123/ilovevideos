/**
 * Add or replace audio in a video (E3). Two inputs, in either order: a video and a sound (an audio
 * file, or a second video whose sound is used). The picture is always copied packet for packet,
 * never re-encoded. The sound is placed on the video's timeline (start offset, skip into the
 * audio, loop to fill, fade out where the video cuts it, volume), either replacing the original
 * sound or mixed over it, and encoded once to AAC (Opus for WebM). When nothing about the new
 * audio changes and the container holds its codec, it is copied too, and the whole job is lossless.
 * Runs in the engine worker via mediabunny/WebCodecs; no network access.
 */
import {
  AudioSample,
  AudioSampleSource,
  canEncodeAudio,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  type InputAudioTrack,
  type InputVideoTrack,
  Output,
  Quality,
} from "mediabunny";
import { z } from "zod";
import { baseName, formatDuration, shellQuote, withUnit } from "@/lib/format";
import { codecName } from "../convert-video/plan";
import { classifyError, EngineError } from "../errors";
import { addOpusTail, bytesOf, readOpusHead } from "../mediabunny/opus-delay";
import {
  editOutputSound,
  openOutputStore,
  rewriteOutputMatroska,
} from "../mediabunny/output-store";
import { addAacLead, withEncoderDelaySignalled } from "../mediabunny/priming";
import { type ContainerId, containers, openInput } from "../mediabunny/shared";
import { soundSpan } from "../mediabunny/sound-span";
import type { Engine, MediaInput } from "../types";
import {
  audioUnchanged,
  balanceGains,
  gainAt,
  outputContainer,
  pickRoles,
  placement,
  round2,
  softClip,
} from "./math";
import { PcmReader } from "./pcm-reader";

export const AddAudioOptions = z.object({
  mode: z.enum(["replace", "mix"]).default("replace"),
  /** Seconds into the video where the new audio starts. */
  offset: z.number().min(0).default(0),
  /** Seconds cut from the start of the new audio. */
  skip: z.number().min(0).default(0),
  loop: z.boolean().default(false),
  /** Seconds of fade-out where the video's end cuts the new audio; 0 is off. */
  fadeOut: z.number().min(0).max(10).default(2),
  /** Gain of the new audio when it is the only sound (replace, or a video without sound); 1 = as recorded. */
  volume: z.number().min(0).max(2).default(1),
  /** Mix mode with a video that has sound: which of the two is in front (`balanceGains`). */
  balance: z.enum(["new", "even", "original"]).default("even"),
});
export type AddAudioOptions = z.infer<typeof AddAudioOptions>;

const AUDIO_KBPS = 192;
const BLOCK = 4096;

type OutCodec = "aac" | "opus";

export interface AddAudioPlan {
  container: ContainerId;
  /** True when the new audio's packets are copied as they are. */
  copyAudio: boolean;
  /** Audio codec written (the source codec when copying). */
  codec: string;
}

async function pickCodec(container: ContainerId, channels: number, rate: number) {
  const order: OutCodec[] = container === "webm" ? ["opus"] : ["aac", "opus"];
  const supported = containers[container].format().getSupportedCodecs() as string[];
  for (const codec of order) {
    if (!supported.includes(codec)) continue;
    const sampleRate = codec === "opus" ? 48_000 : rate;
    if (await canEncodeAudio(codec, { numberOfChannels: channels, sampleRate }))
      return { codec, sampleRate };
  }
  return undefined;
}

const noSound = (name: string) =>
  new EngineError(
    "unsupported-input",
    `${name} has no sound to add.`,
    "Choose an audio file, or a video that has sound.",
  );

/** The command a user would type for the same result, shown on the result card. */
export function addAudioCommand(
  videoName: string,
  audioName: string,
  outName: string,
  o: AddAudioOptions,
  p: ReturnType<typeof placement>,
  plan: AddAudioPlan,
  hasOriginal: boolean,
): string {
  const vid = shellQuote(videoName);
  const aud = shellQuote(audioName);
  const out = shellQuote(outName);
  if (plan.copyAudio)
    return `ffmpeg -i ${vid} -i ${aud} -map 0:v:0 -map 1:a:0 -c copy -shortest ${out}`;
  const mixing = o.mode === "mix" && hasOriginal;
  const gains = mixing ? balanceGains[o.balance] : { added: o.volume, original: 0 };
  const chain = [
    o.skip > 0 ? `atrim=start=${round2(o.skip)},asetpts=PTS-STARTPTS` : "",
    o.offset > 0 ? `adelay=${Math.round(o.offset * 1000)}:all=1` : "",
    Math.abs(gains.added - 1) > 1e-6 ? `volume=${round2(gains.added)}` : "",
    p.fade > 0 ? `afade=t=out:st=${round2(p.end - p.fade)}:d=${round2(p.fade)}` : "",
  ].filter(Boolean);
  const newChain = `[1:a]${chain.length ? chain.join(",") : "anull"}[n]`;
  const mix = mixing
    ? `;[0:a]volume=${round2(gains.original)}[o];[o][n]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.9[a]`
    : "";
  const outLabel = mix ? "[a]" : "[n]";
  const enc = plan.codec === "opus" ? "libopus" : "aac";
  return `ffmpeg -i ${vid}${o.loop ? " -stream_loop -1" : ""} -i ${aud} -filter_complex "${newChain}${mix}" -map 0:v:0 -map "${outLabel}" -c:v copy -c:a ${enc} -b:a ${AUDIO_KBPS}k -t ${round2(p.end > 0 ? Math.max(p.end, 0) : 0)} ${out}`;
}

/** First and last presentation time of a track's packets (the video's real span). */
async function trackSpan(track: InputVideoTrack | InputAudioTrack) {
  const sink = new EncodedPacketSink(track);
  const first = await sink.getFirstPacket({ metadataOnly: true });
  const last = await sink.getPacket(Number.POSITIVE_INFINITY, { metadataOnly: true });
  if (!first || !last) return undefined;
  return { start: first.timestamp, end: last.timestamp + last.duration };
}

export const addAudioEngine: Engine<AddAudioOptions> = {
  id: "add-audio",
  backends: ["webcodecs"],
  optionsSchema: AddAudioOptions,
  async supports(backend, _input, options, inputs) {
    if (backend !== "webcodecs" || !inputs || inputs.length < 2) return false;
    const { video } = pickRoles(
      inputs.filter((i): i is MediaInput & { info: NonNullable<MediaInput["info"]> } => !!i.info),
    );
    if (!video) return false;
    // An unchanged copy needs no encoder; anything else needs AAC or Opus at stereo 48 kHz.
    if (audioUnchanged(options, true)) return true;
    return (await pickCodec(outputContainer(video), 2, 48_000)) !== undefined;
  },
  async run(_backend, inputs, o, ctx) {
    const withInfo = inputs.filter(
      (i): i is MediaInput & { info: NonNullable<MediaInput["info"]> } => !!i.info,
    );
    const roles = pickRoles(withInfo);
    if (!roles.video)
      throw new EngineError(
        "unsupported-input",
        "Neither file has a picture, so there is no video to add the audio to.",
        "Add a video file.",
      );
    if (!roles.audio)
      throw new EngineError("unsupported-input", "Add the audio file to put on the video.");
    const videoIn = roles.video;
    const audioIn = roles.audio;
    const check = () => {
      if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
    };
    ctx.onProgress({ phase: "analyzing", ratio: 0, detail: "Reading both files" });

    const vInput = openInput(videoIn.file);
    const aInput = audioIn.file === videoIn.file ? vInput : openInput(audioIn.file);
    const vTrack = await vInput.getPrimaryVideoTrack();
    if (!vTrack) throw new EngineError("unsupported-input", "The video has no picture track.");
    const origTrack = o.mode === "mix" ? await vInput.getPrimaryAudioTrack() : null;
    const newTrack = await aInput.getPrimaryAudioTrack();
    if (!newTrack) throw noSound(audioIn.file.name);
    const vSpan = await trackSpan(vTrack);
    if (!vSpan) throw new EngineError("unsupported-input", "The video has no frames to copy.");
    const videoDuration = vSpan.end - vSpan.start;
    const aSpan = await trackSpan(newTrack);
    // Where the sound really is (../mediabunny/sound-span): AAC priming before zero, an MP3's LAME
    // delay and padding (before: each loop of a 2.000 s MP3 took 2.0376 s and the sound came 25 ms
    // late), a Matroska CodecDelay.
    const sound = await soundSpan(audioIn.file, aInput, newTrack);
    const audioOrigin = Math.max(0, aSpan?.start ?? 0, sound.start);
    const audioEnd = Math.min(aSpan?.end ?? 0, sound.end);
    const audioDuration = aSpan ? audioEnd - audioOrigin : 0;
    if (!(audioDuration > 0)) throw noSound(audioIn.file.name);
    const place = placement(videoDuration, audioDuration, o);
    if (place.end - place.start <= 0)
      throw new EngineError(
        "unsupported-input",
        "The audio starts after the video ends, so nothing would be heard.",
        "Move the audio earlier on the timeline.",
      );

    const container = outputContainer(videoIn);
    const supported = containers[container].format().getSupportedCodecs() as string[];
    if (!supported.includes(vTrack.codec ?? ""))
      throw new EngineError(
        "unsupported-output",
        `The video's ${codecName(vTrack.codec ?? undefined) ?? "picture"} cannot be copied into ${container.toUpperCase()}.`,
        "Convert the video to MP4 first.",
      );
    // Mix with a silent video is a replace; the balance only matters when there are two sounds.
    const mixing = o.mode === "mix" && !!origTrack;
    const gains = mixing ? balanceGains[o.balance] : { added: o.volume, original: 0 };
    const copyAudio =
      audioUnchanged({ ...o, mode: mixing ? "mix" : "replace" }, place.cut) &&
      !!newTrack.codec &&
      supported.includes(newTrack.codec);
    if (!copyAudio && !(await newTrack.canDecode()))
      throw new EngineError(
        "unsupported-input",
        `${audioIn.file.name} uses a sound format this browser cannot decode.`,
        "Convert it to MP3 or M4A with the audio converter first.",
      );
    if (origTrack && !(await origTrack.canDecode()))
      throw new EngineError(
        "unsupported-input",
        "The video's own sound uses a format this browser cannot decode, so it cannot be mixed.",
        "Choose Replace instead.",
      );
    const channels = Math.min(
      2,
      Math.max(newTrack.numberOfChannels, origTrack?.numberOfChannels ?? 1),
    );
    const baseRate = [44_100, 48_000].includes(newTrack.sampleRate) ? newTrack.sampleRate : 48_000;
    const enc = copyAudio ? undefined : await pickCodec(container, channels, baseRate);
    if (!copyAudio && !enc)
      throw new EngineError(
        "unsupported-output",
        "Your browser cannot encode audio for this video.",
        "Try desktop Chrome, Edge or Safari 17.4 or newer.",
      );
    const plan: AddAudioPlan = {
      container,
      copyAudio,
      codec: copyAudio ? (newTrack.codec ?? "") : (enc?.codec ?? "aac"),
    };

    const { format, mime } = containers[container];
    // About as large as the video and the sound; large outputs stream to disk (../mediabunny/output-store).
    const store = await openOutputStore(videoIn.file.size + (copyAudio ? audioIn.file.size : 0));
    const output = new Output({
      format: format({ streamed: store.streamed }),
      target: store.target,
    });
    const [vConfig, aConfig] = await Promise.all([
      vTrack.getDecoderConfig(),
      copyAudio ? newTrack.getDecoderConfig() : Promise.resolve(null),
    ]);
    const videoSource = new EncodedVideoPacketSource(vTrack.codec ?? "avc");
    output.addVideoTrack(videoSource, { rotation: vTrack.rotation });
    const packetSource =
      copyAudio && newTrack.codec ? new EncodedAudioPacketSource(newTrack.codec) : null;
    const sampleSource = enc
      ? new AudioSampleSource({
          codec: enc.codec,
          quality: new Quality({ bitrate: AUDIO_KBPS * 1000 }),
        })
      : null;
    if (packetSource) output.addAudioTrack(packetSource);
    if (sampleSource) output.addAudioTrack(sampleSource);

    let videoDone = 0;
    let audioDone = 0;
    const report = () => {
      const done = Math.min(videoDone, audioDone);
      ctx.onProgress({
        phase: "processing",
        ratio: videoDuration > 0 ? Math.min(1, done / videoDuration) : 0,
        detail: `${formatDuration(done)} of ${formatDuration(videoDuration)} · ${copyAudio ? "copying" : mixing ? "mixing" : "placing"} audio`,
      });
    };

    const videoLoop = async () => {
      const sink = new EncodedPacketSink(vTrack);
      let first = true;
      for await (const packet of sink.packets()) {
        check();
        const ts = Math.max(0, packet.timestamp - vSpan.start);
        await videoSource.add(
          packet.clone({ timestamp: ts }),
          first && vConfig ? { decoderConfig: vConfig } : undefined,
        );
        first = false;
        videoDone = ts;
        report();
      }
      videoDone = videoDuration;
    };

    // AAC priming before zero is kept and shifted to zero; an edit list then skips it (MP4, MOV).
    const copyLead = Math.max(0, audioOrigin - (aSpan?.start ?? 0));
    const copyAudioLoop = async () => {
      if (!packetSource) return;
      const sink = new EncodedPacketSink(newTrack);
      let first = true;
      for await (const packet of sink.packets()) {
        check();
        const ts = packet.timestamp - audioOrigin + copyLead;
        if (ts - copyLead >= videoDuration) break;
        await packetSource.add(
          packet.clone({ timestamp: Math.max(0, ts) }),
          first && aConfig ? { decoderConfig: aConfig } : undefined,
        );
        first = false;
        audioDone = ts - copyLead;
        report();
      }
      audioDone = videoDuration;
    };

    /** Seconds of silence fed first for an AAC encoder that swallows its start (../mediabunny/priming). */
    let leadSec = 0;
    const encodeAudioLoop = async () => {
      if (!sampleSource || !enc) return;
      const rate = enc.sampleRate;
      const total = Math.round(videoDuration * rate);
      const startFrame = Math.round(place.start * rate);
      const endFrame = Math.round(place.end * rate);
      const newReader = new PcmReader(
        newTrack,
        audioOrigin + o.skip,
        channels,
        rate,
        o.loop,
        audioEnd,
      );
      const origReader = origTrack ? new PcmReader(origTrack, vSpan.start, channels, rate) : null;
      try {
        for (let f = 0; f < total; f += BLOCK) {
          check();
          const n = Math.min(BLOCK, total - f);
          const planes = Array.from({ length: channels }, () => new Float32Array(n));
          // New audio: silent before its start and after its end; read only what plays.
          const from = Math.max(f, startFrame);
          const to = Math.min(f + n, endFrame);
          if (to > from) {
            const got = await newReader.read(to - from);
            for (let c = 0; c < channels; c++) {
              const src = got[c] ?? got[0];
              const dst = planes[c];
              if (!src || !dst) continue;
              for (let i = 0; i < to - from; i++) {
                const t = (from + i) / rate;
                dst[from - f + i] = (src[i] ?? 0) * gainAt(t, place, gains.added, o.skip);
              }
            }
          }
          if (origReader) {
            const orig = await origReader.read(n);
            for (let c = 0; c < channels; c++) {
              const src = orig[c] ?? orig[0];
              const dst = planes[c];
              if (!src || !dst) continue;
              for (let i = 0; i < n; i++)
                dst[i] = softClip((dst[i] ?? 0) + (src[i] ?? 0) * gains.original);
            }
          } else {
            for (const dst of planes) for (let i = 0; i < n; i++) dst[i] = softClip(dst[i] ?? 0);
          }
          const data = new Float32Array(n * channels);
          planes.forEach((p, c) => {
            data.set(p, c * n);
          });
          const sample = new AudioSample({
            data,
            format: "f32-planar",
            numberOfChannels: channels,
            sampleRate: rate,
            timestamp: f / rate + leadSec,
          });
          await sampleSource.add(sample);
          sample.close();
          audioDone = (f + n) / rate;
          report();
        }
        await addOpusTail(sampleSource, enc.codec, rate, channels, total / rate + leadSec);
      } finally {
        newReader.close();
        origReader?.close();
      }
    };

    try {
      await output.start();
      // AAC: the silence this browser's encoder swallows at its start goes in first (WebKit: 1024).
      if (sampleSource && enc)
        leadSec = await addAacLead(sampleSource, enc.codec, enc.sampleRate, channels);
      await Promise.all([videoLoop(), copyAudio ? copyAudioLoop() : encodeAudioLoop()]);
      ctx.onProgress({ phase: "finishing", ratio: 1, detail: "Writing the file" });
      await output.finalize();
    } catch (e) {
      await output.cancel().catch(() => undefined);
      await store.discard();
      if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
      throw classifyError(e);
    }
    const buffer = await store.finish();
    // Signal the AAC start in MP4 and MOV so the sound is not late: the encoder's priming for encoded
    // sound (../mediabunny/priming), the source's own priming for a copied track.
    // Opus in WebM: the encoder's pre-skip and padding (CodecDelay, DiscardPadding) likewise.
    let parts: BlobPart[] | null = null;
    if (sampleSource) {
      parts = await withEncoderDelaySignalled(output, buffer, container, videoDuration, 0, true);
    } else if (container === "mp4" || container === "mov") {
      // AAC priming and an MP3's encoder delay alike: the edit list skips them.
      if (packetSource && copyLead > 1e-6 && (plan.codec === "aac" || plan.codec === "mp3"))
        parts = await editOutputSound(buffer, (written) =>
          written[0]
            ? [
                {
                  trackId: written[0].id,
                  primingSec: copyLead,
                  endSec: Math.min(videoDuration, audioDuration),
                },
              ]
            : [],
        );
    } else if (packetSource) {
      // WebM and MKV: the same lead as a CodecDelay on the copied track (added second, so track 2);
      // copied Opus states its pre-skip there, which mediabunny writes as 0.
      const d = aConfig?.description;
      const head = plan.codec === "opus" && d ? readOpusHead(bytesOf(d)) : null;
      // (An Ogg source's first packet already sits a pre-skip before zero, so the larger of the two.)
      const delay = Math.max(copyLead, head ? head.preSkip / 48_000 : 0);
      if (delay > 1e-6)
        parts = await rewriteOutputMatroska(
          buffer,
          new Map([[2, { codecDelayNs: Math.round(delay * 1e9) }]]),
        );
    }
    const ext = container === "mkv" ? "mkv" : container;
    const filename = `${baseName(videoIn.file.name)}-${o.mode === "mix" ? "with-audio" : "new-audio"}.${ext}`;
    const audioFact = copyAudio
      ? `${codecName(plan.codec) ?? plan.codec} copied`
      : `${codecName(plan.codec) ?? plan.codec} ${withUnit(AUDIO_KBPS, "kbps")} ${mixing ? "mixed" : "placed"}`;
    return {
      blob: new Blob(parts ?? [buffer], { type: mime }),
      filename,
      meta: `${codecName(vTrack.codec ?? undefined) ?? "Video"} copied · ${audioFact} · ${formatDuration(videoDuration)}`,
      ffmpegCommand: addAudioCommand(
        videoIn.file.name,
        audioIn.file.name,
        filename,
        o,
        place,
        plan,
        !!origTrack,
      ),
    };
  },
};
