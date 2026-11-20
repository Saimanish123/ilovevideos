import type { EngineId } from "@/tools/registry/schema";

/**
 * Engines whose page runner (./page-runners) does every job the engine does, with every option, on
 * ffmpeg.wasm (ADR-0147). When this browser cannot run the native engine for a file and options
 * (no WebCodecs, or no encoder for the codec the output needs), the run goes there instead of being
 * refused: slower, and the converter is a one-time download, but the file is made. Kept apart from
 * ./page-runners so a page can ask without loading any runner.
 *
 * Measured speeds are in DECISIONS.md (ADR-0147). Engines not listed say before the user starts that
 * this browser cannot do the job, and name one that can.
 */
export const fallbackEngines: ReadonlySet<EngineId> = new Set<EngineId>([
  "compress",
  "convert-video",
  "convert-audio",
  "video-to-audio",
  "video-to-gif",
  "aspect-ratio",
  "crop",
  "filter",
  "framerate",
  "pad",
  "video-fade",
  "gif-to-video",
]);

/** Whether ffmpeg.wasm can start here: threads need SharedArrayBuffer on a cross-origin isolated page. */
export function ffmpegCanStart(): boolean {
  return (
    typeof SharedArrayBuffer !== "undefined" &&
    typeof crossOriginIsolated !== "undefined" &&
    crossOriginIsolated &&
    typeof WebAssembly !== "undefined"
  );
}

/** True when a run this browser cannot do natively can go to the engine's ffmpeg.wasm runner. */
export const canFallBack = (engine: EngineId): boolean =>
  fallbackEngines.has(engine) && ffmpegCanStart();
