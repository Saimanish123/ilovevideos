import type { ToolInput } from "../schema";

export const videoToApng: ToolInput = {
  slug: "video-to-apng",
  engine: "animated-image",
  category: "gif",
  phase: "p2",
  backends: ["webcodecs"],
  accepts: ["video"],
  produces: "image",
  presetOptions: { format: "apng" },
  keywords: [
    "video to apng",
    "mp4 to apng",
    "video to animated png",
    "convert video to apng",
    "apng maker",
  ],
  aliases: ["apng", "animated png", "mp4 to apng", "mov to apng"],
  related: [
    "video-to-gif",
    "video-to-webp",
    "video-to-avif",
    "sharpest-frame-from-video",
    "video-to-image-sequence",
    "video-contact-sheet",
  ],
  updatedAt: "2026-11-18",
  icon: "image-play",
  content: {
    en: {
      title: "Make an animated PNG from video",
      subtitle: "Turn part of a video into a lossless APNG with full colour, in your browser.",
      metaTitle: "Video to APNG online, free, no upload",
      metaDescription:
        "Make a lossless animated PNG from MP4, MOV or WebM in your browser. Pick the range on a timeline, set width and frame rate. No upload, no account.",
      action: "Make APNG",
      what: "This tool turns a section of a video into an APNG, an animated PNG. Every frame is kept exactly as it was decoded and resized, in full 24-bit colour, with no compression loss and no dithering. The result is a .png file that plays in browsers and shows its first frame anywhere else.",
      steps: [
        "Drop a video onto the page or choose one from your device.",
        "Drag the timeline handles to the moment you want, or press I and O at the playhead.",
        "Choose a width and a frame rate and check the size estimate above the button.",
        "Press Make APNG, watch the result play on the page and download it.",
      ],
      goodToKnow: [
        "APNG is a PNG with extra chunks that describe frames and their timing. A program that does not understand them reads the file as an ordinary PNG and shows the first frame, which this page writes as the full picture, so the file never breaks; it just stops being animated. The extension stays .png.",
        "Lossless means large. Video codecs and WebP throw away detail the eye barely sees; PNG keeps every pixel, so a few seconds of camera footage easily reaches several megabytes. In our tests a 4 s clip at 480 px and 15 fps came out about three times the size of a GIF of the same frames for camera footage, and smaller than the GIF for a screen recording with a still background. Keep the clip short, the width modest and the frame rate low, or use [the WebP maker](/video-to-webp) when exact pixels do not matter.",
        "Where APNG is the right choice: interface demos, pixel art, diagrams and screen captures with small coloured text, anything where a GIF's 256 colours band or a lossy format smears sharp edges. Each frame after the first stores only the rectangle that changed since the one before, and a frame identical to the previous one only makes it last longer, so a recording where only the cursor moves stays small.",
        "Rows of pixels are filtered before compression the way good PNG tools do it, by trying the five PNG predictors on every row and keeping the one that leaves the smallest numbers, then deflated by the browser's built-in compressor. On six test clips the result was the same size as FFmpeg's APNG encoder with its best prediction setting, or up to 14% smaller.",
        "Frame delays are stored as exact fractions of a second, so 24 or 30 fps play at their true speed. The loop setting is written into the file: on for an endless loop, off to play once and stop on the last frame. There is no sound in an APNG.",
      ],
      faq: [
        {
          q: "Is APNG better than GIF?",
          a: "For picture quality, yes: full colour and no dithering, where GIF has 256 colours per frame. It is usually larger than a GIF for camera footage and often smaller for flat graphics and screen recordings.",
        },
        {
          q: "Why is my APNG so large?",
          a: "It keeps every pixel of every frame without loss. Shorten the range, lower the frame rate or choose a smaller width; each cuts the size roughly in proportion.",
        },
        {
          q: "Will it play everywhere?",
          a: "Current Chrome, Edge, Firefox and Safari animate it. Programs that do not support APNG show the first frame as a still PNG, so check where it will be used.",
        },
        {
          q: "Why does the file end in .png?",
          a: "An animated PNG is a PNG file with animation chunks added. The .png extension is what browsers and the APNG specification expect.",
        },
        {
          q: "Is my video uploaded?",
          a: "No. The frames are decoded, filtered and compressed in your browser, and the file never leaves your device.",
        },
      ],
    },
  },
};
