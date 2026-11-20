/**
 * Platform frame specs for the resize-for-platform family (README.md#feature-catalog D2 and K,
 * ADR-0011, ADR-0015). One profile per platform surface, facts only; the page story lives in
 * `src/tools/registry/tools/resize-platforms.ts`. Kept apart from the upload-limit profiles in
 * ./index.ts because the facts differ (shape and pixel size, not megabytes).
 *
 * Every number was read on the platform's own help or ads-spec page on the date in `checked`. A
 * platform whose frame spec could not be read from a primary source is not in this file. Where the
 * platform names a minimum but no size, `cap` is our choice and the profile says so in `capNote`.
 */
import type { AspectRatioId } from "@/tools/engines/aspect-ratio/options";
import { framePlatformNames } from "./frame-names";
import type { PlatformSource } from "./index";

export type FramePlatformId =
  | "tiktok"
  | "instagram-reels"
  | "youtube-shorts"
  | "youtube"
  | "facebook";

export interface FrameProfile {
  id: FramePlatformId;
  /** As the platform writes it. */
  name: string;
  /** The shape selected with zero interaction. */
  ratio: AspectRatioId;
  /** Other shapes the platform's own page names for this surface, offered as a choice. */
  alsoRatios?: AspectRatioId[];
  /** The largest frame the page writes; a bigger source is scaled down to it, a smaller one is never enlarged. */
  cap: { width: number; height: number };
  /** Where the cap comes from, one sentence. */
  capNote: string;
  /** Longest clip the surface takes, in seconds, when the platform states one for this surface. */
  maxSec?: number;
  /** Lowest frame rate the platform asks for, when it states one. */
  minFps?: number;
  /** Shortest edge the platform asks for, in pixels, when it states one. */
  minEdge?: number;
  /** Share of the frame the platform's interface covers, from its own safe-zone guidance. */
  safeZone?: { top: number; bottom: number; sides: number };
  sources: FrameSource[];
}

/** A primary source with its own anchor text, so two sources of one platform never read the same. */
export interface FrameSource extends PlatformSource {
  title: string;
}

export const FRAMES_CHECKED = "2026-09-30";

export const framePlatforms: Record<FramePlatformId, FrameProfile> = {
  tiktok: {
    id: "tiktok",
    name: framePlatformNames.tiktok,
    ratio: "9:16",
    cap: { width: 1080, height: 1920 },
    capNote:
      "TikTok's ad spec sets a minimum of 540×960 and no maximum; 1080×1920 is this page's ceiling, the full-HD size of a phone screen.",
    minEdge: 540,
    sources: [
      {
        title: "TikTok Ads Manager: In-Feed ad specifications",
        url: "https://ads.tiktok.com/help/article/tiktok-auction-in-feed-ads",
        checked: FRAMES_CHECKED,
        says: "Vertical (recommended): 9:16, more than or equal to 540*960px. Horizontal: 16:9, more than or equal to 960*540px. Square: 1:1, more than or equal to 640*640px. File formats: .mp4, .mov, .mpeg, .3gp, .avi. Duration (ads): up to 10 minutes. File size (ads): less than or equal to 500 MB.",
      },
    ],
  },
  "instagram-reels": {
    id: "instagram-reels",
    name: framePlatformNames["instagram-reels"],
    ratio: "9:16",
    cap: { width: 1440, height: 2560 },
    capNote: "1440×2560 is the resolution Meta's ads guide recommends for Reels.",
    minFps: 30,
    minEdge: 720,
    safeZone: { top: 0.14, bottom: 0.35, sides: 0.06 },
    sources: [
      {
        title: "Instagram Help Centre: reel size and aspect ratios",
        url: "https://www.facebook.com/help/1038071743007909",
        checked: FRAMES_CHECKED,
        says: "You can upload a reel with an aspect ratio between 1.91:1 and 9:16. Reels should have a minimum frame rate of 30 FPS (frames per second) and minimum resolution of 720 pixels.",
      },
      {
        title: "Meta Ads Guide: Instagram Reels video",
        url: "https://www.facebook.com/business/ads-guide/update/video/instagram-reels",
        checked: FRAMES_CHECKED,
        says: "Aspect ratio 9:16. Resolution 1440 x 2560 pixels. Consider leaving at least 14% of the top, 35% of the bottom, and 6% on each side of your asset free from text, logos, or other important creative elements.",
      },
    ],
  },
  "youtube-shorts": {
    id: "youtube-shorts",
    name: framePlatformNames["youtube-shorts"],
    ratio: "9:16",
    alsoRatios: ["1:1"],
    cap: { width: 1080, height: 1920 },
    capNote: "YouTube says Shorts upload at a maximum resolution of 1080p.",
    maxSec: 180,
    sources: [
      {
        title: "YouTube Help: upload YouTube Shorts",
        url: "https://support.google.com/youtube/answer/12779649",
        checked: FRAMES_CHECKED,
        says: "Upload YouTube Shorts: up to 3 minutes, with a square or vertical aspect ratio.",
      },
      {
        title: "YouTube Help: get started creating Shorts",
        url: "https://support.google.com/youtube/answer/10059070",
        checked: FRAMES_CHECKED,
        says: "YouTube's Shorts creation tools makes it easy to create short-form videos that are up to 3 minutes long. You can upload Short videos with a maximum resolution of 1080p.",
      },
    ],
  },
  youtube: {
    id: "youtube",
    name: framePlatformNames.youtube,
    ratio: "16:9",
    cap: { width: 7680, height: 4320 },
    capNote:
      "YouTube lists 16:9 sizes from 426×240 up to 7680×4320, so your video's own resolution is kept.",
    sources: [
      {
        title: "YouTube Help: video resolution and aspect ratios",
        url: "https://support.google.com/youtube/answer/6375112",
        checked: FRAMES_CHECKED,
        says: "The standard aspect ratio for YouTube on a computer is 16:9. 2160p 3840x2160, 1440p 2560x1440, 1080p 1920x1080, 720p 1280x720, 480p 854x480, 360p 640x360, 240p 426x240 (and 4320p 7680x4320). For some video and device aspect ratios like 9:16 vertical videos on computer browsers, YouTube may add more padding for optimal viewing.",
      },
    ],
  },
  facebook: {
    id: "facebook",
    name: framePlatformNames.facebook,
    ratio: "4:5",
    cap: { width: 1440, height: 1800 },
    capNote: "1440×1800 is the resolution Meta's ads guide recommends for Facebook Feed video.",
    sources: [
      {
        title: "Meta Ads Guide: Facebook Feed video",
        url: "https://www.facebook.com/business/ads-guide/update/video/facebook-feed",
        checked: FRAMES_CHECKED,
        says: "Aspect ratio 4:5. Resolution 1440 x 1800 pixels. Minimum width 120 pixels, minimum height 120 pixels. Video duration 1 second to 241 minutes. Maximum file size 4GB. MP4, MOV or GIF, H.264 compression, stereo AAC audio at 128kbps or higher.",
      },
    ],
  },
};

export function getFramePlatform(id: unknown): FrameProfile | undefined {
  return typeof id === "string" && id in framePlatforms
    ? framePlatforms[id as FramePlatformId]
    : undefined;
}

/** The frame the page writes at a shape: the cap, turned to that shape along its long side. */
export function capFor(p: FrameProfile, ratio: AspectRatioId): { width: number; height: number } {
  if (ratio === p.ratio) return p.cap;
  const long = Math.max(p.cap.width, p.cap.height);
  const [w, h] = ratio.split(":").map(Number) as [number, number];
  const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);
  // Square keeps the short edge (1080 for a 1080×1920 cap), so a Short stays at 1080p.
  if (w === h) {
    const short = Math.min(p.cap.width, p.cap.height);
    return { width: short, height: short };
  }
  return w > h
    ? { width: long, height: even((long * h) / w) }
    : { width: even((long * w) / h), height: long };
}

/** Frames this large are not a real ceiling: the page keeps the video's own resolution. */
export const keepsOwnResolution = (p: FrameProfile) => p.cap.width * p.cap.height >= 3840 * 2160;

/** "1080×1920", or "your video's own resolution" when the ceiling is 4K or more (YouTube). */
export function sizeLabel(p: FrameProfile, ratio: AspectRatioId): string {
  if (keepsOwnResolution(p)) return "your video's own resolution";
  const c = capFor(p, ratio);
  return `${c.width}×${c.height}`;
}
