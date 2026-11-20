/**
 * ffmpeg.wasm engine (ADR-0004): the universal fallback for containers the native engine cannot
 * read or write. Runs on the page thread; the FFmpeg class spawns its own worker for the actual
 * work. Loads the multithreaded core (~32 MB) from our origin the first time it is needed.
 * The whole input is held in WASM memory, so this path is for files up to roughly 2 GB.
 */
import type { FFmpeg } from "@ffmpeg/ffmpeg";
import { containerById } from "@/content/formats/containers";
import { baseName, formatBytes, shellQuote } from "@/lib/format";
import type { ConversionPlan } from "../convert-video/plan";
import { classifyError, EngineError } from "../errors";
import type { EngineContext, EngineResult, MediaInfo } from "../types";
import type { VideoToAudioOptions } from "../video-to-audio";
import { audioOutputName, effectiveRange } from "../video-to-audio/math";
import { type ExtractionPlan, ffmpegAudioArgs, outputMeta } from "../video-to-audio/plan";
import { convertArgs, soundTracks, soundTracksMeta } from "./convert-args";
import { ffmpegFailure } from "./failures";
import { mountInput } from "./mount";
import { parseProbeLog } from "./probe-log";
import { FFMPEG_WASM_BYTES, ffmpegDownloadSize } from "./size";

/** Matroska or WebM, by what the reader said or the file's name. */
const looksMatroska = (file: File, info?: Pick<MediaInfo, "container">) =>
  /matroska|webm/i.test(info?.container ?? "") || /\.(mkv|mka|webm|mk3d)$/i.test(file.name);

/** Samples to drop per sound track (`0:a:N`); loaded only for Matroska sources (./matroska-delay). */
async function sampleDrops(file: File): Promise<number[]> {
  try {
    const { matroskaSoundDelays, samplesToDrop } = await import("./matroska-delay");
    return samplesToDrop(await matroskaSoundDelays(file));
  } catch {
    // Unreadable header: run as before rather than fail the conversion.
    return [];
  }
}

/** The filter that drops `samples` from the start and restarts the clock at zero. */
const dropStart = (samples: number) => `atrim=start_sample=${samples},asetpts=PTS-STARTPTS`;

/**
 * FFmpeg 5.1 (the wasm build) skips AAC priming at the start of an MP4/MOV through its edit list but
 * not the encoder padding at the end, which local FFmpeg 7 and later also drop: a whole-file
 * re-encode came out 512 samples (10.7 ms at 48 kHz) long (measured 2026-10-08). An output `-t` of
 * the movie's duration, which no track's edit list exceeds, trims the padding sample-exactly (ffmpeg
 * inserts `atrim` for it) and never cuts sound. Copies and ranges already end where they should.
 */
export function withSoundEnd(
  args: string[],
  plan: { copy: boolean },
  info: Pick<MediaInfo, "container" | "durationSec">,
  range: unknown,
): string[] {
  const d = info.durationSec;
  if (plan.copy || range || !/^(MP4|QuickTime)/i.test(info.container) || !(d > 0)) return args;
  const at = args.indexOf("-f");
  const t = ["-t", d.toFixed(6)];
  return at < 0 ? [...args, ...t] : [...args.slice(0, at), ...t, ...args.slice(at)];
}

/**
 * The largest result the ffmpeg path takes on. Inputs are mounted (./mount) and cost nothing, but
 * ffmpeg.wasm writes its output to an in-memory file (a typed array that cannot pass 2 GiB) and
 * `readFile` copies it once more to hand it on. Measured 2026-10-08 in Chromium: extract audio
 * from a 2.28 GB, 30-minute MP4 peaked at 1.31 GB for the whole browser (it failed before mounting).
 */
export const FFMPEG_OUTPUT_LIMIT_BYTES = 1.5e9;

/**
 * Refuses before any work when the result would not fit (`FFMPEG_OUTPUT_LIMIT_BYTES`), saying what
 * does work instead. Never left to fail late with a generic message.
 */
export function assertOutputFits(expectedBytes: number, instead: string): void {
  if (!(expectedBytes > FFMPEG_OUTPUT_LIMIT_BYTES)) return;
  throw new EngineError(
    "resource",
    `The result would be about ${formatBytes(expectedBytes)}, too large for this browser to hold for this format, which stops near 2 GB.`,
    instead,
  );
}

/** Log lines kept per run: the input description, the stream mapping and the error. */
const LOG_LINES = 60;

/** An argument as typed in a shell: `0:a?` and `-c:a:1` need quotes only when they hold glob characters. */
export const shellArg = (a: string) => (/^[\w.:+=,/-]+$/.test(a) ? a : shellQuote(a));

const CORE_VERSION = "0.12.10";
const LIB_VERSION = "0.12.15";
const CORE_BASE = `/wasm/ffmpeg/${CORE_VERSION}`; // privacy-allow: our own static assets, same origin
const LIB_URL = `/wasm/ffmpeg/lib/${LIB_VERSION}/index.js`;
/**
 * ffmpeg's automatic thread count (= hardwareConcurrency) deadlocks the WASM pthread pool: measured
 * on 2026-09-03, auto/8 threads hang at the first frame, 1/2/4 finish (4 fastest). Always pin it.
 */
const THREADS = String(
  Math.max(
    1,
    Math.min(4, typeof navigator === "undefined" ? 2 : navigator.hardwareConcurrency || 2),
  ),
);
/** For other page-side ffmpeg runners (e.g. video-to-gif), so every run pins threads the same way. */
export const FFMPEG_THREADS = THREADS;

/**
 * Imports the ffmpeg class library from our origin at runtime. Kept out of the bundle on purpose:
 * bundlers cannot analyse its `new Worker(new URL(...))` and Turbopack turns it into a throw. The
 * ignore comments make the bundler leave this `import()` alone; a `new Function` wrapper would need
 * 'unsafe-eval' in the Content Security Policy, which the site does not allow.
 */
const runtimeImport = (u: string) =>
  import(/* webpackIgnore: true */ /* turbopackIgnore: true */ u) as Promise<{
    FFmpeg: new () => FFmpeg;
  }>;

let instance: FFmpeg | null = null;
let loading: Promise<FFmpeg> | null = null;

export function ffmpegSupported(): boolean {
  return (
    typeof SharedArrayBuffer !== "undefined" &&
    typeof crossOriginIsolated !== "undefined" &&
    crossOriginIsolated &&
    typeof WebAssembly !== "undefined"
  );
}

export async function loadFFmpeg(ctx?: EngineContext): Promise<FFmpeg> {
  if (instance?.loaded) return instance;
  if (!loading) {
    loading = (async () => {
      if (!ffmpegSupported()) {
        // Say which requirement is missing: the advice differs, and "use another browser" is wrong
        // when the browser is capable but the page did not load isolated (an in-app browser, an
        // extension rewriting headers).
        throw typeof WebAssembly === "undefined"
          ? new EngineError(
              "unsupported-output",
              "This browser cannot convert this format.",
              "Try desktop Chrome, Edge, Firefox or Safari.",
            )
          : new EngineError(
              "unsupported-output",
              "This page did not load in the isolated mode the converter needs to share memory between its threads.",
              "Reload the page. If you opened it inside another app, open it in the browser itself; an extension that changes page headers can also cause this.",
            );
      }
      const { FFmpeg: FFmpegClass } = await runtimeImport(LIB_URL);
      const ff = new FFmpegClass();
      ctx?.onProgress({
        phase: "loading",
        ratio: 0,
        detail: `Loading the converter (${ffmpegDownloadSize()}, once)`,
      });
      // The WebAssembly file is fetched here and proven whole before it is compiled: a cut-off
      // download used to fail with a compile error (ADR-0147). From the cache after the first time.
      const { downloadWhole } = await import("@/tools/workers/converter-download");
      let shown = Number.NEGATIVE_INFINITY;
      const wasm = await downloadWhole(
        `${CORE_BASE}/ffmpeg-core.wasm`,
        FFMPEG_WASM_BYTES,
        "application/wasm",
        ({ received, total }) => {
          // About four lines a second: the status line is a live region, and chunks come fast.
          const now = performance.now();
          if (received < total && now - shown < 250) return;
          shown = now;
          ctx?.onProgress({
            phase: "loading",
            ratio: Math.min(1, received / total),
            detail: `Loading the converter: ${formatBytes(received)} of ${formatBytes(total)}`,
          });
        },
      );
      const wasmURL = URL.createObjectURL(wasm);
      try {
        await ff.load({
          coreURL: `${CORE_BASE}/ffmpeg-core.js`,
          wasmURL,
          workerURL: `${CORE_BASE}/ffmpeg-core.worker.js`,
        });
      } finally {
        URL.revokeObjectURL(wasmURL);
      }
      instance = ff;
      return ff;
    })().finally(() => {
      loading = null;
    });
  }
  return loading;
}

function resetInstance() {
  try {
    instance?.terminate();
  } catch {
    // already gone
  }
  instance = null;
}

/** Reads container/stream facts from ffmpeg's own `-i` log when mediabunny cannot open the file. */
export async function inspectWithFfmpeg(file: File, ctx?: EngineContext): Promise<MediaInfo> {
  const ff = await loadFFmpeg(ctx);
  const lines: string[] = [];
  const onLog = ({ message }: { message: string }) => {
    lines.push(message);
  };
  ff.on("log", onLog);
  try {
    const input = await mountInput(ff, file);
    await ff.exec(["-hide_banner", "-i", input.path]);
  } catch {
    // ffmpeg returns non-zero for "-i" without output; the log is what we want
  } finally {
    ff.off("log", onLog);
    // A probe run exits non-zero by design; the multithreaded core is not reliable after an error
    // exit, so drop the instance. The next load is served from the browser cache.
    resetInstance();
  }
  return parseProbeLog(lines, file);
}

export async function convertWithFfmpeg(
  file: File,
  plan: ConversionPlan,
  ctx: EngineContext,
  /** The source's facts: every sound track is kept, each copied or re-encoded (./convert-args). */
  source?: { info: MediaInfo; forceVideoTranscode: boolean },
): Promise<EngineResult> {
  const target = containerById.get(plan.target.id);
  const f = target?.ffmpeg;
  if (!target || !f)
    throw new EngineError("unsupported-output", `Cannot write ${plan.target.name}.`);
  const tracks = soundTracks(plan, source?.info, file.name, source?.forceVideoTranscode ?? false);
  assertOutputFits(
    convertedBytes(file, plan, source?.info),
    "MP4, MOV, MKV and WebM files converted to MP4, MOV, MKV or WebM are written straight to disk storage; convert to one of those, or trim the video first.",
  );
  // Re-encoded Matroska sound starts after its encoder delay, as FFmpeg 7+ plays it (./matroska-delay).
  const drops = looksMatroska(file, source?.info) ? await sampleDrops(file) : [];
  const wasmArgs = tracks.flatMap((t) =>
    !t.copy && (drops[t.index] ?? 0) > 0
      ? [`-filter:a:${t.index}`, dropStart(drops[t.index] ?? 0)]
      : [],
  );
  const result = await execFfmpeg({
    file,
    ctx,
    extension: target.extensions[0] ?? plan.target.id,
    mime: target.mime,
    filename: `${baseName(file.name)}.${target.extensions[0]}`,
    outputArgs: convertArgs({ ...plan, target }, tracks, source?.info.video),
    wasmArgs,
    progressLabel: "encoded",
    container: target.name,
    failureHint: "Try another output format.",
  });
  const meta = soundTracksMeta(tracks, f.audio);
  return meta ? { ...result, meta } : result;
}

/**
 * About how large a conversion's result will be: the input's size when the picture is copied, else
 * what libx264/libvpx write at their settings here (about 0.1 bit per pixel), never more than the
 * input for a re-encode from a heavier codec.
 */
function convertedBytes(file: File, plan: ConversionPlan, info?: MediaInfo): number {
  const v = info?.video;
  const d = info?.durationSec ?? 0;
  if (plan.copyVideo || !v || !(d > 0)) return file.size;
  const picture = (v.width * v.height * (v.fps > 0 ? v.fps : 30) * 0.1 * d) / 8;
  return Math.min(file.size * 1.5, picture + (192_000 / 8) * d);
}

/** Audio extraction (MP3 via libmp3lame, FLAC, AAC re-encodes, and any ffmpeg-only source). */
export async function extractAudioWithFfmpeg(
  file: File,
  plan: ExtractionPlan,
  options: VideoToAudioOptions,
  info: MediaInfo,
  ctx: EngineContext,
  /** What to suggest when ffmpeg fails; audio → audio passes its own. */
  failureHint = "Try another audio format, or trim the video first.",
): Promise<EngineResult> {
  const range = effectiveRange(info.durationSec, options);
  const filename = audioOutputName(file.name, plan.target.extension, range);
  const track = info.audio?.[0];
  const seconds = range ? range.end - range.start : info.durationSec;
  const perSecond = plan.target.lossless
    ? (plan.sampleRate ?? track?.sampleRate ?? 48_000) *
      (plan.channels ?? track?.channels ?? 2) *
      (/24/.test(plan.target.encode.ffmpeg) ? 3 : 2) *
      (plan.target.id === "flac" ? 0.6 : 1)
    : ((plan.bitrateKbps ?? (track?.bitrate ? track.bitrate / 1000 : 320)) * 1000) / 8;
  // M4A copies and WAV from files the native reader opens are written straight to disk storage.
  const native = /^(MP4|QuickTime|Matroska|WebM|MPEG Transport|Ogg|WAVE|MP3|FLAC|ADTS)/i.test(
    info.container,
  );
  assertOutputFits(
    perSecond * seconds,
    native
      ? "M4A (AAC copied as it is) and WAV are written straight to disk storage; choose one of those, or a part of the file."
      : "Choose a compressed format such as MP3, or a part of the file.",
  );
  // The plan already sets every rate an encoder needs (`encoderLimits`: Vorbis stops at 48 kHz).
  const outputArgs = withSoundEnd(ffmpegAudioArgs(plan, range), plan, info, range);
  // Matroska sound that FFmpeg 5.1 would play with its encoder delay (./matroska-delay).
  const drop = looksMatroska(file, info) ? ((await sampleDrops(file))[0] ?? 0) : 0;
  const result = await execFfmpeg({
    file,
    ctx,
    extension: plan.target.extension,
    mime: plan.target.mime,
    filename,
    outputArgs,
    wasmArgs: drop > 0 && !plan.copy ? ["-af", dropStart(drop)] : undefined,
    progressLabel: plan.copy ? "copied" : "encoded",
    container: plan.target.name,
    failureHint,
  });
  return track ? { ...result, meta: outputMeta(plan, track) } : result;
}

export interface FfmpegJob {
  file: File;
  ctx: EngineContext;
  /** Output file extension (also used for the scratch file name). */
  extension: string;
  mime: string;
  filename: string;
  /** Everything between `-i <input> -threads N` and `-y <output>`; also the command shown. */
  outputArgs: string[];
  /**
   * Arguments only ffmpeg.wasm (FFmpeg 5.1) needs, where local FFmpeg 7+ already does the right
   * thing (./matroska-delay): run, but left out of the command shown.
   */
  wasmArgs?: string[];
  progressLabel: string;
  /** Output format's display name, for failure messages ("MP4 cannot hold ..."). */
  container?: string;
  failureHint: string;
}

/**
 * Runs one ffmpeg command with pinned threads, real progress, cancellation and cleanup. Exported for
 * the runners that take over when the browser's own encoder cannot do a job (compress, ADR-0147).
 */
export async function execFfmpeg(job: FfmpegJob): Promise<EngineResult> {
  const { file, ctx } = job;
  const ff = await loadFFmpeg(ctx);
  if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");

  const outName = `output.${job.extension}`;
  // The input is mounted, not copied: ffmpeg reads it from the File as it goes (./mount).
  const input = await mountInput(ff, file);
  const inName = input.path;
  // Decoder threads are pinned to 1 (frame-threaded H.264 decoding deadlocks the WASM pool);
  // encoder threads to THREADS. Order matters: options before -i apply to the input.
  const args = [
    "-hide_banner",
    "-threads",
    "1",
    "-i",
    inName,
    "-threads",
    THREADS,
    ...(job.wasmArgs ?? []),
    ...job.outputArgs,
    "-y",
    outName,
  ];

  ctx.onProgress({ phase: "analyzing", ratio: 0, detail: "Reading the file" });
  // Enough of the log to hold the input description and the reason for a failure (./failures).
  const tail: string[] = [];
  const onLog = ({ message }: { message: string }) => {
    tail.push(message);
    if (tail.length > LOG_LINES) tail.shift();
  };
  ff.on("log", onLog);
  const onProgress = ({ progress }: { progress: number }) => {
    const ratio = Math.min(1, Math.max(0, progress));
    ctx.onProgress({
      phase: "processing",
      ratio,
      detail: `${Math.round(ratio * 100)}% ${job.progressLabel}`,
    });
  };
  const onAbort = () => {
    resetInstance();
  };
  ff.on("progress", onProgress);
  ctx.signal.addEventListener("abort", onAbort, { once: true });
  try {
    const code = await ff.exec(args);
    if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
    if (code !== 0) {
      resetInstance();
      throw ffmpegFailure(tail, code, { container: job.container, hint: job.failureHint });
    }
    const data = await ff.readFile(outName);
    const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
    ctx.onProgress({ phase: "finishing", ratio: 1, detail: "Writing the file" });
    return {
      blob: new Blob([bytes as BlobPart], { type: job.mime }),
      filename: job.filename,
      ffmpegCommand: `ffmpeg -i ${shellQuote(file.name)} ${job.outputArgs.map(shellArg).join(" ")} ${shellQuote(job.filename)}`,
    };
  } catch (e) {
    if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
    throw classifyError(e);
  } finally {
    ff.off("progress", onProgress);
    ff.off("log", onLog);
    ctx.signal.removeEventListener("abort", onAbort);
    if (instance) {
      await input.release();
      await ff.deleteFile(outName).catch(() => undefined);
    }
  }
}
