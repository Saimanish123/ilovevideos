import type { ToolInput } from "../schema";

export const sideBySideVideo: ToolInput = {
  slug: "side-by-side-video",
  engine: "layout",
  category: "edit",
  phase: "p3",
  backends: ["webcodecs"],
  accepts: ["video"],
  produces: "video",
  presetOptions: { layout: "side" },
  keywords: [
    "side by side video",
    "put two videos side by side",
    "split screen video online",
    "combine two videos into one screen",
    "stack videos vertically",
  ],
  aliases: [
    "split screen",
    "two videos one screen",
    "stack videos",
    "top and bottom",
    "compare videos",
  ],
  related: [
    "picture-in-picture-video",
    "merge-videos",
    "change-video-aspect-ratio",
    "fix-audio-sync",
    "vertical-video-to-horizontal",
  ],
  updatedAt: "2026-11-18",
  icon: "columns-2",
  illustration: "side-by-side",
  content: {
    en: {
      title: "Put two videos side by side",
      subtitle: "Or stacked, lined up in time, with either sound.",
      metaTitle: "Side by side video online, free, no upload",
      metaDescription:
        "Put two videos side by side or one above the other in one frame. Line them up in time, pick the frame shape and the sound. Free, no upload.",
      action: "Combine",
      what: "This tool plays two videos at once in one frame: next to each other, or stacked one above the other for a tall phone screen. It suits before and after comparisons, two camera angles of one moment, a duet, or a tutorial beside its result. The preview plays both in step exactly as they will be written.",
      steps: [
        "Drop two videos; the first goes on the left, the second on the right.",
        "Choose Side by side or Top and bottom, and the output frame: Auto keeps both pictures whole.",
        "Set when the second video starts so the two line up, and play the preview to check.",
        "Choose the sound, then press Combine and download the MP4.",
      ],
      goodToKnow: [
        "Auto puts both pictures at one height, the smaller of the two and at most 1080 pixels high side by side (or at one width, at most 1080 wide, stacked), so neither is cut or stretched and the frame is as wide as they need. Two 1080p landscape clips side by side make a 3840×1080 frame. A fixed 16:9, 9:16 or 1:1 frame splits into two equal halves; each picture is cut to fill its half, or shown whole with black bars if you choose that under More options.",
        "Top and bottom is the split screen for vertical platforms: two landscape clips stacked in a 9:16 frame keep about two thirds of their width each, where side by side would keep about a sixth. Two vertical phone clips, the other way round, sit best side by side in a square frame.",
        "The result lasts until the later of the two ends. A video that ends first holds its last frame, or goes black if you choose Hide it; one that starts later shows its first frame until it begins. To line up two recordings of one event, find a sound or movement both caught and set the second video's start until they match in the preview.",
        "Both pictures are decoded and drawn into one new frame, then encoded once to H.264, with AAC sound (Opus where the browser has no AAC encoder); nothing is copied from the originals. Each half gets about the bitrate its source spends on it, so a side-by-side comparison of two encodes, such as an original beside its [H.264 to HEVC](/h264-to-hevc) copy, adds a little softness of its own. To compare the files' codecs and bitrates, open each in [video info](/video-info); to play one after the other instead, use [merge videos](/merge-videos).",
      ],
      faq: [
        {
          q: "How do I put two videos side by side?",
          a: "Drop both, choose Side by side and press Combine. The first video is on the left; Swap changes that.",
        },
        {
          q: "Can I stack two videos for TikTok or Reels?",
          a: "Yes. Choose Top and bottom and the 9:16 frame; each video fills half the height.",
        },
        {
          q: "What if one video is longer?",
          a: "The result runs until the longer one ends; the other holds its last frame or goes black.",
        },
        {
          q: "Can I add a line between them?",
          a: "Yes. Under More options, Gap adds a white or black line between the two pictures.",
        },
        {
          q: "Will it stretch a video that has a different shape?",
          a: "Never. Pictures are scaled evenly and either cut to fill their space or shown whole with bars.",
        },
        {
          q: "Are my videos uploaded?",
          a: "No. Both are combined in your browser and stay on your device.",
        },
      ],
    },
  },
};
