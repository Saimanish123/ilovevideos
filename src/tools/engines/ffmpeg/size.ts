import { formatBytes } from "@/lib/format";

/**
 * Download size of the ffmpeg.wasm core (wasm + glue + worker, @ffmpeg/core-mt 0.12.10), the one
 * figure every page quotes. `tests/unit/ffmpeg-size.test.ts` checks it against the copied files.
 */
export const FFMPEG_CORE_BYTES = 32_849_385;

/**
 * The core's WebAssembly file alone (`ffmpeg-core.wasm`), the part a dropped connection cuts short:
 * every download of it is checked against this before it is compiled (workers/converter-download,
 * ADR-0147). `tests/unit/ffmpeg-size.test.ts` checks it against the copied file.
 */
export const FFMPEG_WASM_BYTES = 32_718_323;

/** "32.8 MB"-style size of the one-time ffmpeg download, formatted like every other size. */
export const ffmpegDownloadSize = (): string => formatBytes(FFMPEG_CORE_BYTES);
