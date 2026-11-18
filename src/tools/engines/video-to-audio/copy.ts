/**
 * Lossless audio copy: moves the encoded packets of the first audio track into an audio-only file
 * (M4A, MP3, FLAC, Ogg/Opus, WAV) without decoding them. The equivalent of `ffmpeg -vn -c:a copy`.
 *
 * The copy itself is the shared packet copy (../mediabunny/packet-copy): mediabunny's Conversion
 * re-encodes AAC that opens with a priming packet at a negative time, so it cannot be used. The
 * priming (or, for a range, one packet of decoder pre-roll) is kept and, in M4A, an edit list tells
 * players to skip it and to stop at the range end, as the source did. Other containers take the
 * packets whose middle falls inside the range (packets are about 20 ms).
 * Runs in the engine worker; no network access.
 */
import type { NativeAudioMuxer } from "@/content/formats/audio";
import { copyPrimaryAudio } from "../mediabunny/packet-copy";
import type { EngineContext, EngineResult } from "../types";

export interface AudioCopyJob {
  file: File;
  muxer: NativeAudioMuxer;
  mime: string;
  outputName: string;
  range?: { start: number; end: number };
  ffmpegCommand: string;
  ctx: EngineContext;
}

export async function copyAudioTrack(job: AudioCopyJob): Promise<EngineResult> {
  job.ctx.onProgress({ phase: "analyzing", ratio: 0, detail: "Reading the file" });
  const blob = await copyPrimaryAudio({
    file: job.file,
    to: job.muxer,
    range: job.range,
    ctx: job.ctx,
  });
  return {
    blob: new Blob([blob], { type: job.mime }),
    filename: job.outputName,
    ffmpegCommand: job.ffmpegCommand,
  };
}
