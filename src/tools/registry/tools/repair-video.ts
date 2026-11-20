import type { ToolInput } from "../schema";

export const repairVideo: ToolInput = {
  slug: "repair-video",
  engine: "repair",
  category: "info",
  phase: "p3",
  backends: ["webcodecs"],
  accepts: ["video"],
  produces: "video",
  keywords: [
    "repair video",
    "fix cut off video",
    "repair mp4",
    "fix video that won't play",
    "recover cut off video",
    "repair mkv",
  ],
  aliases: ["fix video", "corrupt video", "broken mp4", "truncated video", "moov atom not found"],
  related: [
    "video-info",
    "video-converter",
    "optimize-video-for-web",
    "change-video-creation-date",
    "trim-video",
  ],
  updatedAt: "2026-11-18",
  icon: "wrench",
  content: {
    en: {
      title: "Repair a video file",
      subtitle: "Find out why a video will not play and save what you can.",
      metaTitle: "Repair a cut-off video online, free, no upload",
      metaDescription:
        "Find out why an MP4, MOV, MKV or WebM will not play, and copy every complete frame of a cut-off file into one that does. No re-encoding, no upload.",
      action: "Repair",
      what: "This tool reads the structure of a video that will not play or stops early, says what is wrong, and when it can, writes a working copy. A file cut off before its end, by an interrupted download, a full card or a crash, keeps every frame and sound packet that is complete; they are copied into a new file with a fresh index, without re-encoding. A file whose index was never written is diagnosed, and the page says plainly that it cannot be rebuilt here.",
      steps: [
        "Drop the video that will not play.",
        "Read the diagnosis: what is missing, and how much of the picture and sound is complete.",
        "Press Repair when the page offers it.",
        "Play the repaired copy on the page, then download it.",
      ],
      goodToKnow: [
        "An MP4 or MOV keeps an index, the moov box, that lists where every frame and sound packet sits. A file cut off after the index was written, for example a download that stopped early when the index is at the front, still knows where everything was meant to be. The page checks each listed packet against the file's real length, keeps every one that is complete, and ends picture and sound together at the earliest gap so they stay in sync.",
        "Phones and cameras usually write the index last, when you press stop. If the battery died, the app crashed or the card filled up, the picture and sound are in the file but nothing says where each frame starts. Rebuilding that index needs the exact settings of the recording, taken from another recording made the same way, and boundaries the sound data does not mark on its own; this page does not attempt it, because a guessed index gives a file that plays wrongly. The open-source program untrunc does this on a computer with a reference file from the same device.",
        "Recordings written in fragments, as browsers, screen recorders and some cameras do, carry a small index in every few seconds of video. When such a file is cut off, every fragment before the cut is whole and the last one is partial; the repaired copy keeps the whole fragments and leaves out the partial one.",
        "MKV and WebM recordings, the formats OBS and browser recorders often use, can stop without their total size, duration or seek index. Players then show no length or cannot jump. The repair reads every block that is still there and writes a finished file with its duration and index, again copying the data as it is; [convert it to MP4](/mkv-to-mp4) afterwards if a device needs MP4.",
        "Repair cannot bring back what is not in the file: a copy ends where the complete data ends. A file whose index is there but damaged, or whose frames are corrupt partway through, is not repaired here either. A file that is complete but still will not play usually has a codec the device cannot decode rather than damage; [the video inspector](/video-info) shows the codec, and [the converter](/video-converter) re-encodes it to H.264.",
      ],
      faq: [
        {
          q: 'What does "moov atom not found" mean?',
          a: "The file has picture and sound but no index, usually because the recording stopped before the app could write it. This page diagnoses that case but cannot rebuild the index; untrunc can sometimes, with a reference recording from the same device.",
        },
        {
          q: "Will the repaired video lose quality?",
          a: "No. The complete frames and sound are copied byte for byte into a new file; nothing is re-encoded.",
        },
        {
          q: "Why is the repaired video shorter than the original said?",
          a: "The original was cut off. The index promised more than the file holds, and only the complete part can be kept.",
        },
        {
          q: "Which formats can be repaired?",
          a: "MP4 and MOV cut off with their index intact, fragmented MP4, and MKV or WebM that stop early. Other formats are not read here.",
        },
        {
          q: "Is my video uploaded?",
          a: "No. The file is read and the copy written in your browser; it never leaves your device.",
        },
      ],
    },
  },
};
