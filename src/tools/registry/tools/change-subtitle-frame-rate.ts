import type { ToolInput } from "../schema";

export const changeSubtitleFrameRate: ToolInput = {
  slug: "change-subtitle-frame-rate",
  engine: "subtitles-convert",
  category: "captions",
  phase: "p1",
  backends: ["canvas"],
  accepts: ["subtitle"],
  produces: "subtitle",
  presetOptions: { job: "fps" },
  keywords: [
    "change subtitle frame rate",
    "subtitle 23.976 to 25",
    "subtitles drift out of sync",
    "convert subtitle fps",
    "pal subtitles",
  ],
  aliases: ["subtitle fps", "subtitle drift", "25 fps subtitles"],
  related: ["shift-subtitle-timing", "fix-subtitle-overlaps", "video-info"],
  updatedAt: "2026-09-30",
  icon: "gauge",
  content: {
    en: {
      title: "Change subtitle frame rate",
      subtitle:
        "Re-time subtitles made for 23.976 fps to play with a 25 fps video, or back. Runs in your browser.",
      metaTitle: "Change subtitle frame rate: 23.976 to 25 fps",
      metaDescription:
        "Re-time subtitles that drift further out of sync as the video plays: SRT, WebVTT, ASS or SBV between 23.976, 24, 25, 29.97 and 30 fps. No upload.",
      action: "Change frame rate",
      what: "Re-times a subtitle file made for a video at one frame rate so it plays with the same film at another, by multiplying every time by the ratio of the two rates. It fixes subtitles that start in sync and drift further off as the film goes on, which a plain shift cannot.",
      steps: [
        "Drop the subtitle file onto the page.",
        "Choose the frame rate the subtitles were made for and the frame rate of your video.",
        "Check the cue list and the line that says how far the last cue moves.",
        "Press Change frame rate and download the file in its original format.",
      ],
      goodToKnow: [
        "The usual cause is PAL speed-up. Films are shot at 24 frames a second (23.976 for NTSC video), and European broadcast and DVD releases played them at 25, so the same film runs about 4% faster and ends several minutes sooner. Subtitles timed for one release are right at the start of the other and then fall behind: from 23.976 to 25 fps a line at 1:30:00 belongs at about 1:26:19.",
        "The smaller cases are 23.976 against 24 and 29.97 against 30, where the rates differ by one part in a thousand. That is 3.6 seconds an hour: barely noticeable at first, clearly late by the end of a feature film.",
        "Choose the two rates in the right order. The first is what the subtitles were made for, the second is the video you have; the swap button reverses them. If you do not know the video's rate, the [video info](/video-info) tool shows it. When the drift is fixed but every line is still early or late by the same amount, [shift the timing](/shift-subtitle-timing) as a second step.",
        "Only times change. Frame rate does not appear anywhere inside SRT, WebVTT or SBV files, and ASS stores times rather than frames, so nothing else in the file needs rewriting; styles, tags and comments are kept as they were.",
      ],
      faq: [
        {
          q: "My subtitles are in sync at the start but late at the end. What do I choose?",
          a: "Subtitles that fall behind were made for a slower frame rate than your video. The common case is made for 23.976, video at 25.",
        },
        {
          q: "What is PAL speed-up?",
          a: "Playing a 24 fps film at the 25 fps of European television, which makes it about 4% faster and shorter. Subtitles have to be re-timed to match.",
        },
        {
          q: "Does this change the video?",
          a: "No. Only the subtitle file is changed; the video stays as it is.",
        },
        {
          q: "Can I combine this with a shift?",
          a: "Yes. Re-time first, then shift the result if the whole file is still early or late by a fixed amount.",
        },
        {
          q: "Is the file uploaded?",
          a: "No. The new times are calculated in your browser.",
        },
      ],
    },
  },
};
