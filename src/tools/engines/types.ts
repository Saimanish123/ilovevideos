import type { Backend, EngineId } from "@/tools/registry/schema";

/** A file handed to an engine. `handle` is an OPFS file for large inputs; `file` for small ones. */
export interface MediaInput {
  file: File;
  /** Probed at drop time by the inspector; engines may rely on it. */
  info?: MediaInfo;
}

export interface MediaInfo {
  container: string;
  /**
   * Length from the file's first picture or sound to its end, in seconds. Every time a page shows or
   * an engine takes is from 0 at the file's start; add `startSec` for the source's own timestamps.
   */
  durationSec: number;
  /**
   * Source time of the file's start (the first picture or sound; AAC priming before zero does not
   * count): 1.445 s for a typical MPEG-TS, the offset of an MP4 written with one, 0 for most files.
   */
  startSec?: number;
  sizeBytes: number;
  video?: {
    codec: string;
    width: number;
    height: number;
    fps: number;
    bitrate?: number;
    rotation?: number;
    /** WebCodecs codec string, e.g. "avc1.42C01E" (profile and level encoded). Shown by the inspector. */
    codecString?: string;
    /** ISO 639 language code when the track declares one other than "und". */
    language?: string;
    /**
     * Presentation timestamps (s) of the key frames, ascending. Only filled when a tool asks for it at
     * inspection (`OptionsSpec.inspectKeyframes`), e.g. to show where a lossless cut can land.
     */
    keyframes?: number[];
    /**
     * False when this browser cannot decode the picture (WebCodecs `isConfigSupported` on the track's
     * own configuration, e.g. HEVC in Chrome without platform support): a re-encode then needs
     * ffmpeg.wasm. Undefined where it was not probed (no WebCodecs).
     */
    decodable?: boolean;
  };
  audio?: {
    codec: string;
    channels: number;
    sampleRate: number;
    bitrate?: number;
    codecString?: string;
    language?: string;
    /** The track's own title when the file names it ("Commentary", "English 5.1"). */
    name?: string;
    /** Marked as the track players pick by default. */
    default?: boolean;
    /** False when this browser cannot decode the sound (as `video.decodable`). */
    decodable?: boolean;
  }[];
  /** Subtitle tracks; for a subtitle file read on the page (`OptionsSpec.inspect`), one entry with its cue count. */
  subtitles?: {
    codec: string;
    language?: string;
    cues?: number;
    /** The container's track id (Matroska TrackNumber, MP4 track_ID), when a page read the tracks itself. */
    id?: number;
    /** 0-based among the file's subtitle tracks (ffmpeg's `0:s:N`). */
    index?: number;
    /** What the track holds: "srt", "ass", "vtt", "tx3g", "picture" or "other" (extract subtitles). */
    kind?: string;
    name?: string;
    default?: boolean;
    forced?: boolean;
  }[];
  /** Descriptive tags read from the container, when present. Carried over by tools that re-mux. */
  tags?: {
    title?: string;
    artist?: string;
    album?: string;
    description?: string;
    comment?: string;
    genre?: string;
    /** ISO 8601 string (a Date does not survive every worker boundary cleanly). */
    date?: string;
    /** Capture time from the MP4/MOV movie header (`mvhd`), ISO 8601. Not a tag, but removed the same way. */
    recordedAt?: string;
    /** Every raw tag key the container carries (MP4 `ilst`/`udta` atom names or QuickTime keys, Matroska SimpleTag names). */
    rawKeys?: string[];
    /** Where it was filmed, readable ("48.8584° N, 2.2945° E"), from `loci`, `©xyz` or the QuickTime location key. */
    location?: string;
    /** Device maker and model (`©mak`/`©mod` or QuickTime keys), when the file names them. */
    make?: string;
    model?: string;
    /** The software that wrote the file (`©too`, QuickTime software key). */
    software?: string;
  };
}

export type ProgressPhase = "loading" | "analyzing" | "processing" | "finishing";

export interface Progress {
  phase: ProgressPhase;
  /** 0–1. Must reflect real work, never a fake timer. */
  ratio: number;
  /** Human-readable, e.g. "Encoding frame 1,204 of 3,600". */
  detail?: string;
  /** Which input or output is being worked on (merge clip, split part), 0-based, for per-row status. */
  item?: { index: number; count: number };
}

/** One output file. Multi-output engines (split) return several of these in `EngineResult.files`. */
export interface EngineOutputFile {
  blob: Blob;
  filename: string;
  /** Facts for this file's row, e.g. "0:00–0:30 · 30.0 s". */
  meta?: string;
}

export interface EngineResult {
  /** The output. For multi-output engines this is the first file, and `files` lists all of them. */
  blob: Blob;
  filename: string;
  info?: MediaInfo;
  /** Equivalent ffmpeg command, shown to the user (feature L7). */
  ffmpegCommand?: string;
  /** Output facts for the result line, e.g. "480×270 · 36 frames" (real numbers, principles §1.7). */
  meta?: string;
  /**
   * Every output file, in order, when an engine writes more than one (split). Absent for single-output
   * engines; when present, `files[0]` is the same file as `blob`/`filename`.
   */
  files?: EngineOutputFile[];
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
  /**
   * `input` is the first input; multi-input engines (merge) also receive every input in `inputs`,
   * in the order the user arranged them.
   */
  supports(
    backend: Backend,
    input: MediaInput,
    options: Options,
    inputs?: MediaInput[],
  ): Promise<boolean>;
  run(
    backend: Backend,
    inputs: MediaInput[],
    options: Options,
    ctx: EngineContext,
  ): Promise<EngineResult>;
}
