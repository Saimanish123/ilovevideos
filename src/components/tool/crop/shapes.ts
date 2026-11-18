import { hasRatio, type RatioId, ratioValue, type Size } from "@/tools/engines/crop/math";

/** Where each shape is used, short enough for a preset card. Common practice, not platform limits. */
export const shapeContext: Record<RatioId, string> = {
  free: "Any shape",
  "16:9": "YouTube, TV",
  "9:16": "Reels, Shorts, TikTok",
  "1:1": "Square post",
  "4:5": "Portrait post",
  "4:3": "Classic TV, iPad",
};

export const shapeOption = <T extends RatioId>(id: T) => ({
  value: id,
  label: id === "free" ? "Free" : id,
  context: shapeContext[id],
  ratio: ratioValue(id),
});

/**
 * Presets worth showing for this file: a shape the source already has would be a no-op, so it is
 * hidden, unless it is the current choice (a page preset), which stays visible so the state is honest.
 */
export function shapesFor<T extends RatioId>(ids: readonly T[], src: Size, current: T): T[] {
  return ids.filter((id) => {
    const r = ratioValue(id);
    return id === current || r === null || !hasRatio(src, r);
  });
}

/** "16:9" for a preset, otherwise the ratio as a decimal ("1.78:1"). */
export function shapeLabel(size: Size, preset?: RatioId): string {
  if (preset && preset !== "free") return preset;
  return size.height > 0 ? `${(size.width / size.height).toFixed(2)}:1` : "";
}
