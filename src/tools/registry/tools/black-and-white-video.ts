import type { ToolInput } from "../schema";

export const blackAndWhiteVideo: ToolInput = {
  slug: "black-and-white-video",
  engine: "filter",
  category: "edit",
  phase: "p2",
  backends: ["webcodecs", "ffmpeg-wasm"],
  accepts: ["video"],
  produces: "video",
  presetOptions: { job: "mono" },
  keywords: [
    "black and white video",
    "make video black and white",
    "grayscale video",
    "video to black and white online",
    "monochrome video",
  ],
  aliases: ["greyscale", "grayscale", "monochrome", "b&w", "desaturate", "noir"],
  related: [
    "add-filter-to-video",
    "adjust-video-brightness",
    "fade-video",
    "add-border-to-video",
    "compress-video",
  ],
  updatedAt: "2026-10-01",
  icon: "contrast",
  illustration: "filter",
  content: {
    en: {
      title: "Make a video black and white",
      subtitle:
        "Turn a colour video black and white, neutral or high contrast, previewed live. Runs in your browser.",
      metaTitle: "Black and white video maker, free, no upload",
      metaDescription:
        "Make a video black and white: neutral, high contrast, red filter or soft. The preview plays in black and white first; the sound is copied. Free.",
      action: "Make black and white",
      what: "This tool removes the colour from a video and writes a new file with every frame in shades of grey. It offers four ways of turning colour into grey, from neutral to high contrast, and the preview plays in black and white as soon as the file is in, with a Before and After switch to compare. The sound is copied as it is.",
      steps: [
        "Drop a video; the preview turns black and white straight away.",
        "Try Neutral, High contrast, Red filter or Soft, and switch Before and After (or press C) to compare.",
        "Lower the strength if you want a little colour left.",
        "Press Make black and white and download the result.",
      ],
      goodToKnow: [
        "Not all greys are equal. Averaging red, green and blue makes blue skies and green leaves look too bright; Neutral weighs each colour by how bright the eye sees it (the Rec. 709 weights, 21% red, 72% green and 7% blue, the same ones CSS grayscale uses), so the grey image keeps the brightness you saw in colour.",
        "Red filter mimics the coloured filters used with black-and-white film: it takes most of its brightness from red and none from blue, so skies go dark and dramatic, and skin looks smooth because blemishes, which are reddish, turn light. High contrast deepens blacks and brightens whites around mid grey; Soft flattens contrast and lifts the shadows for a gentler, older look.",
        "What you see is what you get: the preview uses exactly the numbers the encoder applies to each frame, as a filter on the playing video. The Before and After switch changes only the preview, never the file.",
        "Removing colour cannot be undone later, so keep the original. The picture is re-encoded to H.264 at the quality the site uses for re-encoded video; the panel estimates the size before you start. For other looks, sepia or warm and cool tones, use [add a filter to video](/add-filter-to-video); to brighten a dark clip first, [adjust video brightness](/adjust-video-brightness).",
        "Strength below 100% blends the grey image with the original, leaving muted colour: a quick desaturated look without going fully black and white. Several clips can be done at once: drop them together and each one gets the same treatment.",
      ],
      faq: [
        {
          q: "Which black and white option should I use?",
          a: "Neutral for a faithful grey version, High contrast for punch, Red filter for landscapes with sky, Soft for portraits and an older feel.",
        },
        {
          q: "Does it change the sound?",
          a: "No. The sound is copied without re-encoding when the container holds it.",
        },
        {
          q: "Can I keep a little colour?",
          a: "Yes. Lower the strength: at 50% the colour is half faded.",
        },
        {
          q: "Can I convert several videos at once?",
          a: "Yes. Drop several files and they are processed one after another with the same settings, then offered as a zip.",
        },
        {
          q: "Is my video uploaded?",
          a: "No. Every frame is converted in your browser, and the file stays on your device.",
        },
      ],
    },
  },
};
