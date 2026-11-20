/** Largest difference the Before/After switch evens out; beyond it the result is not a version of the source's sound. */
export const MAX_MATCH_DB = 20;

/**
 * Gains (linear, at most 1) that play the source and the result at the same integrated loudness, by
 * turning the louder one down, so a switch between them compares the sound, not its level (a
 * louder version always sounds "better"). Undefined when either is unmeasurable (silence) or they
 * differ by more than `MAX_MATCH_DB`.
 */
export function loudnessGains(
  beforeLufs: number,
  afterLufs: number,
): { before: number; after: number } | undefined {
  if (!Number.isFinite(beforeLufs) || !Number.isFinite(afterLufs)) return undefined;
  const diff = beforeLufs - afterLufs;
  if (Math.abs(diff) > MAX_MATCH_DB) return undefined;
  const down = (db: number) => 10 ** (-db / 20);
  return diff > 0 ? { before: down(diff), after: 1 } : { before: 1, after: down(-diff) };
}
