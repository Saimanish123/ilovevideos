import type { ToolInput } from "../schema";

export const addBorderToVideo: ToolInput = {
  slug: "add-border-to-video",
  engine: "pad",
  category: "edit",
  phase: "p2",
  backends: ["webcodecs", "ffmpeg-wasm"],
  accepts: ["video"],
  produces: "video",
  keywords: [
    "add border to video",
    "video border",
    "add frame to video",
    "white border video",
    "add padding to video",
  ],
  aliases: ["frame", "padding", "border", "outline", "white frame", "matte"],
  related: [
    "vertical-video-to-horizontal",
    "change-video-aspect-ratio",
    "crop-video",
    "add-watermark-to-video",
    "black-and-white-video",
    "remove-black-bars-from-video",
  ],
  updatedAt: "2026-10-01",
  icon: "frame",
  illustration: "border",
  content: {
    en: {
      title: "Add a border to a video",
      subtitle: "Thin or thick, in white, black or any colour.",
      metaTitle: "Add border to video online, free, no upload",
      metaDescription:
        "Frame a video with a white, black or any-colour border, thin to thick, around the picture or inside its frame. Previewed live. Free, on your device.",
      action: "Add border",
      what: "This tool draws a band of colour on every edge of a video. The preview shows the border on the picture as you change it, in the colour and thickness the file will have. The border can go around the picture, so the frame grows and every original pixel is kept, or inside the frame, so the file keeps its size and the picture is scaled down a little to make room.",
      steps: [
        "Drop a video; a medium white border appears on the preview.",
        "Pick Thin, Medium or Thick, or type the exact width in pixels.",
        "Choose white, black or a custom colour, and whether the frame grows or keeps its size.",
        "Press Add border and download the result.",
      ],
      goodToKnow: [
        "Thickness is a share of the picture's short side (2%, 5% or 10%), so the same choice looks the same on a phone clip and a 4K file, which matters when several videos are to match. The exact field sets pixels for this one video; widths are kept even, because H.264 stores colour in two-by-two blocks and odd edges would smear.",
        "Around the picture keeps every pixel of the original and makes the frame larger: a 1920×1080 clip with a 54-pixel border becomes 2028×1188. Keep the size is for places that expect a set frame, such as a 1080×1920 upload slot: the frame stays as it was and the picture shrinks just enough to leave the border on every side.",
        "A border changes every frame, so the video is always re-encoded, to H.264 at the quality the site uses for reshaped video. The sound is copied as it is when the container allows. MP4, MOV and MKV keep their container; WebM, AVI and other formats are written as MP4.",
        "Bars on two sides only, to fit a video to a different shape, are the job of [change video aspect ratio](/change-video-aspect-ratio), which also offers a blurred background. To cut the picture down instead of framing it, use [crop video](/crop-video); to put a name or logo on it, [add a watermark](/add-watermark-to-video).",
        "Borders here are the same on all four edges. A thin black border on a clip turned grey with [black and white video](/black-and-white-video) first gives the look of an old print; a thick white one suits a single square clip in a feed of photos.",
      ],
      faq: [
        {
          q: "Can I choose any colour?",
          a: "Yes. White and black are one tap; Custom opens a colour picker for any colour.",
        },
        {
          q: "Will the border crop my video?",
          a: "No. Around the picture adds the border outside it; Keep the size scales the whole picture down inside the frame. Nothing is cut off either way.",
        },
        {
          q: "How thick can the border be?",
          a: "From 2 pixels up to a quarter of the short side as a share, or up to 2,000 pixels exactly, as long as some picture is left in the frame.",
        },
        {
          q: "Does adding a border reduce quality?",
          a: "The video is re-encoded, which costs a little. The picture itself is not resized when the frame grows around it.",
        },
        {
          q: "Is my video uploaded?",
          a: "No. The border is drawn on each frame in your browser, and the file stays on your device.",
        },
      ],
    },
  },
};
