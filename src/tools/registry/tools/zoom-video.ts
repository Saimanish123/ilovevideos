import type { ToolInput } from "../schema";

export const zoomVideo: ToolInput = {
  slug: "zoom-video",
  engine: "zoom-pan",
  category: "edit",
  phase: "p3",
  backends: ["webcodecs"],
  accepts: ["video"],
  produces: "video",
  keywords: [
    "zoom video",
    "zoom in on video",
    "ken burns effect on a video",
    "pan and zoom video online",
    "slow zoom video",
  ],
  aliases: ["zoom in", "zoom out", "pan", "punch in", "push in"],
  related: [
    "crop-video",
    "change-video-aspect-ratio",
    "freeze-frame-video",
    "trim-video",
    "images-to-video",
  ],
  updatedAt: "2026-11-18",
  icon: "zoom-in",
  illustration: "zoom",
  content: {
    en: {
      title: "Zoom in on a video",
      subtitle: "Move and scale the view over time, smoothly.",
      metaTitle: "Zoom in on a video online, free, no upload",
      metaDescription:
        "Zoom in on a video and pan across it with key frames on a timeline. Smooth or steady motion, output at the original size. Free, no upload.",
      action: "Zoom",
      what: "This tool moves a camera over your video after the fact: it zooms in, zooms out or pans between views you set at moments on a timeline. Each view is a frame of the picture's own shape, so nothing is stretched and the result keeps the video's size. By default it pushes in slowly from the whole picture to a 1.5× view of the centre over the length of the clip.",
      steps: [
        "Drop a video; a slow push-in from the whole picture to a 1.5× view is set up.",
        "Move to a moment on the timeline and drag the frame on the picture to aim the view there; its corners zoom in and out.",
        "Each change at a new moment adds a key frame; drag the key frame marks along the timeline to change when moves happen.",
        "Choose smooth or linear motion, check it with the Result preview, then press Zoom and download.",
      ],
      goodToKnow: [
        "A zoom cannot add detail. At 2× the output shows half the picture's width and height, so a 1080p video zoomed 2× is built from 540 of its lines and enlarged to fill the frame. The status line gives that number for the closest view you set, so you can judge how soft the result will be before running it; with 4K footage there is plenty of room, with a 720p phone clip anything past 1.5× shows.",
        "Between two key frames the zoom changes by the same factor each second, which the eye reads as a steady move toward the subject. A zoom that grew by the same number of pixels each second would appear to slow down as it closes in. Smooth motion eases into and out of every key frame so moves start and stop like a camera operator would; linear keeps the speed constant, which suits a long, slow drift.",
        "The view's position is not rounded to whole pixels, and each frame is drawn with high-quality filtering, so a slow pan glides instead of jumping a pixel at a time. FFmpeg's own zoompan filter rounds the position, which is why its slow moves often shimmer; this page does not.",
        "This is not the same as [crop video](/crop-video), which keeps one rectangle for the whole clip and writes a smaller file of that size. Here the view changes over time and is always scaled back to the full frame. To change the frame's shape for a platform, follow up with [change video aspect ratio](/change-video-aspect-ratio).",
        "The picture is re-encoded to H.264 at a bitrate close to the source's, and the sound is copied when the file allows, as AAC in MP4 and MOV usually does. A file whose picture this browser cannot decode, or an older format such as AVI or WMV, is turned away with a link to convert it to MP4 first.",
      ],
      faq: [
        {
          q: "How do I zoom in on one part of a video?",
          a: "Move to the moment, drag the frame on the picture over the part you want and drag a corner inward to zoom. A key frame is added there.",
        },
        {
          q: "Can I zoom out instead of in?",
          a: "Yes. Start with a key frame zoomed in and end with one at 1×; the video pulls back to the whole picture.",
        },
        {
          q: "Does zooming lower the quality?",
          a: "It enlarges part of the picture, so it is softer the closer you zoom. The status line says how many lines of detail the closest view keeps.",
        },
        {
          q: "Can the zoom happen only in the middle of the clip?",
          a: "Yes. Add a key frame at 1× where the zoom should start and another where it should end; before and after them the view holds.",
        },
        {
          q: "Will the output be smaller than the original?",
          a: "No. The output has the same width and height as the source; only what fills the frame changes.",
        },
        {
          q: "Is my video uploaded?",
          a: "No. Every frame is drawn and encoded in your browser, and the file stays on your device.",
        },
      ],
    },
  },
};
