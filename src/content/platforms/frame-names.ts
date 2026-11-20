import type { FramePlatformId } from "./frames";

/**
 * Each frame platform's name as the platform writes it: the one definition, which the profiles in
 * ./frames.ts take their `name` from. Apart from the profiles so the resize drop prompt can name the
 * platform without carrying its specs and sources into a page's first load (ADR-0140).
 */
export const framePlatformNames: Record<FramePlatformId, string> = {
  tiktok: "TikTok",
  "instagram-reels": "Instagram Reels",
  "youtube-shorts": "YouTube Shorts",
  youtube: "YouTube",
  facebook: "Facebook",
};

/** The platform's name when `id` is a frame platform (a resize-for page's preset), else undefined. */
export const framePlatformName = (id: unknown): string | undefined =>
  typeof id === "string" && id in framePlatformNames
    ? framePlatformNames[id as FramePlatformId]
    : undefined;
