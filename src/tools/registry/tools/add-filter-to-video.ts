import type { ToolInput } from "../schema";

export const addFilterToVideo: ToolInput = {
  slug: "add-filter-to-video",
  engine: "filter",
  category: "edit",
  phase: "p2",
  backends: ["webcodecs", "ffmpeg-wasm"],
  accepts: ["video"],
  produces: "video",
  presetOptions: { job: "look" },
  keywords: [
    "add filter to video",
    "video filters online",
    "sepia video",
    "vintage video filter",
    "warm filter video",
  ],
  aliases: ["filter", "look", "sepia", "vintage", "warm", "cool", "vivid", "faded", "tint"],
  related: [
    "black-and-white-video",
    "adjust-video-brightness",
    "fade-video",
    "add-watermark-to-video",
    "video-to-gif",
  ],
  updatedAt: "2026-10-01",
  icon: "palette",
  illustration: "filter",
  content: {
    en: {
      title: "Add a filter to a video",
      subtitle:
        "Give a video a sepia, warm, cool, vivid or faded look, previewed live. Runs in your browser.",
      metaTitle: "Add filter to video online, free, no upload",
      metaDescription:
        "Apply a sepia, warm, cool, vivid, faded or black-and-white look to a video, at the strength you choose. Live preview, sound copied. Free, no upload.",
      action: "Apply filter",
      what: "This tool gives every frame of a video the same colour look and writes a new file. Six looks are offered, each a plain colour transform with a strength control, and the preview plays with the look applied from the moment the file is in; a Before and After switch shows the original. The sound is copied as it is.",
      steps: [
        "Drop a video; the preview plays with the sepia look.",
        "Pick another look and set the strength; switch Before and After, or press C, to compare.",
        "Check the size estimate under the panel.",
        "Press Apply filter and download the result.",
      ],
      goodToKnow: [
        "Each look is a fixed mix of the red, green and blue channels, the kind of transform a colour matrix or a simple grade does, not a film emulation. Sepia is the standard sepia-tone matrix (the one CSS sepia() uses), Warm adds red and yellow and takes away some blue, Cool does the opposite, Vivid raises saturation and a touch of contrast, and Faded mutes colour and lifts the blacks to grey, as in old prints.",
        "Strength blends the look with the untouched picture: 100% is the full look, 50% halfway. Subtle settings survive better on skin tones; a strong Warm or Cool reads as a colour cast rather than a mood.",
        "The preview is exact: it applies the same numbers to the playing video that the encoder applies to each frame. The Before and After switch only changes the preview. Different screens and players show colour a little differently, so a look chosen on a laptop can read slightly warmer or cooler on a phone.",
        "There is no LUT upload on this page: .cube files and colour curves need a different kind of transform than these matrices. For your own balance of brightness, contrast and saturation, use [adjust video brightness](/adjust-video-brightness); for grey tones with a choice of how colours map to grey, [black and white video](/black-and-white-video).",
        "Every frame is re-encoded to H.264, so the file is new even if the look is gentle; the sound is copied when the container holds it. Several clips can share one look: drop them together. For a clip that plays inline in a chat or a slide, turn the result into a [GIF](/video-to-gif).",
      ],
      faq: [
        {
          q: "Which looks are there?",
          a: "Sepia, Warm, Cool, Vivid, Faded and Black and white, each with a strength from 0 to 100%.",
        },
        {
          q: "Can I use my own LUT?",
          a: "Not on this page. The looks here are fixed colour matrices; LUT files need a different transform.",
        },
        {
          q: "Will the result look like the preview?",
          a: "Yes: the preview uses the encoder's numbers. Other players and screens can show colour slightly differently.",
        },
        {
          q: "Is the sound changed?",
          a: "No. It is copied without re-encoding when the container holds it.",
        },
        {
          q: "Is my video uploaded?",
          a: "No. The look is applied to each frame in your browser, and the file never leaves your device.",
        },
      ],
    },
  },
};
