import type { ToolInput } from "../schema";

export const addWatermarkToVideo: ToolInput = {
  slug: "add-watermark-to-video",
  engine: "watermark",
  category: "edit",
  phase: "p1",
  backends: ["webcodecs", "ffmpeg-wasm"],
  accepts: ["video"],
  produces: "video",
  keywords: [
    "add watermark to video",
    "add logo to video",
    "watermark video online",
    "put logo on video",
    "add text watermark to video",
    "video watermark",
  ],
  aliases: ["logo", "branding", "copyright text", "overlay logo"],
  related: [
    "add-image-to-video",
    "crop-video",
    "add-subtitles-to-video",
    "compress-video",
    "picture-in-picture-video",
    "change-video-aspect-ratio",
  ],
  updatedAt: "2026-09-30",
  icon: "stamp",
  content: {
    en: {
      title: "Add a watermark to a video",
      subtitle:
        "Put a logo or text on a video, placed and sized on the picture. Runs in your browser.",
      metaTitle: "Add watermark to video online, free, no upload",
      metaDescription:
        "Put a PNG or SVG logo, or a line of text, on a video. Drag it into place, set size and opacity, show it for part of the video. Nothing is uploaded.",
      action: "Add watermark",
      what: "Draws a logo or a line of text onto every frame of a video, where you put it on the preview. Choose one of nine positions or drag the mark anywhere, drag its corner to resize it, set how see-through it is, and optionally show it only between two moments. The mark becomes part of the picture, so the video is re-encoded once to H.264; the sound is copied when the file allows.",
      steps: [
        "Drop the video onto the page.",
        "Add a logo image, or switch to Text and type the words.",
        "Drag the mark on the preview, or pick one of the nine positions.",
        "Set the size and opacity; under More options, limit it to part of the video.",
        "Press Add watermark and download the result.",
      ],
      goodToKnow: [
        "A PNG or SVG logo with a transparent background sits on the picture as a shape; a JPEG has no transparency, so it shows as a rectangle with its background. SVG logos are drawn at the exact pixel size they will have in the video, so their edges stay sharp at any size. Text is set in a clean sans serif, white or black, with a soft shadow in the opposite tone so it stays readable on busy footage. For several pictures at once, placed anywhere, turned, stacked or animated, [add images](/add-image-to-video) instead.",
        "Size is a share of the picture's width, so the same setting looks the same on a phone clip and a 4K export: 15% is a typical corner logo, 25% is bold. Opacity between about 40% and 80% keeps a mark visible without hiding what is under it. The nine positions keep a margin of 3% of the picture's shorter side from the edges; a mark you drag stays exactly where you drop it.",
        "A watermark cannot be added without re-encoding: every frame gets new pixels. The picture is encoded once to H.264 at a high bitrate, the same quality the [crop tool](/crop-video) uses, so the loss is small, but start from the original file rather than a copy that has already been compressed. MP4, MOV and MKV keep their container and AAC sound is copied bit for bit; WebM is written as MP4, with its Opus sound encoded to AAC.",
        "A corner mark can be cut off by anyone who crops the video, and platforms often crop for their own formats. If the point is to make reuse harder, place the mark nearer the subject, where cropping it out would ruin the shot, and keep it faint. If the video is going to a vertical feed, [change its aspect ratio](/change-video-aspect-ratio) first and place the mark on the final framing.",
        "Showing the mark only for part of the video, such as the last seconds as an end card, uses the timeline under the preview: drag its handles to where the mark should appear and disappear. Older formats such as AVI, WMV and FLV are handled by a fallback engine that downloads once and writes MP4.",
      ],
      faq: [
        {
          q: "Does adding a watermark reduce quality?",
          a: "Slightly. The picture is re-encoded once at a high bitrate, because the mark becomes part of every frame. The sound is copied unchanged when the container allows.",
        },
        {
          q: "Can I use an SVG logo?",
          a: "Yes. SVG, PNG, WebP and JPEG all work. SVG is drawn at the exact size it has in the video, so it stays sharp.",
        },
        {
          q: "How do I make the watermark transparent?",
          a: "Set the opacity to Faint (40%) or type a percentage. For a logo without a box around it, use a PNG or SVG with a transparent background.",
        },
        {
          q: "Can I show the watermark only at the end?",
          a: "Yes. Under More options, tick Only part of the video and drag the timeline handles to the moments it should appear and disappear.",
        },
        {
          q: "Will this site add its own watermark?",
          a: "No. The only mark on the result is the one you add.",
        },
        {
          q: "Is my video uploaded?",
          a: "No. The logo is drawn and the video is encoded in your browser; nothing is sent over the network.",
        },
      ],
    },
  },
};
