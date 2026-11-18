/**
 * Audio delay / sync fix (E6): options and pure helpers, shared by the panel and the engine. Pure.
 *
 * `offsetMs` is the shift applied to the sound: positive plays it later (the sound came too early),
 * negative plays it earlier (the sound came too late, the usual lip-sync fault).
 */
import { z } from "zod";
import { shellQuote } from "@/lib/format";

export const MAX_OFFSET_MS = 10_000;

export const AudioSyncOptions = z.object({
  offsetMs: z.number().int().min(-MAX_OFFSET_MS).max(MAX_OFFSET_MS).default(-200),
});
export type AudioSyncOptions = z.infer<typeof AudioSyncOptions>;

/** Containers the shift writes as they are; anything else the browser reads becomes MP4. */
export type SyncContainer = "mp4" | "mov" | "mkv" | "webm";

/** How exact the shift is in a container: to the sample with an edit list, else to a sound frame. */
export const exactShift = (c: SyncContainer) => c === "mp4" || c === "mov";

/** "300 ms" / "1.25 s": the size of a shift in words. */
export function shiftWords(ms: number): string {
  const a = Math.abs(ms);
  return a < 1000 ? `${a} ms` : `${(a / 1000).toFixed(a % 100 === 0 ? 1 : 2)} s`;
}

/** The equivalent ffmpeg command: the same file read twice, the second one's sound offset. */
export function syncCommand(inputName: string, outputName: string, offsetMs: number): string {
  const s = (offsetMs / 1000).toFixed(3);
  const i = shellQuote(inputName);
  return `ffmpeg -i ${i} -itsoffset ${s} -i ${i} -map 0:v -map 1:a -c copy -shortest ${shellQuote(outputName)}`;
}
