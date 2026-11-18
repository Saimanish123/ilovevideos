/**
 * The ffmpeg.wasm stages of the sound tools, on the page: decoding a source only ffmpeg reads (WMA,
 * AIFF) to 32-bit float WAV, and encoding the processed WAV to a format WebCodecs cannot write (MP3,
 * OGG Vorbis, AIFF, and AAC or FLAC where this browser has no encoder). ffmpeg never processes the
 * sound itself: the gain, fades and limiter all ran in the worker, so every path makes the same
 * samples. The original file is a second input so its tags and cover art carry over.
 * Page thread; ffmpeg.wasm runs in its own worker. Only our own /wasm/ assets are loaded.
 */
import { classifyError, EngineError } from "../errors";
import { FFMPEG_THREADS, loadFFmpeg } from "../ffmpeg";
import { ffmpegFailure } from "../ffmpeg/failures";
import { type MountedInput, mountInput } from "../ffmpeg/mount";
import type { EngineContext } from "../types";
import type { SoundTarget } from "./target";

interface Stage {
  inputs: { name: string; data: Blob }[];
  args: string[];
  output: string;
  ctx: EngineContext;
  span: [number, number];
  detail: string;
  hint: string;
  /** The output's display name for the failure sentence ("AIFF", "MP3"). */
  container?: string;
}

/** Log lines kept for the failure sentence: enough to reach the stream line and the cause. */
const LOG_LINES = 60;

async function exec(stage: Stage): Promise<Uint8Array> {
  const { ctx } = stage;
  const ff = await loadFFmpeg(ctx);
  if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
  const [lo, hi] = stage.span;
  const tail: string[] = [];
  const onLog = ({ message }: { message: string }) => {
    tail.push(message);
    if (tail.length > LOG_LINES) tail.shift();
  };
  const onProgress = ({ progress }: { progress: number }) => {
    const r = Math.min(1, Math.max(0, progress));
    ctx.onProgress({
      phase: "processing",
      ratio: lo + (hi - lo) * r,
      detail: `${stage.detail} · ${Math.round(r * 100)}%`,
    });
  };
  // Cancel: terminating the instance stops the run; the next load starts a fresh one.
  const onAbort = () => ff.terminate();
  ff.on("log", onLog);
  ff.on("progress", onProgress);
  ctx.signal.addEventListener("abort", onAbort, { once: true });
  // Inputs are mounted, not copied (../ffmpeg/mount): a 3-hour float WAV is 3.8 GB, which
  // `writeFile` could neither read ("File could not be read! Code=-1") nor hold in the WASM heap.
  const mounted: MountedInput[] = [];
  try {
    const paths = new Map<string, string>();
    for (const i of stage.inputs) {
      const file =
        i.data instanceof File && i.data.name === i.name ? i.data : new File([i.data], i.name);
      const m = await mountInput(ff, file);
      mounted.push(m);
      paths.set(i.name, m.path);
    }
    const code = await ff.exec([
      "-hide_banner",
      "-threads",
      "1",
      ...stage.args.map((a) => paths.get(a) ?? a),
      "-threads",
      FFMPEG_THREADS,
      "-y",
      stage.output,
    ]);
    if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
    if (code !== 0) {
      ff.terminate();
      throw ffmpegFailure(tail, code, { container: stage.container, hint: stage.hint });
    }
    const data = await ff.readFile(stage.output);
    return typeof data === "string" ? new TextEncoder().encode(data) : data;
  } catch (e) {
    if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
    throw classifyError(e);
  } finally {
    ff.off("log", onLog);
    ff.off("progress", onProgress);
    ctx.signal.removeEventListener("abort", onAbort);
    if (ff.loaded) {
      for (const m of mounted) await m.release();
      await ff.deleteFile(stage.output).catch(() => undefined);
    }
  }
}

const ext = (name: string) => name.split(".").pop()?.toLowerCase() ?? "bin";

/** The source's first sound track as 32-bit float WAV (for sources the browser cannot decode). */
export async function decodeToWav(
  file: File,
  ctx: EngineContext,
  span: [number, number],
): Promise<File> {
  const inName = `source.${ext(file.name)}`;
  const bytes = await exec({
    inputs: [{ name: inName, data: file }],
    args: ["-i", inName, "-map", "0:a:0", "-c:a", "pcm_f32le", "-f", "wav"],
    output: "decoded.wav",
    ctx,
    span,
    detail: "Decoding",
    hint: "Convert the file to WAV with the audio converter first.",
  });
  return new File([bytes as BlobPart], "decoded.wav", { type: "audio/wav" });
}

/**
 * The processed WAV encoded to the target format, with the original's tags and cover art. The
 * sound's sample rate and channels are kept as the WAV has them. `gainDb` is a plain scalar gain
 * applied on the way into the encoder (`volume`, in float): the correction for a lossy encoder's
 * level loss, measured on its first output (./page).
 */
export async function encodeFromWav(
  wav: Blob,
  original: File,
  target: Extract<SoundTarget, { kind: "audio" }>,
  ctx: EngineContext,
  span: [number, number],
  gainDb?: number,
  /**
   * Carry the original's picture as cover art (default). Off when the original is a video: its
   * picture is a moving stream, not a cover, and ffmpeg refuses it as an attached picture.
   */
  coverArt = true,
): Promise<Blob> {
  const origName = `original.${ext(original.name)}`;
  const outName = `output.${target.format.extension}`;
  // Cover art is a picture stream in MP3 and FLAC; keep it where the target holds one that way.
  const art =
    coverArt && ["mp3", "flac"].includes(target.format.id)
      ? ["-map", "1:v?", "-c:v", "copy", "-disposition:v", "attached_pic"]
      : [];
  const bytes = await exec({
    inputs: [
      { name: "processed.wav", data: wav },
      { name: origName, data: original },
    ],
    args: [
      "-i",
      "processed.wav",
      "-i",
      origName,
      "-map",
      "0:a:0",
      ...art,
      "-map_metadata",
      "1",
      ...(gainDb ? ["-af", `volume=${gainDb.toFixed(2)}dB`] : []),
      "-c:a",
      target.format.encode.ffmpeg,
      ...(target.bitrateKbps ? ["-b:a", `${target.bitrateKbps}k`] : []),
      ...(target.format.encode.args ?? []),
      "-f",
      target.format.ffmpegFormat,
    ],
    output: outName,
    ctx,
    span,
    detail: `Encoding ${target.format.name}`,
    container: target.format.name,
    hint: "Try again, or choose WAV with the audio converter afterwards.",
  });
  return new Blob([bytes as BlobPart], { type: target.format.mime });
}
