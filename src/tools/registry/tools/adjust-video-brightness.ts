import type { ToolInput } from "../schema";

export const adjustVideoBrightness: ToolInput = {
  slug: "adjust-video-brightness",
  engine: "filter",
  category: "edit",
  phase: "p2",
  backends: ["webcodecs", "ffmpeg-wasm"],
  accepts: ["video"],
  produces: "video",
  presetOptions: { job: "adjust" },
  keywords: [
    "adjust video brightness",
    "brighten video",
    "make video brighter",
    "video too dark",
    "increase video contrast",
    "video saturation",
  ],
  aliases: [
    "brightness",
    "contrast",
    "saturation",
    "brighten",
    "darken",
    "exposure",
    "colour correction",
  ],
  related: [
    "black-and-white-video",
    "add-filter-to-video",
    "fade-video",
    "compress-video",
    "trim-video",
  ],
  updatedAt: "2026-10-01",
  icon: "sun",
  illustration: "brightness",
  content: {
    en: {
      title: "Adjust video brightness",
      subtitle: "Brighten a dark video and adjust its colours.",
      metaTitle: "Brighten video online, free, no upload",
      metaDescription:
        "Fix a video that is too dark: brightness, contrast and saturation sliders with a live preview, then a new file with the sound copied. Free, on your device.",
      action: "Apply",
      what: "This tool corrects the brightness, contrast and saturation of a whole video with three sliders and writes a new file. The preview plays with the changes as you move them, with a Before and After switch to compare, and it opens with a gentle lift that already helps most clips that came out too dark. The sound is copied as it is.",
      steps: [
        "Drop a video; the preview plays slightly brighter than the original.",
        "Move Brightness, Contrast and Saturation, or type values from −100 to 100.",
        "Switch Before and After, or press C, to check the change.",
        "Press Apply and download the corrected video.",
      ],
      goodToKnow: [
        "Brightness here lifts or deepens the midtones and leaves pure black and pure white where they are, like a gamma control. That is what a dark indoor clip needs: faces and rooms come up without the blacks turning grey or the window going flat white. At +100 the midtones are lifted as far as a gamma of 0.5; −100 is the same curve the other way.",
        "Contrast spreads or flattens the tones around mid grey: raising it deepens shadows and brightens highlights, and at high values the brightest and darkest details clip to pure white and black. Saturation sets how colourful the picture is, from −100 (black and white) to +100 (twice as saturated); skin turns orange quickly at high values, so small steps go a long way.",
        "A correction cannot bring back what the camera did not record. Brightening a very dark clip also brightens its noise, which shows as grain and blocky patches in flat areas, and highlights that were already pure white stay white. Small corrections on a well-exposed clip look best. If the picture is soft rather than dark, [sharpen video](/sharpen-video) instead.",
        "The preview applies the same numbers to the playing video that the encoder applies to every frame, so what you see is what you get; only different screens show it differently. The picture is re-encoded to H.264 and the sound is copied when the container holds it.",
        "For a ready-made look instead of sliders, try [add a filter to video](/add-filter-to-video); for grey tones, [black and white video](/black-and-white-video). If only part of the clip is too dark, cut that part out with [trim video](/trim-video) first, correct it, and join the pieces with [merge videos](/merge-videos).",
      ],
      faq: [
        {
          q: "My video is too dark. What settings should I use?",
          a: "Start with Brightness between +20 and +50 and look at faces; add a little Contrast if the result looks flat.",
        },
        {
          q: "Why does my brightened video look grainy?",
          a: "Dark footage carries noise that brightening makes visible. Keep the lift moderate, or add a little negative Saturation to calm coloured noise.",
        },
        {
          q: "Can I make a video darker?",
          a: "Yes. Negative Brightness deepens the midtones and keeps the highlights.",
        },
        {
          q: "Does it change the sound?",
          a: "No. Only the picture is corrected; the sound track is copied into the new file as it was.",
        },
        {
          q: "Is my video uploaded?",
          a: "No. The correction is applied to each frame in your browser, and nothing leaves your device.",
        },
      ],
    },
  },
};
