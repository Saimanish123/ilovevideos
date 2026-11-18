import type { ToolInput } from "../schema";

export const denoiseVideo: ToolInput = {
  slug: "denoise-video",
  engine: "clarity",
  category: "edit",
  phase: "p3",
  backends: ["webcodecs"],
  accepts: ["video"],
  produces: "video",
  presetOptions: { job: "denoise" },
  keywords: [
    "denoise video",
    "reduce grain in video",
    "remove grain from video",
    "fix grainy video",
    "low light video noise reduction",
  ],
  aliases: ["grain", "grainy", "noise reduction", "noisy", "low light", "degrain"],
  related: [
    "sharpen-video",
    "stabilize-video",
    "adjust-video-brightness",
    "compress-video",
    "change-video-bitrate",
    "black-and-white-video",
  ],
  updatedAt: "2026-11-18",
  icon: "blend",
  illustration: "denoise",
  content: {
    en: {
      title: "Denoise video",
      subtitle:
        "Clean up grainy low-light footage, with the grain measured for you. Runs in your browser.",
      metaTitle: "Denoise video online, free, no upload",
      metaDescription:
        "Reduce grain and picture noise in a video. The grain level is measured first; compare before and after on the picture. Runs in your browser. Free.",
      action: "Denoise",
      what: "This tool reduces the grain that cameras and phones add in dim light. It measures how much grain the video has, then replaces each pixel with an average of nearby pixels that look alike, both in the same frame and in the previous cleaned frame, so flat areas become smooth while edges and detail stay. This is about the picture; it does not touch background noise in the sound.",
      steps: [
        "Drop a grainy video onto the page; the grain is measured in five frames.",
        "Drag the divider on the picture to compare before and after, and play a dark scene.",
        "Keep Medium or pick Light or Strong, or fine-tune with the slider.",
        "Press Denoise, then download the cleaned video.",
      ],
      goodToKnow: [
        "The strength follows the grain the tool measures, shown in the line under the controls as a level of brightness (on the 0 to 255 scale of an ordinary video). Medium filters at about that level, so the same setting suits a mildly noisy phone clip and a very dark, grainy one. A clean video measures low and comes out almost unchanged. Light keeps more fine texture; Strong removes more grain and starts to smooth skin, grass and fabric.",
        "Each pixel is compared with the pixels around it by the small patch of picture they sit in. Patches that look alike, which grain does not change much, are averaged; patches across an edge do not look alike and are left out, so edges stay sharp. Looking at the previous frame as well doubles the evidence for still parts of the shot, and where something moves the patches stop matching and the frame is cleaned on its own, so moving things do not smear or leave trails.",
        "This is non-local means, the method behind FFmpeg's `nlmeans` filter, run on the graphics chip with a frame of memory added. The result's command uses `nlmeans` with the same patch and search size; it has no temporal part, so it removes a little less grain than this page at the same setting. Heavy denoising always costs some fine texture, so compare a detailed area against the divider before you settle on Strong.",
        "Grain is hard to compress: it changes in every frame, and the encoder spends bits on it. After denoising, the same picture quality fits in a smaller file, so [compress the video](/compress-video) afterwards if size matters. The picture here is encoded once to H.264 near the source's bitrate, and the sound is copied as it is where the container allows. If the footage is also soft, [sharpen it](/sharpen-video) after denoising, not before, so the grain is not lifted first.",
      ],
      faq: [
        {
          q: "Does this remove background noise from the sound?",
          a: "No. It cleans the picture only and copies the sound unchanged. Removing hiss or hum from the audio is a different job.",
        },
        {
          q: "Will it make faces look plastic?",
          a: "At Medium, rarely; at Strong, skin and fine fabric can look smoothed. Check a face against the divider and step down if it looks waxy.",
        },
        {
          q: "Why does the preview look less clean when paused?",
          a: "While playing, each frame is cleaned with help from the one before, as in the file. A paused or just-moved frame is cleaned on its own, which leaves a little more grain than the result will have.",
        },
        {
          q: "What does the grain level mean?",
          a: "It is the measured spread of the grain in brightness levels from 0 to 255. On the test clips behind this page, a clean picture measured under 1, light grain about 4 and heavy grain about 9.",
        },
        {
          q: "Is my video uploaded?",
          a: "No. Measuring, previewing and the final file all happen in your browser, and the video never leaves your device.",
        },
      ],
    },
  },
};
