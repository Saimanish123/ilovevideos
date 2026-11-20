import type { ToolInput } from "../schema";

export const fixSubtitleOverlaps: ToolInput = {
  slug: "fix-subtitle-overlaps",
  engine: "subtitles-convert",
  category: "captions",
  phase: "p1",
  backends: ["canvas"],
  accepts: ["subtitle"],
  produces: "subtitle",
  presetOptions: { job: "fix" },
  keywords: [
    "fix overlapping subtitles",
    "subtitle overlap",
    "subtitles out of order",
    "fix srt file",
    "srt timing errors",
  ],
  aliases: ["overlapping subtitles", "repair subtitles", "sort subtitles"],
  related: ["shift-subtitle-timing", "change-subtitle-frame-rate", "subtitle-converter"],
  updatedAt: "2026-09-30",
  icon: "list-ordered",
  illustration: "subtitle-overlaps",
  content: {
    en: {
      title: "Fix overlapping subtitles",
      subtitle: "Fix subtitles that overlap or appear out of order.",
      metaTitle: "Fix overlapping subtitles, free, no upload",
      metaDescription:
        "Check SRT, WebVTT, ASS or SBV subtitles for overlapping, out-of-order, reversed, repeated and empty cues, with line numbers, and fix them in one pass.",
      action: "Fix",
      what: "Reads a subtitle file, lists every timing problem with the line it is on, and repairs them: cues are put in time order, a cue that runs into the next one is shortened, cues that start together are joined, a cue whose end comes before its start is given a length, and repeated or empty cues are removed. The cue list shows the repaired times next to the old ones before you save.",
      steps: [
        "Drop the subtitle file onto the page.",
        "Read the problems found; each names the line in the file.",
        "Check the repaired cues in the list, with the old times under the ones that changed.",
        "Press Fix and download the repaired file in its original format.",
      ],
      goodToKnow: [
        "Overlaps usually come from editing: a line lengthened by hand, two files joined, or captions merged from several passes. Players deal with them differently: browsers stack both cues on screen at once, and other players may show only one of them. A file without overlaps looks the same everywhere.",
        "Out-of-order cues are the other common fault. Some players read cues in file order and expect each to start after the one above it, so a cue that belongs later can be skipped or show at the wrong moment. Sorting by start time fixes that without changing any time.",
        "Each repair is a choice made for you, and the page says which. A cue that overlaps the next one ends when the next one starts. Two cues that start within a tenth of a second of each other are joined into one cue with both lines, the way two speakers are usually shown. A cue whose end is before its start stays up for its reading time, about 15 characters a second, but never into the next cue. Cues with no text, and exact repeats, are removed.",
        "ASS scripts are treated with care: lines on different layers or in different styles may overlap on purpose, a sign over dialogue for example, so only lines on the same layer and style are checked against each other, and styles and override tags are written back unchanged. If the whole file is simply early or late, this is the wrong tool: [shift the subtitle timing](/shift-subtitle-timing) instead.",
      ],
      faq: [
        {
          q: "What counts as an overlap?",
          a: "A cue that starts before the previous cue on the same track has ended. Cues that only touch, one ending exactly when the next starts, are fine.",
        },
        {
          q: "Will fixing change my text?",
          a: "Only where two cues start together: they are joined into one cue with both lines. Every other cue keeps its words exactly.",
        },
        {
          q: "Why did my file get fewer cues?",
          a: "Empty cues and exact repeats are removed, and cues that started together are joined. The result lists how many of each.",
        },
        {
          q: "Does it work on ASS files with signs?",
          a: "Yes. Lines on different layers or in different styles may overlap on purpose, so they are left alone; only lines on the same layer and style are fixed.",
        },
        {
          q: "Is the file uploaded?",
          a: "No. It is checked and repaired in your browser.",
        },
      ],
    },
  },
};
