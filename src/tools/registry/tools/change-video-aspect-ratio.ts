import type { ToolInput } from "../schema";

export const changeVideoAspectRatio: ToolInput = {
  slug: "change-video-aspect-ratio",
  engine: "aspect-ratio",
  category: "edit",
  phase: "p1",
  backends: ["webcodecs", "ffmpeg-wasm"],
  accepts: ["video"],
  produces: "video",
  keywords: [
    "change video aspect ratio",
    "convert video to 9:16",
    "make video square",
    "change video to 16:9",
    "add black bars to video",
  ],
  aliases: ["resize", "reshape", "letterbox", "pillarbox", "vertical video", "fit to 9:16"],
  related: [
    "crop-video",
    "rotate-video",
    "compress-video",
    "trim-video",
    "video-converter",
    "remove-black-bars-from-video",
  ],
  updatedAt: "2026-09-30",
  icon: "ratio",
  content: {
    en: {
      title: "Change video aspect ratio",
      subtitle:
        "Make a video 9:16, 1:1, 4:5, 16:9 or 4:3 with bars or a crop. Processed in your browser.",
      metaTitle: "Change video aspect ratio, free, no upload",
      metaDescription:
        "Turn a video into 9:16, 1:1, 4:5, 16:9 or 4:3. Keep the whole picture with bars, or fill the frame and choose what to crop. Runs in your browser.",
      what: "This tool changes the shape of a video's frame. Choose a shape, then how to get there: Add bars keeps the whole picture and fills the leftover space with black or white, and Crop to fill uses the largest window of the new shape that fits inside the picture, which you drag over the preview to choose what stays. Either way the picture is re-encoded once to H.264.",
      steps: [
        "Drop a video onto the page or choose one from your device.",
        "Pick the shape you need: 16:9, 9:16, 1:1, 4:5 or 4:3.",
        "Choose Add bars to keep everything, or Crop to fill and drag the window over the part to keep.",
        "Read the output size in the line under the controls, then press Change aspect ratio.",
        "Download the result, or press Start over for the next clip.",
      ],
      goodToKnow: [
        "Aspect ratio is width divided by height. 16:9 is the widescreen shape of YouTube, televisions and laptop screens; 9:16 is the same shape stood upright, the one that fills a phone screen in TikTok, Reels, Shorts and Stories; 1:1 is square; 4:5 is a tall portrait; 4:3 is the older television and iPad shape. When a video does not match the place it is shown, the app adds bars or crops it for you, and you do not get to choose which part is cut.",
        "Adding bars never loses picture. The output's long side stays the same as the source's, so the picture is never scaled up: a 1920×1080 clip made 1:1 becomes 1920×1920 with the picture untouched and bars above and below, while made 9:16 it becomes 1080×1920 with the picture scaled to 1080×608 across the middle. Black bars blend into dark app backgrounds; white bars suit light pages and documents.",
        "Crop to fill keeps the frame full at the cost of the edges. Going from 16:9 to 9:16 keeps a window 606 pixels wide out of 1920, under a third of the picture, which works for one person talking to the camera and badly for a wide scene. Drag the window across the preview and scrub the filmstrip to check that the subject stays inside it for the whole clip. For a free-form rectangle, or to zoom in further, use [crop video](/crop-video) instead. For a view that moves over time, use [zoom video](/zoom-video).",
        "Both paths re-encode the picture to H.264 at a high bitrate; a frame's shape cannot be changed by copying the stream. MP4, MOV and MKV keep their container, WebM and older formats are written as MP4, and AAC sound is copied unchanged. If the result is larger than a platform accepts, [compress it](/compress-video) afterwards; if the video is only sideways, [rotating it](/rotate-video) swaps width and height without re-encoding at all.",
      ],
      faq: [
        {
          q: "What is the difference between adding bars and cropping?",
          a: "Bars keep the whole picture and fill the leftover space with a flat colour. Cropping fills the whole frame with picture and removes whatever does not fit the new shape.",
        },
        {
          q: "Which aspect ratio do TikTok, Reels and Shorts use?",
          a: "9:16, the upright phone-screen shape. A landscape clip turned into 9:16 with bars shows as a band across the middle of the screen; cropped to fill, it loses its sides.",
        },
        {
          q: "Will my video look stretched?",
          a: "No. The picture is only ever scaled evenly or cut, never stretched in one direction, so circles stay round and faces keep their proportions.",
        },
        {
          q: "Can I use a blurred copy of the video instead of bars?",
          a: "Not yet. Bars are black or white for now; a blurred background is planned as its own option.",
        },
        {
          q: "Does changing the aspect ratio make the file bigger?",
          a: "It can. Bars add area, so a square version of a 1920×1080 clip is 1920×1920, and the encoder spends bits on that area. Crop to fill usually gives a smaller file than the source.",
        },
        {
          q: "Is the video uploaded anywhere?",
          a: "No. The whole job runs inside this browser tab, and the file never leaves your device.",
        },
      ],
    },
  },
};
