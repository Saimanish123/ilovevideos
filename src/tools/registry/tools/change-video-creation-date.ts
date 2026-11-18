import type { ToolInput } from "../schema";

export const changeVideoCreationDate: ToolInput = {
  slug: "change-video-creation-date",
  engine: "edit-metadata",
  category: "info",
  phase: "p3",
  backends: ["canvas"],
  accepts: ["video"],
  produces: "video",
  presetOptions: { task: "date" },
  keywords: [
    "change video creation date",
    "change date of video",
    "edit video date",
    "fix video date",
    "change mp4 creation date",
    "change mov date taken",
  ],
  aliases: ["video date", "date taken", "creation time", "recorded date", "camera clock"],
  related: [
    "edit-video-metadata",
    "video-info",
    "remove-metadata-from-video",
    "optimize-video-for-web",
    "repair-video",
    "change-video-thumbnail",
  ],
  updatedAt: "2026-11-18",
  icon: "calendar-clock",
  illustration: "creation-date",
  content: {
    en: {
      title: "Change a video's creation date",
      subtitle: "Set or shift the recording date inside MP4 and MOV files, without re-encoding.",
      metaTitle: "Change video creation date online, free",
      metaDescription:
        "Set or shift the recording date of MP4 and MOV videos in your browser, with time zone. Fix a wrong camera clock across many files. No upload.",
      action: "Change date",
      what: "This tool changes the date a video says it was recorded. That date lives inside the file, in the movie header and every track header, and on Apple devices also in a creation date entry that carries the time zone. You either type the new date and time with its zone, or move every date by a fixed amount, which fixes a camera whose clock was wrong. Only those few bytes change; the picture and sound are copied exactly.",
      steps: [
        "Drop one MP4 or MOV, or several at once to fix a batch.",
        "Choose Set a date and type the date, time and time zone, or choose Shift by and enter how far, earlier or later.",
        "Check the card: it shows the date the file states now and what it becomes.",
        "Press Change date and download the copy; the card is read back from the new file.",
      ],
      goodToKnow: [
        "An MP4 or MOV stores its recording time in several places: the movie header, a header for each track, and a header for each track's media, all counted as seconds since 1904 in UTC. iPhones and Macs add an entry named com.apple.quicktime.creationdate that keeps the local time and its offset from UTC, such as 2023-06-01T12:34:56+0200, and FFmpeg can add a creation_time entry. This page rewrites each of these the file has, in the style it was written; it does not add an Apple entry to a file without one, and it leaves the date tag that players list, which [edit metadata](/edit-video-metadata) changes, as it was.",
        "Shift is for a camera clock that was simply wrong: an hour off after a change to summer time, a day off, or a clock never set after a battery change. Drop all the clips from that camera at once, choose the amount and the direction, and each file moves by the same amount from its own date, keeping the order and the gaps between them. Set gives every file the date you type, which suits one file or a set filmed at one moment.",
        "Time zones matter because the headers store UTC. When you set a date, type the time as it read on a clock where the video was filmed and pick that zone; the headers get the matching UTC time, and an Apple entry, where the file has one, keeps the local time with its offset. Many apps convert the UTC time to the viewer's own zone, which is why the same video can read 14:00 in Paris and 13:00 in London; apps that read the Apple entry may show the local time of filming instead.",
        "The file you download also has a date of its own, kept by your computer or phone: the time it was saved. That is the download time and no web page can set it, because browsers do not let a page write file system dates. Photo libraries and players that sort by when a video was filmed generally read the recording date inside the file, which is what this page changes.",
        "Nothing is re-encoded. The tool rewrites the header in place, and when the new text is longer it moves the index without touching a frame, so a 4 GB file takes as long as a small one. The card on this page reads the dates back from the new file; [the video inspector](/video-info) lists the file's other tags.",
      ],
      faq: [
        {
          q: "Why does my downloaded file still show today's date in the file browser?",
          a: "The file browser's created or modified date belongs to the copy on your disk and is the time you saved it. The recording date this tool changes is inside the video, where photo libraries usually read it.",
        },
        {
          q: "Can I fix a whole folder of clips from one camera?",
          a: "Yes. Drop them together, choose Shift by and the amount; each file moves by the same amount from its own date.",
        },
        {
          q: "Which formats work?",
          a: "MP4, MOV, M4V and other files of the same family. MKV and WebM keep their date elsewhere and are not changed here yet; convert them to MP4 first.",
        },
        {
          q: "Does it lower the quality?",
          a: "No. Only the dates in the header change; every frame and every sound sample is the original byte for byte.",
        },
        {
          q: "Is there a limit on the date?",
          a: "Most files store dates in a field that runs from 1904 to 6 February 2040; the page says so if a date does not fit. Dates before 1970 are not offered.",
        },
        {
          q: "Is my video uploaded?",
          a: "No. The header is read and rewritten in your browser and the file never leaves your device.",
        },
      ],
    },
  },
};
