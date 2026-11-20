import type { ToolInput } from "../schema";

export const stabilizeVideo: ToolInput = {
  slug: "stabilize-video",
  engine: "stabilize",
  category: "edit",
  phase: "p3",
  backends: ["webcodecs"],
  accepts: ["video"],
  produces: "video",
  keywords: [
    "stabilize video",
    "stabilise video",
    "fix shaky video",
    "remove camera shake from video",
    "steady shaky footage online",
  ],
  aliases: ["stabilise", "shaky", "camera shake", "steady", "deshake", "wobble"],
  related: ["crop-video", "trim-video", "sharpen-video", "denoise-video", "compress-video"],
  updatedAt: "2026-11-18",
  icon: "move",
  illustration: "stabilize",
  content: {
    en: {
      title: "Stabilize video",
      subtitle: "Steady shaky hand-held footage.",
      metaTitle: "Stabilize video online, free, no upload",
      metaDescription:
        "Remove camera shake from a video in two passes: motion measured, path smoothed, frames steadied. Light, Medium or Strong. Runs in your browser. Free.",
      what: "This tool takes the jitter out of hand-held footage. It measures how the picture moves from one frame to the next, works out the smooth path a steady camera would have taken, and redraws every frame onto that path. Deliberate moves such as a pan, a walk or a slow turn stay; the quick shake on top of them goes.",
      steps: [
        "Drop a shaky video onto the page.",
        "Pick a strength: Light for small tremors, Medium for most hand-held shots, Strong for a near tripod look.",
        "Keep Zoom to fill to hide the moving edges, or pick Show borders to keep the full frame.",
        "Press Stabilize and wait for both passes: measuring the motion, then redrawing the frames.",
        "Play the result in the preview and download it.",
      ],
      goodToKnow: [
        "A steadied frame has to move against the shake, so its edges drift in and out of view. Zoom to fill enlarges the picture by the smallest amount that keeps every frame covered, and never more than the strength allows: 8% for Light, 15% for Medium, 25% for Strong. Where a sudden jolt would need more, the correction is eased for those frames instead of zooming the whole video further. Show borders keeps the original size and lets black edges appear where the frame has moved away.",
        "Strength is the length of movement the tool treats as intended. Light keeps anything slower than about a third of a second, so only quick tremor goes; Medium smooths over about a second; Strong over two and a half seconds, which turns a walk into a glide but also softens a quick deliberate turn. If a fast pan looks lagging, step down a strength.",
        "The motion is measured as a shift, a turn and a change of scale, from the whole picture at once, on a copy 320 pixels wide, with parts that move on their own (a person crossing, traffic) weighted down. What it cannot fix is the lean and wobble phone sensors add when they read the picture line by line during fast shake, called rolling shutter: those frames come out steady overall but can still look bent. Motion blur from the shake also stays in the frames.",
        "Two passes cost time: the first decodes every frame at a small size to measure motion, the second decodes again, redraws and encodes at full size. The progress line shows which pass it is in. The picture is encoded once to H.264 near the source's bitrate and the sound is copied unchanged where the container allows. Cutting the clip to the part you need first with [trim video](/trim-video) makes both passes shorter.",
        "Stabilising before other picture changes gives the best result: [sharpen](/sharpen-video) after it, since the redraw softens fine detail slightly when it zooms, and [crop the video](/crop-video) afterwards if you want a different frame. In FFmpeg the nearest equivalent is the vidstab filters, which most full FFmpeg builds include but not all.",
      ],
      faq: [
        {
          q: "Will it cut off part of my picture?",
          a: "With Zoom to fill, yes, a little: the edges are cropped by the smallest zoom that hides the movement, at most 8, 15 or 25% depending on the strength. Choose Show borders to keep everything and accept black edges.",
        },
        {
          q: "Why does my fast pan look slow to follow?",
          a: "Strong smooths over about two and a half seconds, so a quick deliberate turn is partly treated as shake. Use Medium or Light for footage with quick deliberate moves.",
        },
        {
          q: "Does it fix the jelly or wobble effect from phones?",
          a: "No. That is rolling shutter: each frame is bent, not just moved. This tool steadies whole frames, so the bend stays.",
        },
        {
          q: "Is my video uploaded?",
          a: "No. Both passes, the measuring and the redrawing, run in your browser, and the file never leaves your device.",
        },
        {
          q: "How long does it take?",
          a: "On a recent computer, a 1080p clip takes about as long as it plays and a 4K, 60 fps clip about twice as long; phones are slower. The progress line shows the frame it is on.",
        },
      ],
    },
  },
};
