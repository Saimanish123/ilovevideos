import { ratioValue } from "../crop/ratio";

/**
 * The frame shapes the aspect-ratio engine writes, without the options schema, so the idle UI (the
 * shape picker on a page before any file) does not carry zod into the page's first load.
 * `options.ts` re-exports these; they are the one definition.
 */
export const aspectRatioIds = ["16:9", "9:16", "1:1", "4:5", "4:3"] as const;
export type AspectRatioId = (typeof aspectRatioIds)[number];

export const aspectNumber = (id: AspectRatioId) => ratioValue(id) ?? 1;
