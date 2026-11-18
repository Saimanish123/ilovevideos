import type { ToolInput } from "../schema";

export const verticalVideoToHorizontal: ToolInput = {
  slug: "vertical-video-to-horizontal",
  engine: "aspect-ratio",
  category: "edit",
  phase: "p2",
  backends: ["webcodecs", "ffmpeg-wasm"],
  accepts: ["video"],
  produces: "video",
  presetOptions: { ratio: "16:9", fit: "pad", background: "blur" },
  keywords: [
    "vertical video to horizontal",
    "portrait video to landscape",
    "blur background vertical video",
    "fix vertical video",
    "9:16 to 16:9 with blur",
  ],
  aliases: [
    "blurred sides",
    "blur bars",
    "portrait to landscape",
    "vertical to 16:9",
    "phone video",
  ],
  related: [
    "change-video-aspect-ratio",
    "add-border-to-video",
    "resize-video-for-youtube",
    "crop-video",
    "rotate-video",
  ],
  updatedAt: "2026-10-01",
  icon: "rectangle-horizontal",
  illustration: "blur-pad",
  content: {
    en: {
      title: "Turn vertical video horizontal",
      subtitle:
        "Put a portrait phone video in a 16:9 frame with blurred sides, not black bars. In your browser.",
      metaTitle: "Vertical video to horizontal, free, no upload",
      metaDescription:
        "Fit a vertical phone video into a 16:9 landscape frame, the empty sides filled with a blurred copy of the picture. Nothing cropped. Free, on your device.",
      action: "Make horizontal",
      what: "This page places a vertical video in the middle of a widescreen 16:9 frame and fills the empty sides with the same picture, enlarged, blurred and dimmed, the way television news shows phone footage. Nothing of the original is cut off. The preview draws the blurred sides as you watch, and the panel also offers plain black or white bars and a crop that fills the frame instead.",
      steps: [
        "Drop a vertical video; the preview shows it in a 16:9 frame with blurred sides.",
        "Play or scrub the preview to see the sides follow the picture.",
        "Keep Blurred, or switch to black or white bars, or to Crop to fill.",
        "Press Make horizontal and download the widescreen result.",
      ],
      goodToKnow: [
        "Why blurred sides: a vertical clip in a landscape player leaves two wide empty areas. Black bars there look like a mistake on a television; the blurred copy fills them with the clip's own colour and movement, so the eye stays on the sharp picture in the middle. The background is the picture scaled to cover the frame, blurred and darkened by a fifth.",
        "Sizes: the frame's long side matches the source's long side, so nothing is enlarged. A 720×1280 clip becomes a 1280×720 frame with the sharp picture 406×720 in the middle; a 1080×1920 phone video becomes 1920×1080. For a platform's own size cap, [resize video for YouTube](/resize-video-for-youtube) uses the same engine with YouTube's frame.",
        "The alternative is to fill the frame by cropping. Crop to fill cuts the top and bottom off a portrait clip, keeping about a third of it at 16:9, which only works when the subject sits in a narrow band; the panel shows the kept window on the preview so you can place it. The blurred version keeps everything.",
        "Every frame is redrawn, so the video is re-encoded to H.264; the sound is copied as it is when the container allows. For any other shape, square or 4:5, with the same blurred bars, use [change video aspect ratio](/change-video-aspect-ratio); to frame the clip evenly on all sides instead, [add a border](/add-border-to-video).",
        "A clip that plays sideways rather than tall was recorded with the phone turned and needs turning, not framing: [rotate video](/rotate-video) fixes that, losslessly in most cases, and this page can then take the rotated file if it is still vertical.",
      ],
      faq: [
        {
          q: "Is any of my video cropped?",
          a: "No, with Blurred or bars the whole picture is kept and centred. Only Crop to fill cuts part of it off, and the preview shows which part.",
        },
        {
          q: "How is the background made?",
          a: "From each frame of your video itself: enlarged to cover the frame, blurred and dimmed, so it moves with the picture.",
        },
        {
          q: "What resolution is the result?",
          a: "The source's long side becomes the width: a 720×1280 clip becomes 1280×720, with no upscaling.",
        },
        {
          q: "Can I use black bars instead?",
          a: "Yes, the Bars choice offers black and white as well as Blurred.",
        },
        {
          q: "Is my video uploaded?",
          a: "No. The frames are drawn and encoded in your browser, and the file never leaves your device.",
        },
      ],
    },
  },
};
