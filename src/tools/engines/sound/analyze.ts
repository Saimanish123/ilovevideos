/**
 * One decoding pass over a file's sound that measures what the sound tools show and use: EBU R128
 * integrated loudness with sample and true peak (./dsp/loudness), and the level of every 10 ms window
 * for silence detection (./dsp/silence). The panels run it in the analysis worker before a job; the
 * engines run it again inside their own job, so a batch file or a stale reading never decides a gain.
 * Runs in a worker. No network access (README.md#privacy-and-processing §2).
 */
import { EngineError } from "../errors";
import { openInput } from "../mediabunny/shared";
import { LoudnessMeter, type LoudnessResult } from "./dsp/loudness";
import { LevelWindows } from "./dsp/silence";
import { pacedRatio } from "./pace";
import { openSound, readSound } from "./reader";

export interface SoundAnalysis {
  loudness: LoudnessResult;
  /** dBFS per 10 ms window from the sound's zero; empty unless asked for. */
  levels: Float32Array;
  /** Seconds of sound. */
  duration: number;
  sampleRate: number;
  channels: number;
}

export interface AnalyzeOptions {
  levels?: boolean;
  /** Skip the true peak (the slowest part) when only levels are wanted. */
  truePeak?: boolean;
  signal?: AbortSignal;
  onProgress?: (ratio: number) => void;
}

export const noSoundError = () =>
  new EngineError(
    "unsupported-input",
    "This file has no sound track, so there is nothing to measure.",
    "Choose a file with sound.",
  );

/** Measures `file`'s primary sound track. Throws `noSoundError` when there is none. */
export async function analyzeSound(
  file: Blob,
  name: string,
  o: AnalyzeOptions = {},
): Promise<SoundAnalysis> {
  const named = file instanceof File ? file : new File([file], name);
  // The engines' own reader (FLAC with its short-last-frame source, Matroska delays known).
  const input = openInput(named);
  try {
    const src = await openSound(input, named);
    if (!src) throw noSoundError();
    if (!(await src.track.canDecode()))
      throw new EngineError(
        "unsupported-input",
        "This browser cannot decode the sound in this file.",
        "Convert it to WAV or M4A with the audio converter first.",
      );
    const meter = new LoudnessMeter(src.sampleRate, src.channels, o.truePeak !== false);
    const windows = o.levels ? new LevelWindows(src.sampleRate) : undefined;
    const total = Math.max(1e-6, src.end - src.origin);
    let channels = src.channels;
    const progress = pacedRatio(o.onProgress);
    for await (const block of readSound(src, src.origin, src.end, o.signal)) {
      if (block.planes.length !== channels) channels = block.planes.length;
      meter.push(block.planes, block.frames);
      windows?.push(block.planes, block.frames);
      progress?.(Math.min(1, (block.time + block.frames / src.sampleRate - src.origin) / total));
    }
    if (o.signal?.aborted) throw new EngineError("cancelled", "Cancelled.");
    return {
      loudness: meter.result(),
      levels: windows?.finish() ?? new Float32Array(0),
      duration: total,
      sampleRate: src.sampleRate,
      channels,
    };
  } finally {
    input.dispose();
  }
}
