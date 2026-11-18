import type { z } from "zod";
import {
  capFor,
  type FramePlatformId,
  framePlatforms,
  sizeLabel,
} from "@/content/platforms/frames";
import type { FaqItem, ToolInput } from "../schema";

/**
 * Resize for a platform (README.md#feature-catalog D2 and K; "resize" means shape, ADR-0011). Each page
 * is the aspect-ratio engine with the platform's shape, its size ceiling and, for Shorts, its length
 * limit locked in, so zero interaction writes a file the platform shows full frame. Frame facts come
 * from `src/content/platforms/frames.ts` (primary sources, dated); the story is hand-written per page.
 * Platforms whose frame spec could not be read from their own pages have no page.
 */
interface ResizePageSpec {
  platform: FramePlatformId;
  keywords: string[];
  aliases?: string[];
  related: string[];
  subtitle: string;
  metaTitle: string;
  metaDescription: string;
  what: string;
  /** Platform-specific paragraphs (>= 3), the first one with the dated facts. */
  story: string[];
  faq: z.infer<typeof FaqItem>[];
  updatedAt: string;
}

function resizeTool(spec: ResizePageSpec): ToolInput {
  const p = framePlatforms[spec.platform];
  const size = capFor(p, p.ratio);
  return {
    slug: `resize-video-for-${p.id}`,
    engine: "aspect-ratio",
    category: "platform",
    family: "resize-platform",
    phase: "p1",
    backends: ["webcodecs", "ffmpeg-wasm"],
    accepts: ["video"],
    produces: "video",
    presetOptions: {
      ratio: p.ratio,
      maxWidth: size.width,
      maxHeight: size.height,
      ...(p.maxSec === undefined ? {} : { maxSec: p.maxSec }),
      platform: p.id,
    },
    keywords: spec.keywords,
    aliases: spec.aliases ?? [],
    related: [...new Set([...spec.related, "change-video-aspect-ratio", "crop-video"])],
    sources: p.sources.map((s) => ({
      title: s.title,
      url: s.url,
      checked: s.checked,
    })),
    updatedAt: spec.updatedAt,
    icon: "ratio",
    illustration: "aspect-ratio",
    content: {
      en: {
        title: `Resize video for ${p.name}`,
        subtitle: spec.subtitle,
        metaTitle: spec.metaTitle,
        metaDescription: spec.metaDescription,
        action: "Resize",
        what: spec.what,
        steps: [
          "Drop the video onto the page or choose it from your device.",
          `The target is already set to ${p.ratio} at ${sizeLabel(p, p.ratio)}; the frame on the preview shows what will be kept.`,
          "Keep the suggested fit or switch between Crop to fill and Add bars, and drag the window to choose what stays.",
          "Press Resize, watch the frames being encoded, then download the MP4.",
        ],
        goodToKnow: spec.story,
        faq: spec.faq,
      },
    },
  };
}

const specs: ResizePageSpec[] = [
  {
    platform: "tiktok",
    keywords: [
      "resize video for tiktok",
      "tiktok video size",
      "make video 9:16 for tiktok",
      "tiktok aspect ratio",
      "fit video to tiktok",
    ],
    aliases: ["tiktok", "9:16"],
    related: [
      "resize-video-for-youtube-shorts",
      "resize-video-for-instagram-reels",
      "compress-video",
    ],
    updatedAt: "2026-09-30",
    subtitle:
      "Make a video 9:16 at up to 1080×1920 for TikTok, with bars or a crop. Runs in your browser.",
    metaTitle: "Resize video for TikTok 9:16, free, no upload",
    metaDescription:
      "Fit any video to TikTok's 9:16 frame at up to 1080×1920. Crop to fill or add bars and see it on the picture first. Runs in your browser. Free.",
    what: "This page makes a video the shape TikTok shows full screen: 9:16, at most 1080×1920. Choose whether the picture fills the frame with its sides cropped, or stays whole with bars, and see it on the preview before anything is encoded. The video is re-encoded once to H.264 on your device.",
    story: [
      "What TikTok asks for, checked 2026-09 on its ads help centre: vertical 9:16 is the recommended shape, at least 540×960; horizontal 16:9 needs at least 960×540 and square 1:1 at least 640×640; in-feed ads run up to 10 minutes and 500 MB, as MP4, MOV, MPEG, 3GP or AVI. Those two figures are for ads; limits for ordinary posts are not quoted here. TikTok names no largest size, so this page stops at 1080×1920, the full-HD phone frame: a 4K clip is scaled down to it, and a smaller clip keeps its own pixels rather than being enlarged.",
      "A landscape clip has two honest options. Add bars keeps the whole picture as a band across the middle of the phone, about a third of the screen's height. Crop to fill uses the whole screen but keeps a window only 606 pixels wide out of a 1920×1080 source, under a third of the width, which works for one person talking to the camera and badly for a group or a wide shot. The page suggests bars for landscape sources and a fill for phone footage that is already close to vertical; one tap switches.",
      "TikTok draws its own interface over the video: the caption and sound name along the bottom, and the like, comment and share buttons down the right-hand edge. When you crop to fill, drag the window so faces and on-screen text sit in the upper middle of the frame, clear of both. With bars the picture already sits in the middle band, away from most of the buttons.",
      "If the 9:16 file is large for a slow connection, [compress video](/compress-video) brings it down at a size you choose; for an ad, TikTok's in-feed limit is 500 MB. For a clip that only needs different framing rather than a fixed shape, [crop video](/crop-video) draws a free rectangle instead.",
    ],
    faq: [
      {
        q: "What size is a TikTok video?",
        a: "9:16 is the shape TikTok recommends, at least 540×960 per its ads specifications. 1080×1920 is the usual full-HD size and the largest this page writes.",
      },
      {
        q: "Should I crop my video or add bars for TikTok?",
        a: "Crop when the subject stays in a narrow vertical strip, such as one person speaking. Add bars when the whole width matters, such as a landscape scene, a screen recording or a group.",
      },
      {
        q: "Can I post a landscape video to TikTok without resizing it?",
        a: "Yes, TikTok accepts 16:9 from 960×540 and adds bars itself. Resizing first lets you choose the crop or the bar colour instead of leaving it to the app.",
      },
      {
        q: "Will TikTok compress my video again?",
        a: "Yes, TikTok re-encodes uploads for streaming. A clean 1080×1920 file gives its encoder the best start; a larger frame gains nothing on a phone screen.",
      },
      {
        q: "Is my video uploaded to resize it?",
        a: "No. It is reshaped and encoded inside this browser tab; the only upload is the one you make to TikTok.",
      },
    ],
  },
  {
    platform: "instagram-reels",
    keywords: [
      "resize video for instagram reels",
      "instagram reels size",
      "reels aspect ratio",
      "make video 9:16 for instagram",
      "resize video for instagram",
    ],
    aliases: ["instagram", "reels", "ig"],
    related: ["resize-video-for-tiktok", "resize-video-for-facebook", "compress-video"],
    updatedAt: "2026-09-30",
    subtitle:
      "Make a video 9:16 for Reels at up to 1440×2560, cropped or with bars. Runs in your browser.",
    metaTitle: "Resize video for Instagram Reels (9:16), free",
    metaDescription:
      "Fit a video to Instagram's 9:16 Reels frame, up to the 1440×2560 Meta recommends. Crop to fill or add bars in your browser. Nothing is uploaded.",
    what: "This page reshapes a video for Instagram Reels: 9:16, up to 1440×2560, the size Meta's ads guide recommends. It draws the frame on your picture before encoding, lets you fill it or keep everything with bars, and points out what Instagram asks for that the clip lacks, such as a frame rate under 30 fps.",
    story: [
      "What Instagram asks for, checked 2026-09: its help centre says a reel can be any shape from 1.91:1 to 9:16, with at least 30 frames per second and at least 720 pixels. Meta's ads guide for Reels recommends 9:16 at 1440×2560 and advises keeping 14% at the top, 35% at the bottom and 6% at each side free of text and logos. This page writes 9:16 with 1440×2560 as its ceiling; a source with fewer pixels keeps them rather than being enlarged, so a 1080p phone clip comes out 1080×1920.",
      "The bottom third of a reel is where Instagram puts the caption, the audio line and the account name, and the right edge carries the like, comment and share buttons. That is what the 35% bottom margin in Meta's guide is for. When you crop to fill, keep faces and text in the upper half of the kept window; the panel repeats the margins while you frame the shot.",
      "Reels accept wider shapes than 9:16, but in the full-screen viewer anything else plays smaller with bars or gets cropped, and the profile grid shows a crop around the middle of every reel. Making the video 9:16 before posting means you choose what is cut, and keeping the subject near the centre lets it survive both the viewer and the grid.",
      "Instagram asks for at least 30 fps, and a 24 or 25 fps film-style clip is not converted here: the frame rate is kept and the panel says so, because invented in-between frames look worse than a slightly lower rate. AAC sound is copied untouched. If the finished reel is slow to upload, [compress video](/compress-video) makes it smaller at a size you choose.",
    ],
    faq: [
      {
        q: "What is the best size for an Instagram reel?",
        a: "9:16. Meta's ads guide recommends 1440×2560; 1080×1920 from a phone also fills the screen. Instagram's help asks for at least 720 pixels and 30 fps.",
      },
      {
        q: "Why is my reel cropped on my profile grid?",
        a: "The grid shows each reel as a crop around its middle. Keep the subject centred and it reads in the full-screen viewer and the grid alike.",
      },
      {
        q: "Can a 16:9 video be a reel?",
        a: "Instagram accepts shapes down to 1.91:1, but a wide clip plays small with bars in the full-screen viewer. Resizing to 9:16 puts the choice between bars and a crop in your hands.",
      },
      {
        q: "Does Instagram compress reels after upload?",
        a: "Yes, uploads are re-encoded for streaming. A clean 9:16 file at the recommended size gives that step the most to work with.",
      },
      {
        q: "Is the video uploaded here?",
        a: "No. It is reshaped on your device; nothing leaves the browser tab until you post it.",
      },
    ],
  },
  {
    platform: "youtube-shorts",
    keywords: [
      "resize video for youtube shorts",
      "youtube shorts size",
      "youtube shorts aspect ratio",
      "make video vertical for shorts",
      "convert video to youtube short",
    ],
    aliases: ["shorts", "youtube short"],
    related: [
      "resize-video-for-youtube",
      "resize-video-for-tiktok",
      "resize-video-for-instagram-reels",
      "resize-video-for-facebook",
      "trim-video",
      "cut-video-into-shorts",
    ],
    updatedAt: "2026-09-30",
    subtitle:
      "Make a video 9:16 or square for Shorts, up to 1080p and 3 minutes. Runs in your browser.",
    metaTitle: "Resize video for YouTube Shorts, no upload",
    metaDescription:
      "Turn a video into a YouTube Short: 9:16 or square, up to 1080×1920, first 3:00 kept when it is longer. Runs in your browser. Free, no account.",
    what: "This page turns a video into something YouTube counts as a Short: a vertical or square frame, at most 1080p, no longer than three minutes. It crops or adds bars to reach the shape, scales down anything above 1080p, and when the clip runs past 3:00 it offers to keep only the first three minutes.",
    story: [
      "What YouTube asks for, checked 2026-09 on its help centre: a video uploaded with a square or vertical aspect ratio and up to 3 minutes long is a Short, and Shorts upload at a maximum resolution of 1080p. That gives two shapes, 9:16 and 1:1, and a ceiling of 1080×1920 for vertical or 1080×1080 for square. A source smaller than that keeps its own pixels rather than being enlarged.",
      "Length decides as much as shape: a vertical upload longer than three minutes is not a Short. When your clip is longer, the Length control keeps the first 3:00 by default; choose All to keep everything and publish a regular video instead, or [trim the video](/trim-video) first to pick which three minutes to keep.",
      "Square is worth choosing for a landscape clip you do not want to crop hard. Cropping 16:9 to 1:1 keeps 56% of the width, against 32% for 9:16, and the Shorts player shows a square video with bars above and below. Vertical fills the screen and is the shape the Shorts feed is built around.",
      "Shorts are often [cut from a longer landscape video](/cut-video-into-shorts): choose Crop to fill, drag the window over the subject and scrub the filmstrip under the preview to check it stays inside for the whole clip. The picture is re-encoded once to H.264, and the sound is copied when it is AAC.",
    ],
    faq: [
      {
        q: "What aspect ratio does a YouTube Short need?",
        a: "Square or vertical, per YouTube's help. 9:16 fills a phone screen; 1:1 plays with bars above and below.",
      },
      {
        q: "How long can a YouTube Short be?",
        a: "Up to 3 minutes. A longer vertical video is published as a regular one, so this page keeps the first 3:00 unless you choose to keep all of it.",
      },
      {
        q: "What resolution should a Short be?",
        a: "YouTube takes Shorts up to 1080p, which is 1080×1920 for vertical. A 4K source is scaled down to that, and a smaller one is never enlarged.",
      },
      {
        q: "Can a landscape video become a Short?",
        a: "Yes. Crop it to fill and drag the kept window over the subject, or keep the whole picture with bars. Square keeps more of a wide shot than 9:16 does.",
      },
      {
        q: "Is anything uploaded while it is resized?",
        a: "No. The video is reshaped and, when needed, shortened in your browser; the upload to YouTube is yours to make.",
      },
    ],
  },
  {
    platform: "youtube",
    keywords: [
      "resize video for youtube",
      "youtube video size",
      "make vertical video 16:9",
      "youtube aspect ratio",
      "convert vertical video to horizontal",
    ],
    aliases: ["youtube", "16:9", "landscape"],
    related: [
      "resize-video-for-youtube-shorts",
      "resize-video-for-facebook",
      "rotate-video",
      "extract-frame-from-video",
      "compress-video",
    ],
    updatedAt: "2026-09-30",
    subtitle:
      "Make a vertical or square video 16:9 for YouTube, with bars or a crop. Runs in your browser.",
    metaTitle: "Resize video for YouTube 16:9, free, no upload",
    metaDescription:
      "Turn a vertical or square clip into a 16:9 YouTube video with bars or a crop, at its own resolution. Runs in your browser. Free, no account.",
    what: "This page makes a video the 16:9 shape YouTube's player is built around, for a phone clip or a square post that should be a regular YouTube video. It keeps the source's resolution, adds bars or crops to fill the frame, and shows the result on the preview before anything is encoded.",
    story: [
      "What YouTube asks for, checked 2026-09 on its help centre: the standard aspect ratio on a computer is 16:9, at sizes from 426×240 through 1920×1080 and 3840×2160 up to 7680×4320, and YouTube may add padding of its own to vertical videos in desktop browsers. Every 16:9 size is accepted, so this page keeps your video's own resolution: a 1080×1920 phone clip becomes a 1920×1080 frame with the picture at 608×1080 in the middle, and nothing is enlarged.",
      "Shape also decides what YouTube does with a short clip. A vertical or square upload of three minutes or less becomes a Short and appears in the Shorts feed rather than as a regular video with a thumbnail. Making it 16:9 first keeps it a regular video. For the opposite job, turning footage into a Short, use [resize video for YouTube Shorts](/resize-video-for-youtube-shorts).",
      "Bars are the usual choice for phone footage: the whole picture stays, and black bars disappear into YouTube's dark player. Crop to fill turns a 1080×1920 clip into a 1080×606 strip from the middle, a large loss of detail, so use it only when the action sits in a horizontal band, such as a stage filmed with the phone upright.",
      "A clip that is only sideways because the phone was held the wrong way needs no bars at all: rotating it swaps width and height, and [rotate video](/rotate-video) does that without re-encoding. Everything else here is re-encoded once to H.264 in an MP4, with AAC sound copied as it is.",
    ],
    faq: [
      {
        q: "What aspect ratio does YouTube use?",
        a: "16:9 on a computer, per YouTube's help, at sizes from 426×240 up to 7680×4320.",
      },
      {
        q: "Why does my vertical video show black bars on YouTube?",
        a: "The player is 16:9, so YouTube pads vertical video itself. Resizing first lets you choose white bars or a crop instead.",
      },
      {
        q: "Will a 16:9 version stop my clip becoming a Short?",
        a: "Yes. YouTube treats square and vertical uploads of up to 3 minutes as Shorts; a 16:9 file is a regular video whatever its length.",
      },
      {
        q: "Does adding bars lower the quality?",
        a: "The picture is re-encoded once at a high bitrate and never enlarged. A 1080×1920 clip sits at 608×1080 inside the 1920×1080 frame, the same pixels a viewer would see with YouTube's own padding.",
      },
      {
        q: "Is my video uploaded to be resized?",
        a: "No. It is reshaped and encoded in your browser, and the file stays on your device.",
      },
    ],
  },
  {
    platform: "facebook",
    keywords: [
      "resize video for facebook",
      "facebook video size",
      "facebook feed video aspect ratio",
      "make video 4:5",
      "4:5 video for facebook",
    ],
    aliases: ["facebook", "4:5"],
    related: ["resize-video-for-instagram-reels", "compress-video", "trim-video"],
    updatedAt: "2026-09-30",
    subtitle:
      "Make a video 4:5 for the Facebook feed at up to 1440×1800, cropped or with bars. In your browser.",
    metaTitle: "Resize video for Facebook 4:5, free, no upload",
    metaDescription:
      "Fit a video to the 4:5 frame Meta recommends for Facebook Feed, up to 1440×1800. Crop to fill or add bars. Runs in your browser. Free.",
    what: "This page reshapes a video for the Facebook feed: 4:5, the tall portrait frame Meta's ads guide recommends there, at most 1440×1800. A landscape clip gets bars or a crop, a vertical phone clip is trimmed at the top and bottom or given side bars, and the preview shows the frame before anything is encoded.",
    story: [
      "What Meta asks for, checked 2026-09 in its ads guide for Facebook Feed video: aspect ratio 4:5 at 1440×1800, at least 120 pixels wide and high, 1 second to 241 minutes, up to 4 GB, H.264 in MP4 or MOV with stereo AAC sound at 128 kbps or more. The guide is written for ads; ordinary video posts appear in the same feed. This page writes 4:5, scales anything larger down to 1440×1800 and leaves a smaller picture at its own size.",
      "4:5 is taller than a square and shorter than a phone screen: in a feed on a phone it takes more height than a square post, without the full-screen 9:16 frame that Reels and Stories use. A 9:16 phone clip cropped to 4:5 keeps its full width and loses about 30% of its height, split between top and bottom; drag the window if the subject sits high in the frame.",
      "A 16:9 clip in a 4:5 frame fills 45% of the frame's height when it keeps bars, or keeps 45% of its width when cropped, a window 864 pixels wide out of 1920. That is a lot to lose, which is why the page suggests bars for landscape sources. If the video should keep a different shape, [change video aspect ratio](/change-video-aspect-ratio) offers 16:9, 1:1, 4:3 and 9:16 as well.",
      "The output is H.264 in an MP4 with the sound copied when it is AAC, which matches the codecs in Meta's guide. If the file is large for a slow connection, [compress video](/compress-video) makes it smaller at a size you choose before you post.",
    ],
    faq: [
      {
        q: "What is the best video size for the Facebook feed?",
        a: "Meta's ads guide recommends 4:5 at 1440×1800 for Facebook Feed video, read on 2026-09-30. A phone clip 1080 pixels wide comes out 1080×1350.",
      },
      {
        q: "Should Facebook videos be 4:5 or 9:16?",
        a: "4:5 for the feed, per Meta's guide. 9:16 is the full-screen frame of Reels and Stories, where a 4:5 video would show with bars.",
      },
      {
        q: "Will cropping to 4:5 cut off my subject?",
        a: "Only what falls outside the window you choose. Drag the window over the subject and scrub the filmstrip to check that it stays inside for the whole clip.",
      },
      {
        q: "Does Facebook re-compress uploaded video?",
        a: "Yes, uploads are re-encoded for playback. A clean file at the recommended size gives that step the most to work with.",
      },
      {
        q: "Is my video uploaded to resize it?",
        a: "No. The work happens in your browser, and nothing is sent anywhere until you post it yourself.",
      },
    ],
  },
];

export const resizePlatformTools = specs.map(resizeTool);
