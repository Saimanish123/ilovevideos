import type { ToolInput } from "../schema";

export const cropVideo: ToolInput = {
  slug: "crop-video",
  engine: "crop",
  category: "edit",
  phase: "p1",
  backends: ["webcodecs", "ffmpeg-wasm"],
  accepts: ["video"],
  produces: "video",
  keywords: [
    "crop video",
    "crop mp4",
    "crop video online",
    "crop video to square",
    "cut the edges off a video",
  ],
  aliases: ["cut out", "reframe"],
  related: [
    "change-video-aspect-ratio",
    "rotate-video",
    "trim-video",
    "compress-video",
    "flip-video",
    "zoom-video",
  ],
  updatedAt: "2026-09-30",
  icon: "crop",
  content: {
    en: {
      title: "Crop video",
      subtitle:
        "Cut away the edges of a video and keep only the part you frame. Runs in your browser.",
      metaTitle: "Crop video online, free, no upload",
      metaDescription:
        "Crop a video by dragging a frame over the preview or typing exact pixels. Shapes for 16:9, 9:16, 1:1 and 4:5. Runs in your browser, nothing uploaded.",
      what: "Drag a frame over the preview to choose the part of the picture you want, and everything outside it is removed. Shape presets lock the frame to 16:9, 9:16, 1:1, 4:5 or 4:3, and four number fields set its position and size to the pixel. Cropping changes every frame, so the video is re-encoded once to H.264 at high quality; the sound is copied when the file allows it.",
      steps: [
        "Drop a video onto the page or choose one from your device.",
        "Drag the corners or edges of the frame on the preview, or pick a shape to lock it to a ratio.",
        "Drag inside the frame to move it, and use the filmstrip under the preview to check other moments of the clip.",
        "Type exact values into Left, Top, Width and Height when you need pixel precision.",
        "Press Crop, then download the result.",
      ],
      goodToKnow: [
        "The frame is measured in pixels of the original picture, not of the preview on your screen. A phone clip filmed upright is measured the way it plays, so Left and Top always mean the left and top you see. Every value snaps to an even number because H.264 stores colour at half resolution in both directions (4:2:0); an odd width or height would leave half a colour sample hanging off the edge, and common encoders reject it.",
        "A crop cannot be made by copying the stream. The pixels outside the frame have to go and the frames that remain have to be compressed again, so the output is a new H.264 encode at a deliberately high bitrate, about 7.5 Mbit/s for a 1920×1080 result at 30 fps and proportionally less for smaller frames. Each re-encode costs a little, so crop from the original file rather than from an already edited copy, and if you also need a smaller file, run the result through [compress video](/compress-video) afterwards.",
        "Some desktop tools offer a lossless crop for H.264 by rewriting the cropping fields in the stream header. That hides the edges rather than removing them: the file stays the same size and the cut-away pixels are still inside it, which matters when the point of the crop is to take out a face, a name or a notification on a screen recording. Re-encoding, as this page does, removes them from the file for good.",
        "A crop never scales the picture up. A 9:16 window cut from a 1920×1080 frame is 606×1080 pixels, and it stays 606×1080, because enlarging it would add pixels without adding detail. If you want a vertical video that keeps the whole landscape picture, [change the aspect ratio](/change-video-aspect-ratio) with bars instead; if the clip is sideways rather than badly framed, [rotate it](/rotate-video) first, which on MP4 and MOV costs nothing in quality.",
        "MP4, MOV and MKV files keep their container. WebM is written as MP4, because WebM cannot hold H.264, and older formats such as AVI and WMV are read by a slower fallback converter that downloads once and also writes MP4. AAC sound in MP4 or MOV, and any sound in MKV, is copied bit for bit; other sound is encoded to AAC.",
      ],
      faq: [
        {
          q: "Does cropping a video reduce its quality?",
          a: "It re-encodes the picture once, at a high bitrate. The loss is small but not zero, so crop from the original file when you still have it.",
        },
        {
          q: "Can I crop a landscape video to 9:16 for TikTok or Reels?",
          a: "Yes. Pick 9:16, then drag the window over the part of the picture you want to keep. The result keeps the source's own pixels and is not enlarged. To keep the whole landscape picture instead, [change the aspect ratio](/change-video-aspect-ratio) with bars.",
        },
        {
          q: "Why do my numbers change by a pixel?",
          a: "H.264 needs even widths, heights and offsets, so every value snaps to the nearest even number when you leave the field.",
        },
        {
          q: "Can I remove black bars from a video?",
          a: "Yes. The [remove black bars](/remove-black-bars-from-video) page finds them across the video and sets this same frame on the picture for you. Here, drag the top and bottom edges, or the sides, in to where the picture starts; the dimmed area shows what will be removed.",
        },
        {
          q: "Is my video uploaded to crop it?",
          a: "No. Drawing the frame, decoding and encoding all happen inside your browser, and nothing about the file is sent over the network.",
        },
        {
          q: "Does the cropped video keep its sound?",
          a: "Yes. The sound track is carried over, copied as it is when the container allows and encoded to AAC when it does not.",
        },
      ],
    },
  },
};
