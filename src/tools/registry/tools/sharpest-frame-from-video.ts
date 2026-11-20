import type { ToolInput } from "../schema";

export const sharpestFrameFromVideo: ToolInput = {
  slug: "sharpest-frame-from-video",
  engine: "frame-pick",
  category: "gif",
  phase: "p3",
  backends: ["webcodecs"],
  accepts: ["video"],
  produces: "image",
  keywords: [
    "sharpest frame from video",
    "best frame from video",
    "clear still from video",
    "get a sharp photo from a video",
    "blurry screenshot from video",
  ],
  aliases: ["best frame", "sharp frame", "photo from video", "still from video", "blur free frame"],
  related: [
    "extract-frame-from-video",
    "video-to-image-sequence",
    "video-contact-sheet",
    "video-to-apng",
    "trim-video",
    "video-thumbnail-maker",
  ],
  updatedAt: "2026-11-18",
  icon: "focus",
  illustration: "sharpest-frame",
  content: {
    en: {
      title: "Get the sharpest frame from a video",
      subtitle: "Pick the clearest still around a moment and save it.",
      metaTitle: "Sharpest frame from video, free, no upload",
      metaDescription:
        "Pick a moment in a video and get its sharpest frame as a full-resolution PNG, JPG or WebP. Every frame is scored in your browser. No upload.",
      action: "Find sharpest frame",
      what: "Pausing a video at the right moment often gives a blurred still, because the camera or the subject was moving in that frame. This tool looks at every frame in a range you choose (an even sample of 900 on long ranges), measures how sharp each one is, and saves the sharpest at the video's full resolution. You set the range on a filmstrip timeline around the moment you want; the result says when the frame is and how much sharper it is than the rest.",
      steps: [
        "Drop a video onto the page or choose one from your device.",
        "Drag the timeline handles around the moment you want a still of; a second or two is usually enough.",
        "Choose PNG, JPG or WebP.",
        "Press Find sharpest frame, then check the still and download it.",
      ],
      goodToKnow: [
        "Sharpness here is edge contrast: how strongly brightness changes from one pixel to the next, measured over the whole frame. Motion blur and focus blur both smear edges and lower it; a frame where the camera was still for a moment scores highest. Before measuring, each 2×2 block of pixels is averaged, so the fine grain of a dim or high-ISO shot does not pass for detail.",
        "It picks the one sharp frame among blurred ones even under heavy grain, and in a panning shot it favours the moment the camera briefly stops. Scoring is quick next to decoding, so most of the wait is reading the video.",
        "Keep the range around one moment. Across a long range the frame with the most detail may come from a different scene: a busy background beats a smooth face. So a long range finds the most detailed shot, not the best expression. A range of 1 to 3 s around the moment works best; a range longer than 900 frames is scored on an even sample of 900.",
        "The saved frame is decoded at the video's own size with rotation applied, so a portrait phone clip gives a portrait still. PNG keeps every pixel as decoded; JPG and WebP are much smaller and fine for sharing. Video frames are compressed, so a still from a video never has the detail of a photo taken at the same size.",
        "To pick a frame by eye instead, scrub to it with [extract a frame](/extract-frame-from-video). For many frames at once, [video to image sequence](/video-to-image-sequence) saves every frame or one every few seconds.",
      ],
      faq: [
        {
          q: "How does it decide which frame is sharpest?",
          a: "It measures edge contrast in every frame of the range (an even sample of 900 on long ranges) after smoothing out pixel noise, and keeps the frame with the highest score. Blur from motion or focus lowers it.",
        },
        {
          q: "Why did it pick a frame I did not expect?",
          a: "The range covered more than one scene or moment, and another one had more fine detail. Narrow the range to the moment you want and run it again.",
        },
        {
          q: "Is the still full resolution?",
          a: "Yes. The chosen frame is decoded again at the video's own size, with rotation applied.",
        },
        {
          q: "Can it make a blurry video sharp?",
          a: "No. It finds the sharpest frame that exists; it does not sharpen or invent detail.",
        },
        {
          q: "Is my video uploaded?",
          a: "No. Every frame is decoded and scored in your browser, and the file never leaves your device.",
        },
      ],
    },
  },
};
