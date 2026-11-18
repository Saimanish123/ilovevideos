import type { ToolInput } from "../schema";

export const addProgressBarToVideo: ToolInput = {
  slug: "add-progress-bar-to-video",
  engine: "time-overlay",
  category: "edit",
  phase: "p3",
  backends: ["webcodecs"],
  accepts: ["video"],
  produces: "video",
  presetOptions: { kind: "progress" },
  keywords: [
    "add progress bar to video",
    "video progress bar",
    "progress bar overlay",
    "animated progress bar for video",
    "timeline bar on video",
  ],
  aliases: ["progress bar", "loading bar", "time bar", "progress indicator"],
  related: [
    "add-timer-to-video",
    "add-text-to-video",
    "add-subtitles-to-video",
    "trim-video",
    "compress-video",
  ],
  updatedAt: "2026-11-18",
  icon: "panel-bottom",
  content: {
    en: {
      title: "Add a progress bar to a video",
      subtitle: "Draw a bar that fills as the video plays, along the top or bottom edge.",
      metaTitle: "Add a progress bar to a video online, free",
      metaDescription:
        "Burn a progress bar into a video: top or bottom, any colour and thickness, for the whole video or a part. Runs in your browser; nothing is uploaded.",
      action: "Add progress bar",
      what: "This tool draws a bar across the top or bottom of the picture that grows from left to right as the video plays, so a viewer can see how far through they are even where the player shows no timeline: in a feed, on a looping screen, or in a clip shared to a chat. The bar becomes part of the picture, so it shows in every player.",
      steps: [
        "Drop the video onto the page; a white bar appears along the bottom of the preview.",
        "Choose the edge, the thickness and the colour; the preview draws the bar at the moment you are looking at.",
        "To measure only part of the video, drag the handles on the timeline under the preview.",
        "Press Add progress bar, check the result in the preview, then download it.",
      ],
      goodToKnow: [
        "The bar is empty on the first frame of the range and full on its last frame, measured frame by frame from the video's own timestamps, so it moves at an even pace and never stops short of the end. Its leading edge is drawn at a fraction of a pixel, which keeps the movement smooth on a long video where the bar grows by less than a pixel per frame.",
        "Thickness is measured against the picture's shorter side, so Medium is about 11 pixels on a 1080p video and the same share on a vertical 1080×1920 one. Thin suits a quiet indicator on a talk or a tutorial; Thick reads on a phone held at arm's length. The number field beside the presets takes an exact height in pixels.",
        "The see-through track under the bar shows where it ends. It is dark under a light bar and light under a dark one, so it reads on bright and dark footage alike; turn it off for a bar that seems to grow out of the edge. Feed apps and players draw their own controls and captions over the lower part of the picture, so the top edge, or a bar lifted off the edge under More options, can stay clearer.",
        "The range on the timeline sets what the bar measures. Leave out an intro or the credits and the bar fills over the part that counts, and it is not drawn outside the range. For a count in numbers instead, [add a timer](/add-timer-to-video), which counts up or down in the same way.",
        "Only the rows the bar covers change, but H.264 cannot patch part of a frame, so every frame is encoded once more at a bitrate close to the source's; the sound is copied unchanged where the container allows. A file that only the fallback engine can read, such as an AVI or WMV, needs converting to MP4 first; the page offers the converter.",
      ],
      faq: [
        {
          q: "Will the bar reach the end exactly when the video ends?",
          a: "Yes. It is full on the last frame of the chosen range, worked out from each frame's time, not from a timer running beside the video.",
        },
        {
          q: "Can the bar measure only part of the video?",
          a: "Yes. Drag the handles on the timeline to the part it should measure; it is not drawn before or after that part.",
        },
        {
          q: "Can I choose any colour?",
          a: "Yes. White, black, yellow and red are one choice away, and the custom picker takes any colour, shown with its hex code.",
        },
        {
          q: "Does adding a progress bar lower the quality?",
          a: "The picture is encoded once more at a bitrate close to the original's, which costs very little; the sound is copied as it is where the file allows.",
        },
        {
          q: "Is my video uploaded?",
          a: "No. The bar's length is worked out from each frame's time and drawn on that frame in your browser, and the file is written there too.",
        },
      ],
    },
  },
};
