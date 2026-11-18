import type { ToolInput } from "../schema";

export const shiftSubtitleTiming: ToolInput = {
  slug: "shift-subtitle-timing",
  engine: "subtitles-convert",
  category: "captions",
  phase: "p1",
  backends: ["canvas"],
  accepts: ["subtitle"],
  produces: "subtitle",
  presetOptions: { job: "shift" },
  keywords: [
    "shift subtitle timing",
    "subtitles out of sync",
    "delay subtitles",
    "sync subtitles with video",
    "subtitle offset",
    "srt time shift",
  ],
  aliases: ["subtitle sync", "subtitle delay", "move subtitles earlier", "subtitles too late"],
  related: [
    "change-subtitle-frame-rate",
    "fix-subtitle-overlaps",
    "subtitle-converter",
    "add-subtitles-to-video",
    "extract-subtitles-from-video",
  ],
  updatedAt: "2026-09-30",
  icon: "clock",
  illustration: "shift-subtitles",
  content: {
    en: {
      title: "Shift subtitle timing",
      subtitle:
        "Move every subtitle earlier or later so it matches the video. Runs in your browser.",
      metaTitle: "Shift subtitle timing online, free, no upload",
      metaDescription:
        "Move SRT, WebVTT, ASS or SBV subtitles earlier or later by any amount, or set when the first line appears. Preview every cue. Free, runs in your browser.",
      action: "Shift",
      what: "Moves every cue in a subtitle file by the same amount, earlier or later, so the words appear when they are spoken. You can type the offset as a number of seconds, nudge it in steps, or say when the first line should appear and let the page work out the offset; the cue list shows each new time next to the old one before anything is written.",
      steps: [
        "Drop the subtitle file onto the page.",
        "Choose Earlier or Later and type how many seconds, or switch to First line at and type when the first line should start.",
        "Check the cue list: each moved cue shows its old time underneath.",
        "Press Shift and download the file, in the same format as the original.",
      ],
      goodToKnow: [
        "Find the offset in a player first. In VLC, play the video with the subtitles and press G or H to move them 50 ms at a time until they line up; the delay VLC shows is the number to type here, with the same sign. Alternatively note the time a line is actually spoken and the time the file gives it, and subtract.",
        "A constant offset means the whole file is early or late by the same amount, which happens when the subtitles were made for a release with a different intro or a trimmed opening. If the first lines match and later ones drift further and further off, the offset is not constant: the subtitles were timed for a different frame rate, and [changing the subtitle frame rate](/change-subtitle-frame-rate) fixes that where a shift cannot.",
        "Nothing can start before 0:00. When you move a file earlier, a cue that would end before the start of the video is removed and one that would straddle it starts at 0:00; the result says how many were affected so you can check the opening lines.",
        "The file keeps its own format and everything in it. An ASS script keeps its styles, override tags and Comment lines, a WebVTT file keeps its header, cue settings and notes, and an SRT keeps its tags and coordinates; only the times change. ASS times are written in hundredths of a second, as the format requires. To change the format as well, run the result through the [subtitle converter](/subtitle-converter).",
      ],
      faq: [
        {
          q: "My subtitles appear too late. Which way do I move them?",
          a: "Earlier. If a line shows 2 seconds after it is spoken, choose Earlier and type 2.",
        },
        {
          q: "Can I shift by less than a second?",
          a: "Yes. Type decimals such as 0.25, or use the 0.1 s buttons. Times are kept to the millisecond.",
        },
        {
          q: "The first lines are in sync but the end is off. Why?",
          a: "The subtitles were timed for another frame rate, so the error grows through the film. Change the subtitle frame rate instead of shifting.",
        },
        {
          q: "Does shifting keep my ASS styling?",
          a: "Yes. Only the Start and End of each line change; styles, positions, karaoke and comments are written back as they were.",
        },
        {
          q: "Is the file uploaded?",
          a: "No. The shift is applied in your browser and the new file is saved from there.",
        },
      ],
    },
  },
};
