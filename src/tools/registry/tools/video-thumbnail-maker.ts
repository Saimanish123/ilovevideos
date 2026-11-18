import type { ToolInput } from "../schema";

export const videoThumbnailMaker: ToolInput = {
  slug: "video-thumbnail-maker",
  engine: "thumbnail",
  category: "gif",
  phase: "p3",
  backends: ["webcodecs"],
  accepts: ["video"],
  produces: "image",
  presetOptions: { mode: "thumbnail" },
  keywords: [
    "video thumbnail maker",
    "make a thumbnail from a video",
    "thumbnail from video",
    "video thumbnail generator",
    "get a thumbnail image from video",
  ],
  aliases: ["thumbnail", "cover image", "video cover", "poster image", "thumbnail generator"],
  related: [
    "change-video-thumbnail",
    "sharpest-frame-from-video",
    "extract-frame-from-video",
    "video-contact-sheet",
    "crop-video",
    "video-to-webp",
  ],
  updatedAt: "2026-11-18",
  icon: "image-plus",
  illustration: "thumbnail",
  content: {
    en: {
      title: "Make a thumbnail from a video",
      subtitle: "Pick a suggested frame, frame it in 16:9, 9:16 or 1:1 and save it at a set size.",
      metaTitle: "Video thumbnail maker online, free, no upload",
      metaDescription:
        "Get suggested frames from your video, frame one in 16:9, 9:16 or 1:1 and save it as a JPG, PNG or WebP at a set size. Runs in your browser.",
      action: "Make thumbnail",
      what: "A thumbnail is the still people see before they press play, so it has to be sharp, well lit and the right shape. This page looks through the video and suggests up to six frames that are sharp, neither too dark nor blown out, and from different scenes. You pick one or scrub to any other, drag a frame of the shape you need over the picture, and save it at the size you choose, ready to upload as a cover or poster image.",
      steps: [
        "Drop a video onto the page or choose one from your device.",
        "Choose one of the suggested frames, or drag along the filmstrip to any other moment.",
        "Choose the shape and drag the frame on the picture to what should be in it.",
        "Pick a size, then press Make thumbnail and download the image.",
      ],
      goodToKnow: [
        "The suggestions come from thirty frames spread evenly through the video. Each is scored on two things: sharpness, measured as edge contrast after smoothing out pixel noise, so motion blur and focus blur sink it; and exposure, which favours mid-tones and penalises crushed blacks and blown highlights, so a frame from a fade to black never comes up. Frames that look nearly the same are dropped, so the suggestions cover different scenes, and the page opens on the best of them.",
        "This page is for one picture at a set shape and size. To save a frame exactly as it is in the video, at its own size, use [extract a frame](/extract-frame-from-video); to find the least blurred frame around a moment, [the sharpest frame](/sharpest-frame-from-video); for a sheet of many frames in a grid, [the contact sheet](/video-contact-sheet).",
        "The sizes offered are common screen sizes: 1280×720 and 1920×1080 for 16:9, 1080×1920 for 9:16 and 1080×1080 for 1:1. Video sites and shops publish their own thumbnail sizes and file limits, which change; check the help page of the place you upload to. Choose Crop size to save exactly the pixels inside the frame without scaling.",
        "A thumbnail larger than the part of the video it comes from is enlarged, and the status line says by how much: a 640×360 video saved at 1280×720 is enlarged 2×, so it will look soft next to one from a 1080p source. Scaling uses the browser's high-quality resampling.",
        "JPG is the default because almost every site takes it and it keeps photos small. PNG keeps every pixel, at a larger size, which suits screen recordings with sharp text. To make a frame the file's own icon in macOS Finder rather than an image to upload, use [change the video file's thumbnail](/change-video-thumbnail); to use the image made here as that icon, add it as the cover on [edit metadata](/edit-video-metadata) (MP4 only).",
      ],
      faq: [
        {
          q: "How are the suggested frames chosen?",
          a: "Thirty frames across the video are scored for sharpness and exposure, near-duplicates are dropped, and up to six of the best, from different scenes, are shown in time order.",
        },
        {
          q: "Which size should I choose?",
          a: "1280×720 suits most 16:9 players and keeps the file light; 1920×1080 keeps more detail when the source has it. Sites set and change their own limits, so check the upload page of the one you use.",
        },
        {
          q: "Can I make a vertical thumbnail?",
          a: "Yes. Choose 9:16 and drag the frame to the part of the picture you want; a portrait video starts in 9:16.",
        },
        {
          q: "Why does my thumbnail look soft?",
          a: "It is larger than the part of the video it comes from, so it was enlarged. Choose a smaller size or a larger frame on the picture.",
        },
        {
          q: "Is my video uploaded?",
          a: "No. The frames are scored and the thumbnail made in your browser; the file never leaves your device.",
        },
      ],
    },
  },
};
