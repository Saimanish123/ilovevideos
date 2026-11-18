import type { ToolInput } from "../schema";

export const subtitleConverter: ToolInput = {
  slug: "subtitle-converter",
  engine: "subtitles-convert",
  category: "captions",
  phase: "p1",
  backends: ["canvas"],
  accepts: ["subtitle"],
  produces: "subtitle",
  presetOptions: { job: "convert" },
  keywords: [
    "subtitle converter",
    "convert subtitles online",
    "subtitle format converter",
    "vtt to ass",
    "ass to vtt",
    "sbv to vtt",
  ],
  aliases: ["subtitle format", "caption converter", "convert captions"],
  related: [
    "srt-to-vtt",
    "vtt-to-srt",
    "ass-to-srt",
    "shift-subtitle-timing",
    "add-subtitles-to-video",
    "extract-subtitles-from-video",
  ],
  updatedAt: "2026-09-30",
  icon: "captions",
  content: {
    en: {
      title: "Convert subtitle files",
      subtitle:
        "Change subtitles between SRT, WebVTT, ASS, SBV and TXT in your browser. Nothing is uploaded.",
      metaTitle: "Subtitle converter online, free, no upload",
      metaDescription:
        "Convert subtitle files between SRT, WebVTT, ASS, SSA, SBV and plain text in your browser. See every cue and what the new format drops. Free, no upload.",
      action: "Convert",
      what: "Reads any SRT, WebVTT, ASS, SSA or SBV file, works out the format from what is inside rather than from the file name, and writes it again in the format you choose. Before you press Convert it shows every cue and lists, with counts, anything the new format cannot hold, such as ASS styles or WebVTT positions.",
      steps: [
        "Drop a subtitle file onto the page, or choose one from your device.",
        "Check the detected format and the cue list.",
        "Choose the output format and read what it keeps and drops.",
        "Press Convert and download the new file.",
      ],
      goodToKnow: [
        "Every format here stores the same core: a start time, an end time and the words. What differs is everything around that. SRT adds cue numbers and a few HTML-like tags, WebVTT adds positions, speakers and CSS classes, ASS adds full styling with fonts, colours and exact placement, and SBV and TXT add nothing at all. Converting towards a simpler format drops the extras and keeps the words; converting towards ASS adds one plain default style you can edit later.",
        "Files are recognised by content. A file called film.srt that starts with WEBVTT is read as WebVTT, and the page says so, because renamed files are common and a converter that trusts the extension writes broken output from them. Files that are not valid UTF-8 are read as Windows-1252, the usual legacy encoding for Western European subtitles; if accented letters look wrong in the cue list, the file was saved in another code page and should be re-saved as UTF-8 first.",
        "Italic, bold and underline survive every conversion between SRT, WebVTT and ASS, and a line placed at the top of the picture stays at the top: {\\an8} in SRT and ASS, line:0 in WebVTT. Plain SBV and TXT have no formatting, so those tags are removed there and the page says how many cues had them.",
        "A conversion never moves a cue. Times keep their milliseconds, except in ASS, which stores hundredths of a second. If the file has overlapping cues or cues out of order, the page marks them in the list and offers to fix them in the same pass; to move the whole file earlier or later, use [shift subtitle timing](/shift-subtitle-timing) instead.",
        "For the most common directions there are pages that explain what changes in detail: [SRT to WebVTT](/srt-to-vtt) for web players, [WebVTT to SRT](/vtt-to-srt) for TVs and editors, and [ASS to SRT](/ass-to-srt) for styled anime subtitles. When the subtitles are ready, [add them to the video](/add-subtitles-to-video) as a switchable track.",
      ],
      faq: [
        {
          q: "Which subtitle formats can it read?",
          a: "SRT, WebVTT (.vtt), ASS and SSA, and SBV. Each file is recognised from its content, so a wrong extension does not matter.",
        },
        {
          q: "Which format should I choose?",
          a: "SRT for TVs, players and most upload forms; WebVTT for a video on a web page; ASS when the subtitles need styling; TXT for a transcript you can read or paste.",
        },
        {
          q: "Will converting change the timing?",
          a: "No. Times are copied to the millisecond, or to the hundredth of a second for ASS, which cannot store more.",
        },
        {
          q: "Can it convert a whole folder of subtitle files?",
          a: "Yes. Drop several files together; each is converted to the chosen format and listed with its own download, plus one ZIP of all of them.",
        },
        {
          q: "Is my file uploaded?",
          a: "No. The file is read as text in your browser and the new file is written there too.",
        },
      ],
    },
  },
};
