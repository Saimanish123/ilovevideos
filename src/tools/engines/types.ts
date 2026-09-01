import type { Backend, EngineId } from "@/tools/registry/schema";

/** A file handed to an engine. `handle` is an OPFS file for large inputs; `file` for small ones. */
export interface MediaInput {
  file: File;
  /** Probed at drop time by the inspector; engines may rely on it. */
  info?: MediaInfo;
}

export interface MediaInfo {
  container: string;
  durationSec: number;
  sizeBytes: number;
  video?: {
    codec: string;
    width: number;
    height: number;
    fps: number;
    bitrate?: number;
    rotation?: number;
  };
  audio?: { codec: string; channels: number; sampleRate: number; bitrate?: number }[];
  subtitles?: { codec: string; language?: string }[];
}

export type ProgressPhase = "loading" | "analyzing" | "processing" | "finishing";

export interface Progress {
  phase: ProgressPhase;
  /** 0–1. Must reflect real work, never a fake timer. */
  ratio: number;
  /** Human-readable, e.g. "Encoding frame 1,204 of 3,600". */
  detail?: string;
}

export interface EngineResult {
  blob: Blob;
  filename: string;
  info?: MediaInfo;
  /** Equivalent ffmpeg command, shown to the user (feature L7). */
  ffmpegCommand?: string;
}

export interface EngineContext {
  signal: AbortSignal;
  onProgress: (p: Progress) => void;
}

/**
 * Every engine implements this. Options are validated with the engine's own zod schema.
 * `supports()` is called at runtime to pick the first backend that works in this browser.
 */
export interface Engine<Options> {
  id: EngineId;
  backends: Backend[];
  optionsSchema: import("zod").ZodType<Options>;
  supports(backend: Backend, input: MediaInput, options: Options): Promise<boolean>;
  run(
    backend: Backend,
    inputs: MediaInput[],
    options: Options,
    ctx: EngineContext,
  ): Promise<EngineResult>;
}
