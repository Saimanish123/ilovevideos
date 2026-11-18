/**
 * Trim planning shared by the options panel (summary line) and the engine (the actual cut), so the
 * page says exactly where a lossless trim starts (principles: one source of truth per fact).
 * Pure: no DOM, no mediabunny.
 */
import { formatTimecode } from "@/lib/format";

const EPS = 1e-6;

/**
 * Where a lossless trim really starts: the last key frame at or before `start`. When no key frame
 * lies at or before it (the file's own start, or no list), the requested start stands.
 * `keyframes` ascending, as `MediaInfo.video.keyframes`.
 */
export function losslessStart(start: number, keyframes: readonly number[] | undefined): number {
  if (!keyframes || keyframes.length === 0) return start;
  let lo = 0;
  let hi = keyframes.length - 1;
  if ((keyframes[0] ?? 0) > start + EPS) return start;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((keyframes[mid] ?? 0) <= start + EPS) lo = mid;
    else hi = mid - 1;
  }
  return keyframes[lo] ?? start;
}

/** True when a lossless start differs visibly (by a hundredth or more) from the time asked for. */
export const startMoved = (asked: number, actual: number) => Math.abs(asked - actual) >= 0.005;

/** Summary and result wording for where the cut starts, e.g. "Starts at 0:01.00, the key frame before 0:01.20". */
export function startNote(asked: number, actual: number): string {
  return startMoved(asked, actual)
    ? `Starts at ${formatTimecode(actual)}, the key frame before ${formatTimecode(asked)}`
    : `Starts at ${formatTimecode(actual)}, on a key frame`;
}
