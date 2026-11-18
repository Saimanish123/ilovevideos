/**
 * What a `UnitField` commits when it loses focus or Enter is pressed: the typed number, rounded to
 * the field's decimals and held between `min` and `max`, or nothing at all. Nothing when the text is
 * empty or not a number (the field then shows its value again), and nothing when the text is the
 * value already shown: tabbing through a field, or focus landing in it, must not change the job
 * (design review 2026-11-18: tabbing through the ringtone's start moved the part). Pure.
 */
export function unitCommit(
  typed: string,
  shown: string,
  o: { min: number; max: number; decimals: number },
): number | undefined {
  const text = typed.trim();
  if (text === "" || text === shown.trim()) return undefined;
  const n = Number(text);
  if (!Number.isFinite(n)) return undefined;
  const k = 10 ** o.decimals;
  return Math.min(o.max, Math.max(o.min, Math.round(n * k) / k));
}
