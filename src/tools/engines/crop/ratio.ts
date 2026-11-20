/**
 * The preset frame shapes of the crop and aspect-ratio engines, apart from the geometry in ./math.ts
 * (which re-exports them) so the aspect-ratio drop prompt can check a shape without carrying the
 * geometry into every tool page's first load (ADR-0140).
 */

/** Shapes offered as presets. "free" means no lock. */
export const ratioIds = ["free", "16:9", "9:16", "1:1", "4:5", "4:3"] as const;
export type RatioId = (typeof ratioIds)[number];
export type FixedRatioId = Exclude<RatioId, "free">;
export const fixedRatioIds = ratioIds.filter((r): r is FixedRatioId => r !== "free");

/** width / height for a preset, or null for free. */
export function ratioValue(id: RatioId): number | null {
  if (id === "free") return null;
  const [w, h] = id.split(":").map(Number);
  return w && h ? w / h : null;
}
