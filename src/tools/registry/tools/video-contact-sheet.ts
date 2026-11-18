import type { ToolInput } from "../schema";

export const videoContactSheet: ToolInput = {
  slug: "video-contact-sheet",
  engine: "thumbnail-grid",
  category: "gif",
  phase: "p2",
  backends: ["webcodecs"],
  accepts: ["video"],
  produces: "image",
  keywords: [
    "video contact sheet",
    "video thumbnail grid",
    "video screenshot grid",
    "storyboard from video",
    "video preview sheet",
    "make thumbnails of a video",
  ],
  aliases: ["contact sheet", "thumbnail grid", "storyboard", "screenshot sheet", "mosaic"],
  related: [
    "extract-frame-from-video",
    "video-to-image-sequence",
    "video-info",
    "video-to-gif",
    "trim-video",
    "split-video",
  ],
  updatedAt: "2026-10-01",
  icon: "layout-grid",
  content: {
    en: {
      title: "Make a contact sheet from a video",
      subtitle:
        "Lay out frames from across a video on one image, with timestamps and the file's details.",
      metaTitle: "Video contact sheet maker, free, no upload",
      metaDescription:
        "Turn a video into one image of evenly spaced frames with timestamps and file details. Choose the grid and width. Runs in your browser, no upload.",
      action: "Make contact sheet",
      what: "This tool makes a contact sheet: one picture that shows a video's frames side by side in a grid, taken at even steps from start to end, each with the moment it comes from and, across the top, the file's name, length, size, codec and frame rate. It lets you see what a long recording holds at a glance, compare takes, or send someone an overview without sending the video. The sheet is drawn live above the settings while you choose the grid and width.",
      steps: [
        "Drop a video onto the page, or choose one from your device.",
        "Pick a grid, from 3×3 for a short clip to 6×8 for a feature-length recording, and the sheet width.",
        "Watch the preview update; turn timestamps or the file details off if you want only the pictures.",
        "Press Make contact sheet and download the image, or drop several videos to get one sheet each in a ZIP.",
      ],
      goodToKnow: [
        "The frames come from the middle of equal slices of the video. A 4×4 sheet of a 16-minute recording takes one frame from each minute, at 0:30, 1:30, 2:30 and so on, so the first tile is not a black fade-in and the last is not the end credits' final frame. The preview shows those same frames before you start, taken by the page's own player, so what you see is what the sheet will hold.",
        "Each frame is decoded from the video with the browser's own decoder and scaled once to its tile, never taken from a screen capture, and portrait phone footage is turned upright as players show it. The tiles keep the video's shape, so the height of the sheet follows from the grid and the width. At 1920 pixels wide, a 4×4 sheet of 16:9 video with the details line comes out at 1920×1200.",
        "JPG is the default because a sheet of photographic frames is several megabytes as PNG and a fraction of that as JPG, with no difference you would see at normal size. PNG is lossless and suits sheets you will crop or print. A sheet can have up to about 16.7 million pixels (a 3840-wide 6×8 sheet of 16:9 video is 3840×3137, about 12 million); past that the page asks for fewer rows or a narrower sheet.",
        "Timestamps sit in the bottom right corner of each tile, as minutes and seconds, or hours for a long file. The file details line is what [video info](/video-info) reports: duration, resolution, codec, frame rate and size, which makes a sheet useful as a record of what an archive file is.",
        "To keep one of the frames at full resolution rather than a thumbnail, [extract a frame](/extract-frame-from-video) at the time the sheet shows. Several videos dropped together are turned into one sheet each with the same settings, and the sheets are collected in one ZIP.",
      ],
      faq: [
        {
          q: "How are the frames chosen?",
          a: "The video is divided into as many equal parts as there are tiles, and each tile shows the frame at the middle of its part. The times are printed on the tiles when timestamps are on.",
        },
        {
          q: "How many frames should the sheet have?",
          a: "About one frame per minute or two works for recordings under an hour: 4×4 or 4×6. A full film suits 6×8. Short clips read best at 3×3, where each frame is large.",
        },
        {
          q: "Is this the same as a YouTube thumbnail?",
          a: "No. A YouTube thumbnail is one designed picture shown before a video plays. A contact sheet is many frames of the video itself, for reviewing or cataloguing it.",
        },
        {
          q: "Can I make contact sheets for many videos at once?",
          a: "Yes. Drop several videos and each gets its own sheet with the same grid and settings, downloaded together as a ZIP.",
        },
        {
          q: "Which video formats work?",
          a: "Any file your browser can decode: H.264, VP8, VP9 and AV1 in MP4, MOV, WebM or MKV in current browsers, and HEVC where the device supports it. A file that cannot be decoded gets a message saying so.",
        },
        {
          q: "Is the video uploaded?",
          a: "No. The frames are decoded and the sheet is drawn in your browser; the video never leaves your device.",
        },
      ],
    },
  },
};
