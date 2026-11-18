/**
 * Merge audio (E11): several audio files joined end to end into one, in the user's order. Matching
 * MP3s are joined frame for frame (./mp3-join: no decoding, the bytes are the sources'); everything
 * else is decoded file after file, brought to the first file's rate (band-limited, ../sound/dsp/
 * resample) and the widest layout (mono files play on both sides), optionally evened to one loudness,
 * joined back to back, with silence between, or with an equal-power crossfade, and encoded once: AAC
 * (M4A) or PCM (WAV) here, or float WAV for the page's ffmpeg stage (MP3, FLAC). Memory stays flat
 * in the number and length of the files; large outputs stream to on-device storage (ADR-0058).
 * Runs in the engine worker; no network access.
 */
import { AudioSample, AudioSampleSource, Output, Quality } from "mediabunny";
import { formatDuration, withUnit } from "@/lib/format";
import { classifyError, EngineError } from "../errors";
import { type OutputStore, openOutputStore } from "../mediabunny/output-store";
import { addAacLead, withEncoderDelaySignalled } from "../mediabunny/priming";
import { containers, type OutputId, openInput } from "../mediabunny/shared";
import { mixChannels } from "../merge/resample";
import { Limiter } from "../sound/dsp/limiter";
import { fromDb, LoudnessMeter } from "../sound/dsp/loudness";
import { SincResampler } from "../sound/dsp/resample";
import { channelsName, codecFact } from "../sound/facts";
import { breather } from "../sound/pace";
import { openSound, readSound } from "../sound/reader";
import { blobReleasing, pickEncoding } from "../sound/render";
import type { NativeSoundCodec } from "../sound/target";
import type { Engine, EngineContext, MediaInput } from "../types";
import { joinGapSamples, joinMp3, mp3Mismatch, scanMp3 } from "./mp3-join";
import {
  crossfadeGains,
  JOIN_KBPS,
  JoinAudioOptions,
  joinCommand,
  joinedName,
  loudnessGains,
  MATCH_CEILING_DB,
  MAX_FILES,
  planJoin,
} from "./options";

export { JoinAudioOptions } from "./options";

const BLOCK = 4096;

/** Integrated loudness of each file (LUFS), read once each, for "Match loudness". */
async function measureAll(inputs: MediaInput[], ctx: EngineContext, share: number) {
  const out: number[] = [];
  for (const [k, i] of inputs.entries()) {
    const input = openInput(i.file);
    try {
      const src = await openSound(input, i.file);
      if (!src) {
        out.push(Number.NaN);
        continue;
      }
      const meter = new LoudnessMeter(src.sampleRate, src.channels, false);
      const span = Math.max(1e-6, src.end - src.origin);
      for await (const b of readSound(src, src.origin, src.end, ctx.signal)) {
        meter.push(b.planes, b.frames);
        ctx.onProgress({
          phase: "analyzing",
          ratio: share * ((k + Math.min(1, (b.time - src.origin) / span)) / inputs.length),
          detail: `Measuring file ${k + 1} of ${inputs.length}`,
          item: { index: k, count: inputs.length },
        });
      }
      out.push(meter.result().integrated);
    } finally {
      input.dispose();
    }
  }
  return out;
}

export const joinAudioEngine: Engine<JoinAudioOptions> = {
  id: "join-audio",
  backends: ["webcodecs"],
  optionsSchema: JoinAudioOptions,
  async supports(backend, input, _o, inputs) {
    return (
      backend === "webcodecs" && (inputs ?? [input]).every((i) => (i.info?.audio?.length ?? 0) > 0)
    );
  },
  async run(_backend, inputs, o, ctx) {
    if (inputs.length < 2)
      throw new EngineError("unsupported-input", "Add at least two audio files to merge.");
    if (inputs.length > MAX_FILES)
      throw new EngineError(
        "resource",
        `This tool joins up to ${MAX_FILES} files at a time.`,
        "Merge them in groups, then merge the results.",
      );
    const facts = inputs.map((i) => ({
      name: i.file.name,
      info: i.info ?? { container: "", durationSec: 0, sizeBytes: i.file.size },
    }));
    const silent = facts.findIndex((f) => !f.info.audio?.length);
    if (silent >= 0)
      throw new EngineError(
        "unsupported-input",
        `File ${silent + 1} (${facts[silent]?.name}) has no sound track. Remove it to merge the rest.`,
      );
    const plan = planJoin(facts, o);
    const names = facts.map((f) => f.name);
    const first = names[0] ?? "audio";

    if (plan.copy && o.output !== "wav") {
      ctx.onProgress({ phase: "analyzing", ratio: 0, detail: "Reading the MP3 frames" });
      try {
        const layouts = [];
        for (const [k, i] of inputs.entries()) {
          if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
          layouts.push(await scanMp3(i.file, i.file.name));
          ctx.onProgress({
            phase: "processing",
            ratio: (k + 1) / inputs.length,
            detail: `Reading file ${k + 1} of ${inputs.length}`,
            item: { index: k, count: inputs.length },
          });
        }
        const mismatch = mp3Mismatch(layouts);
        if (!mismatch) {
          const blob = joinMp3(
            inputs.map((i) => i.file),
            layouts,
          );
          const gaps = joinGapSamples(layouts);
          const rate = layouts[0]?.sampleRate ?? 44_100;
          const longest = Math.max(0, ...gaps) / rate;
          const filename = joinedName(first, "mp3");
          return {
            blob,
            filename,
            ffmpegCommand: joinCommand(names, filename, o, plan),
            meta: `${formatDuration(plan.seconds)} · MP3 frames copied, no re-encode${gaps.length ? ` · joins keep up to ${Math.round(longest * 1000)} ms of encoder padding` : ""}`,
          };
        }
      } catch (e) {
        if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
        // A file that is not cleanly framed is re-encoded below instead.
        void e;
      }
    }
    return reencode(inputs, o, plan, names, ctx);
  },
};

async function reencode(
  inputs: MediaInput[],
  o: JoinAudioOptions,
  plan: ReturnType<typeof planJoin>,
  names: string[],
  ctx: EngineContext,
) {
  const check = () => {
    if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
  };
  const wavStage = o.output === "wav" || !(plan.format.id === "m4a" || plan.format.id === "wav");
  const rate = plan.sampleRate;
  const channels = plan.channels;
  // Matching loudness measures every file first: about a quarter of the job.
  const measureShare = o.matchLoudness ? 0.25 : 0;
  const gains = o.matchLoudness
    ? loudnessGains(await measureAll(inputs, ctx, measureShare))
    : inputs.map(() => 0);
  const limit = o.matchLoudness && gains.some((g) => g > 0);

  let codec: NativeSoundCodec;
  let to: OutputId;
  let bitrateKbps: number | undefined;
  if (wavStage) {
    codec = "pcm-f32";
    to = "wav";
  } else if (plan.format.id === "wav") {
    codec = plan.bits === 24 ? "pcm-s24" : "pcm-s16";
    to = "wav";
  } else {
    const enc = await pickEncoding(["aac"], rate, channels, JOIN_KBPS);
    if (!enc || enc.sampleRate !== rate)
      throw new EngineError(
        "unsupported-output",
        "This browser cannot encode AAC at this sample rate.",
        "Choose MP3 or WAV.",
      );
    codec = "aac";
    to = "m4a";
    bitrateKbps = JOIN_KBPS;
  }
  const bytesPer = codec === "pcm-f32" ? 4 : codec === "pcm-s24" ? 3 : codec === "pcm-s16" ? 2 : 0;
  const expected = bytesPer
    ? bytesPer * rate * channels * plan.seconds
    : JOIN_KBPS * 125 * plan.seconds;
  let store: OutputStore | undefined;
  let delivered = false;
  try {
    store = await openOutputStore(expected);
    const output = new Output({
      format: containers[to].format({ streamed: store.streamed }),
      target: store.target,
    });
    const source = new AudioSampleSource({
      codec,
      ...(bitrateKbps ? { quality: new Quality({ bitrate: bitrateKbps * 1000 }) } : {}),
    });
    output.addAudioTrack(source);
    await output.start();
    let lead: number | undefined;
    let written = 0;
    const emit = async (planes: Float32Array[]) => {
      const n = planes[0]?.length ?? 0;
      if (n === 0) return;
      lead ??= await addAacLead(source, codec, rate, channels, 0);
      const data = new Float32Array(n * channels);
      for (let c = 0; c < channels; c++)
        data.set((planes[c] ?? (planes[0] as Float32Array)).subarray(0, n), c * n);
      const sample = new AudioSample({
        data,
        format: "f32-planar",
        numberOfChannels: channels,
        sampleRate: rate,
        timestamp: lead + written / rate,
      });
      await source.add(sample);
      sample.close();
      written += n;
    };
    const limiter = limit ? new Limiter(channels, rate, fromDb(MATCH_CEILING_DB)) : undefined;
    const out = async (planes: Float32Array[]) =>
      emit(limiter ? limiter.process(planes, planes[0]?.length ?? 0) : planes);

    const xfade = Math.round(plan.crossfadeSec * rate);
    const gap = o.join === "gap" ? Math.round(o.gapSec * rate) : 0;
    /** The last `xfade` frames of the previous file, held back to be mixed with the next one's start. */
    let tail: Float32Array[] | null = null;
    const total = Math.max(1e-6, plan.seconds);
    let done = 0;
    const breathe = breather();
    for (const [k, i] of inputs.entries()) {
      check();
      const input = openInput(i.file);
      try {
        const src = await openSound(input, i.file);
        if (!src) throw new EngineError("unsupported-input", `File ${k + 1} has no sound track.`);
        if (!(await src.track.canDecode()))
          throw new EngineError(
            "unsupported-input",
            `This browser cannot decode the sound of file ${k + 1} (${i.file.name}).`,
            "Convert it to WAV or MP3 with the audio converter first.",
          );
        const resampler =
          src.sampleRate !== rate ? new SincResampler(src.sampleRate / rate, channels) : null;
        const g = fromDb(gains[k] ?? 0);
        const isLast = k === inputs.length - 1;
        // Frames of this file: the head is mixed into the held tail; the end is held for the next.
        let head = k > 0 && tail ? xfade : 0;
        let held: Float32Array[] = Array.from({ length: channels }, () => new Float32Array(0));
        let headAt = 0;
        const take = async (planesIn: Float32Array[]) => {
          let planes = planesIn;
          let n = planes[0]?.length ?? 0;
          if (n === 0) return;
          if (g !== 1)
            planes = planes.map((p) => {
              const q = new Float32Array(n);
              for (let s = 0; s < n; s++) q[s] = (p[s] ?? 0) * g;
              return q;
            });
          // Crossfade: the start of this file over the held end of the last.
          if (head > 0 && tail) {
            const m = Math.min(head, n);
            const mixed = planes.map((p, c) => {
              const t = tail?.[c] as Float32Array;
              const q = new Float32Array(m);
              for (let s = 0; s < m; s++) {
                const [go, come] = crossfadeGains((headAt + s) / xfade);
                q[s] = (t[headAt + s] ?? 0) * go + (p[s] ?? 0) * come;
              }
              return q;
            });
            await out(mixed);
            headAt += m;
            head -= m;
            planes = planes.map((p) => p.subarray(m));
            n -= m;
            if (head === 0) tail = null;
            if (n === 0) return;
          }
          if (isLast || xfade === 0) {
            await out(planes);
            return;
          }
          // Keep the last `xfade` frames back.
          const joined = held.map((h, c) => {
            const q = new Float32Array(h.length + n);
            q.set(h);
            q.set(planes[c] as Float32Array, h.length);
            return q;
          });
          const release = Math.max(0, (joined[0]?.length ?? 0) - xfade);
          if (release > 0) await out(joined.map((p) => p.subarray(0, release)));
          held = joined.map((p) => p.slice(release));
        };
        for await (const block of readSound(src, src.origin, src.end, ctx.signal)) {
          check();
          await breathe();
          let planes = mixChannels(block.planes, channels);
          if (resampler) planes = resampler.process(planes);
          await take(planes);
          done += block.frames / src.sampleRate;
          ctx.onProgress({
            phase: "processing",
            ratio: measureShare + (1 - measureShare) * 0.97 * Math.min(1, done / total),
            detail: `Joining file ${k + 1} of ${inputs.length} · ${formatDuration(Math.min(done, total))} of ${formatDuration(total)}`,
            item: { index: k, count: inputs.length },
          });
        }
        if (resampler) await take(resampler.flush());
        if (!isLast && xfade > 0) tail = held;
        if (!isLast && gap > 0) {
          for (let left = gap; left > 0; left -= BLOCK)
            await out(
              Array.from({ length: channels }, () => new Float32Array(Math.min(BLOCK, left))),
            );
        }
      } finally {
        input.dispose();
      }
    }
    if (limiter) await emit(limiter.flush());
    if (written === 0) throw new EngineError("unsupported-input", "The files decoded to no sound.");
    ctx.onProgress({ phase: "finishing", ratio: 0.99, detail: "Writing the file" });
    await output.finalize();
    const data = await store.finish();
    const seconds = written / rate;
    const parts = await withEncoderDelaySignalled(output, data, to, seconds, 0, true);
    const type = to === "wav" ? "audio/wav" : "audio/mp4";
    delivered = true;
    const blob =
      data instanceof ArrayBuffer
        ? blobReleasing(parts ?? [data], data, type)
        : new Blob(parts ?? [data], { type });
    const ext = wavStage ? "wav" : plan.format.extension;
    const filename = joinedName(names[0] ?? "audio", ext);
    return {
      blob,
      filename,
      ffmpegCommand: joinCommand(
        names,
        joinedName(names[0] ?? "audio", plan.format.extension),
        o,
        plan,
      ),
      meta: JSON.stringify({
        seconds,
        files: inputs.length,
        codec: codecFact(codec, bitrateKbps),
        layout: `${withUnit(rate / 1000, "kHz")} ${channelsName(channels)}`,
        gains,
        limitedDb: limiter && limiter.minGain < 1 ? -20 * Math.log10(limiter.minGain) : 0,
      }),
    };
  } catch (e) {
    if (!delivered) await store?.discard();
    if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
    throw classifyError(e);
  }
}
