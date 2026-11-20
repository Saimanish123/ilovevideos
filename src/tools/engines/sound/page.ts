/**
 * Page runner for the sound-shaping engines (volume, audio-fade). Every run starts here, so a batch
 * file takes the same path as a single one. It decides from the target (./target) and a probe of this
 * browser's encoders:
 *
 * - Native: the engine worker reads, processes, encodes and measures in one go.
 * - Via ffmpeg: sources only ffmpeg decodes (WMA, AIFF) are decoded to float WAV first; the worker
 *   processes to float WAV; ffmpeg.wasm encodes the final format (MP3, OGG Vorbis, AIFF, or AAC and
 *   FLAC where there is no encoder here) with the original's tags; the analysis worker measures it.
 *
 * Page thread. No network access to user data; the ffmpeg core is our own static asset.
 */
import { withUnit } from "@/lib/format";
import type { EngineId } from "@/tools/registry/schema";
import { EngineError } from "../errors";
import type { EngineContext, EngineResult, MediaInfo } from "../types";
import { channelsName, codecFact, resultMeta, type SoundFacts, soundCommand } from "./facts";
import { type NativeSoundCodec, type SoundTarget, soundOutputName, soundTarget } from "./target";

const webCodecsName: Partial<Record<NativeSoundCodec, string>> = {
  aac: "mp4a.40.2",
  opus: "opus",
  flac: "flac",
};

/** Whether this browser encodes `codec` for a sound like this one (the worker tries the same fallbacks). */
async function canEncodeHere(codec: NativeSoundCodec, rate: number, channels: number) {
  if (codec.startsWith("pcm")) return true;
  const name = webCodecsName[codec];
  if (!name || typeof AudioEncoder === "undefined") return false;
  for (const [r, ch] of [
    [rate, channels],
    [rate, Math.min(2, channels)],
    [48_000, Math.min(2, channels)],
  ] as const) {
    try {
      const s = await AudioEncoder.isConfigSupported({
        codec: name,
        sampleRate: r,
        numberOfChannels: ch,
        ...(codec === "flac" ? {} : { bitrate: 128_000 }),
      });
      if (s.supported) return true;
    } catch {
      // An unknown config throws in some browsers; try the next.
    }
  }
  return false;
}

/** Suffix used by the engine for the output name, repeated here for the ffmpeg path's final name. */
const suffixFor = (engine: EngineId, o: Record<string, unknown>) =>
  engine === "volume"
    ? o.mode === "normalize"
      ? "normalized"
      : Number(o.gainDb) >= 0
        ? "louder"
        : "quieter"
    : Number(o.fadeIn) > 0 && Number(o.fadeOut) > 0
      ? "faded"
      : Number(o.fadeIn) > 0
        ? "fade-in"
        : "fade-out";

/** Whether this file's job runs through ffmpeg.wasm here (decode or encode), after the encoder probe. */
export async function soundUsesFfmpeg(info: MediaInfo, fileName: string): Promise<boolean> {
  const t = soundTarget(info, fileName);
  if (t.kind !== "audio") return false;
  if (t.ffmpegDecode || !t.native) return true;
  const track = info.audio?.[0];
  return !(await canEncodeHere(t.native, track?.sampleRate ?? 48_000, track?.channels ?? 2));
}

export async function runSoundPage(
  engine: EngineId,
  file: File,
  info: MediaInfo,
  options: Record<string, unknown>,
  ctx: EngineContext,
): Promise<EngineResult> {
  const target = soundTarget(info, file.name);
  if (target.kind === "none") throw new EngineError("unsupported-input", target.reason);
  const { EngineClient } = await import("@/tools/workers/client");
  const client = new EngineClient();
  // Cancel ends the job here and now: the page is ready again at once. The worker gets the cancel
  // message (it hands its event loop a turn every 50 ms, ../sound/pace) and removes its partial
  // output; a moment later it is terminated whatever it is doing, which frees all its memory.
  const cancelled = new Promise<never>((_, reject) => {
    const stop = () => {
      setTimeout(() => client.dispose(), CANCEL_GRACE_MS);
      reject(new EngineError("cancelled", "Cancelled."));
    };
    if (ctx.signal.aborted) stop();
    else ctx.signal.addEventListener("abort", stop, { once: true });
  });
  cancelled.catch(() => undefined);
  try {
    return await Promise.race([run(), cancelled]);
  } catch (e) {
    if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
    const err = e as { code?: string; message?: string; hint?: string };
    if (err && typeof err === "object" && err.code && !(e instanceof EngineError))
      throw new EngineError(
        err.code as EngineError["code"],
        err.message ?? "Something went wrong.",
        err.hint,
      );
    throw e;
  } finally {
    if (!ctx.signal.aborted) client.dispose();
  }

  async function run(): Promise<EngineResult> {
    if (!(await soundUsesFfmpeg(info, file.name))) {
      const r = await client.run(
        engine,
        file,
        { ...options, output: "auto" },
        {
          info,
          signal: ctx.signal,
          onProgress: ctx.onProgress,
        },
      );
      return { blob: r.blob, filename: r.filename, ffmpegCommand: r.ffmpegCommand, meta: r.meta };
    }
    return viaFfmpeg(engine, client, file, info, options, target as AudioTarget, ctx);
  }
}

type AudioTarget = Extract<SoundTarget, { kind: "audio" }>;

/** How long a cancelled job's worker may take to remove its partial output before it is ended. */
const CANCEL_GRACE_MS = 1000;

async function viaFfmpeg(
  engine: EngineId,
  client: InstanceType<typeof import("@/tools/workers/client").EngineClient>,
  file: File,
  info: MediaInfo,
  options: Record<string, unknown>,
  target: AudioTarget,
  ctx: EngineContext,
): Promise<EngineResult> {
  const { decodeToWav, encodeFromWav } = await import("./ffmpeg");
  const { analyzeInWorker } = await import("@/tools/workers/sound-analysis-client");
  // Stages: [decode] → process → encode → measure.
  const decodeShare = target.ffmpegDecode ? 0.2 : 0;
  let source = file;
  let sourceInfo = info;
  if (target.ffmpegDecode) {
    source = await decodeToWav(file, ctx, [0, decodeShare]);
    sourceInfo = await client.inspect(source);
  }
  const processEnd = decodeShare + (1 - decodeShare) * 0.55;
  const processed = await client.run(
    engine,
    source,
    { ...options, output: "wav" },
    {
      info: sourceInfo,
      signal: ctx.signal,
      onProgress: (p) =>
        ctx.onProgress({ ...p, ratio: decodeShare + p.ratio * (processEnd - decodeShare) }),
    },
  );
  const facts = JSON.parse(processed.meta ?? "{}") as SoundFacts;
  const layout = `${withUnit(facts.sampleRate / 1000, "kHz")} ${channelsName(facts.channels)}`;
  const filename = soundOutputName(file.name, facts.suffix ?? suffixFor(engine, options), target);
  const codec = codecFact(
    target.format.encode.ffmpeg.replace(/^lib/, "").replace(/lame$/, ""),
    target.bitrateKbps,
  );
  // Silence removal states its own result (the cut list) and command; nothing to measure.
  if (facts.meta) {
    const encoded = await encodeFromWav(processed.blob, file, target, ctx, [processEnd, 1]);
    return {
      blob: encoded,
      filename,
      ffmpegCommand: processed.ffmpegCommand,
      meta: `${facts.meta} · ${codec}, ${layout}`,
    };
  }

  // A lossy encoder can change the level: LAME measured 0.3 dB down on tones and up to 0.9 dB on
  // pink noise (it filters the top octave), so "+6 dB" came out +5.7 and a −16 LUFS normalise
  // −16.3. A volume job measures the processed WAV while ffmpeg encodes, measures the encoded file,
  // and encodes once more with the difference as a plain gain, so the file holds the asked change.
  const lossy = !target.format.lossless;
  const correct = engine === "volume" && lossy;
  const intended = correct
    ? analyzeInWorker(processed.blob, "processed.wav", { truePeak: false, signal: ctx.signal })
    : undefined;
  intended?.catch(() => undefined);
  const firstEnd = correct ? 0.82 : 0.92;
  let encoded = await encodeFromWav(processed.blob, file, target, ctx, [processEnd, firstEnd]);
  let after = await measureOutput(encoded, target, ctx, [firstEnd, correct ? 0.86 : 1]);
  let correction = 0;
  if (correct && intended) {
    const wanted = (await intended).loudness.integrated;
    let delta = wanted - after.loudness.integrated;
    // Peaks stay under the ceiling wherever the job holds them there (limiter on, or a normalise).
    const o = options as { mode?: string; limit?: boolean; ceiling?: number };
    const ceiling = typeof o.ceiling === "number" ? o.ceiling : -1;
    if ((o.limit || o.mode === "normalize") && Number.isFinite(after.loudness.truePeak))
      delta = Math.min(delta, ceiling - after.loudness.truePeak);
    // Only an encoder's loss, never a second processing step: a few tenths, at most 2 dB.
    if (Number.isFinite(delta) && Math.abs(delta) >= 0.05 && Math.abs(delta) <= 2) {
      const again = await encodeFromWav(processed.blob, file, target, ctx, [0.86, 0.95], delta);
      const measured = await measureOutput(again, target, ctx, [0.95, 1]);
      // Keep whichever is closer to what was processed; a second pass that missed is not used.
      if (
        Math.abs(wanted - measured.loudness.integrated) <
        Math.abs(wanted - after.loudness.integrated)
      ) {
        encoded = again;
        after = measured;
        correction = delta;
      }
    }
  }
  const filter = [facts.filter, correction ? `volume=${correction.toFixed(2)}dB` : ""]
    .filter(Boolean)
    .join(",");
  return {
    blob: encoded,
    filename,
    ffmpegCommand: soundCommand(file.name, filename, filter, target),
    meta: resultMeta({
      before: facts.before ?? after.loudness,
      after: after.loudness,
      limitedDb: facts.limitedDb,
      codec,
      layout,
      picture: false,
      otherTracks: facts.otherTracks,
      describe: facts.describe,
      kept: facts.kept,
    }),
  };
}

/**
 * Measures an encoded output in the analysis worker. mediabunny reads every target but AIFF (it has
 * no AIFF demuxer, which made every AIFF run fail at this step); AIFF is decoded by ffmpeg first.
 */
async function measureOutput(
  encoded: Blob,
  target: AudioTarget,
  ctx: EngineContext,
  [lo, hi]: [number, number],
) {
  const { analyzeInWorker } = await import("@/tools/workers/sound-analysis-client");
  let blob: Blob = encoded;
  let name = `output.${target.format.extension}`;
  let start = lo;
  if (!target.format.muxer) {
    const { decodeToWav } = await import("./ffmpeg");
    start = lo + (hi - lo) / 2;
    blob = await decodeToWav(new File([encoded], name), ctx, [lo, start]);
    name = "output.wav";
  }
  ctx.onProgress({ phase: "finishing", ratio: start, detail: "Measuring the result" });
  return analyzeInWorker(blob, name, {
    signal: ctx.signal,
    onProgress: (r) =>
      ctx.onProgress({
        phase: "finishing",
        ratio: start + r * (hi - start),
        detail: "Measuring the result",
      }),
  });
}
