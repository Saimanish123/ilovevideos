import type { ToolInput } from "../schema";

export const mergeAudio: ToolInput = {
  slug: "merge-audio",
  engine: "join-audio",
  category: "audio",
  phase: "p2",
  backends: ["webcodecs", "ffmpeg-wasm"],
  accepts: ["audio"],
  produces: "audio",
  keywords: [
    "merge audio files",
    "join mp3 files",
    "combine audio files",
    "merge mp3",
    "join audio files into one",
    "audio joiner",
  ],
  aliases: ["join audio", "combine mp3", "concatenate audio", "mp3 joiner", "merge songs"],
  related: ["merge-videos", "trim-audio", "normalize-audio", "audio-converter"],
  updatedAt: "2026-11-18",
  icon: "merge",
  content: {
    en: {
      title: "Merge audio files",
      subtitle:
        "Join MP3, WAV, M4A and other audio files end to end into one file, in your browser.",
      metaTitle: "Merge audio files and join MP3 online, free",
      metaDescription:
        "Join up to 50 audio files into one, end to end, with gaps or crossfades. Matching MP3s are joined without re-encoding. On your device. Free.",
      action: "Merge",
      what: "This tool puts several audio files one after another into a single file: chapters into an audiobook, takes into one recording, songs into a mix. You set the order, choose whether files follow each other directly, with a pause between them or with a crossfade, and pick the format of the result.",
      steps: [
        "Drop two or more audio files onto the page; you can add more up to 50.",
        "Drag the rows into the order they should play.",
        "Choose end to end, a gap of silence or a crossfade between files, and the format to save as.",
        "Press Merge and download the joined file.",
      ],
      goodToKnow: [
        "MP3 files at the same sample rate and in the same layout, stereo or mono, joined end to end with Match loudness off, are joined frame for frame: the result contains exactly the frames of the originals, so nothing is lost and it is done almost as fast as the files can be read. A new header at the start counts and indexes the joined frames and tells players where the sound of the first file starts and where the last one ends, so seeking and the shown length are right.",
        "An MP3 encoder adds a few hundredths of a second of padding at the start and end of every file. A frame-for-frame join keeps it at each inner join, 13 to 39 ms for files made with LAME, which nobody notices between chapters or separate songs but can be heard in music that runs continuously across files, such as a live album. For such music choose a crossfade, Match loudness or another format under Save as: the files are then decoded with the padding removed and encoded once.",
        "Files of different kinds are decoded and joined as sound, then saved once. Files at other sample rates are resampled to the first file's rate with a band-limited filter, so no false tones fold back into the sound, and a mono file plays on both sides next to stereo ones. WAV and FLAC results are lossless from the decoded sound; MP3 and M4A results are encoded at 192 kbps. MP3 and FLAC results are written by FFmpeg on this device, which downloads once.",
        "Match loudness measures each file the way broadcasters do (EBU R128) and brings every file to the middle loudness of the set, holding peaks under −1 dBTP, so a quiet phone recording does not vanish between studio tracks. The crossfade overlaps each pair of files with an equal-power curve, which keeps the level steady through the change; it is shortened if a file is too short for it.",
        "To join video clips with their pictures, use [merge videos](/merge-videos). To even out the loudness of the finished file as a whole, [normalise it](/normalize-audio) afterwards; to cut the result down, [trim the audio](/trim-audio).",
      ],
      faq: [
        {
          q: "Will merging MP3 files lower their quality?",
          a: "Not when they share a sample rate and layout and are joined end to end: the frames are copied as they are. Gaps, crossfades and loudness matching need one new encode at 192 kbps.",
        },
        {
          q: "Can I merge files of different formats?",
          a: "Yes. MP3, M4A, WAV, FLAC, OGG and Opus files can be mixed in one list; they are decoded and saved together in the format you choose, where this browser can decode them; the page names any file it cannot.",
        },
        {
          q: "How many files can I join?",
          a: "Up to 50 at a time. The joined sound is written to storage on your device as it grows rather than held in memory.",
        },
        {
          q: "Can I put silence between the files?",
          a: "Yes. Choose Gap and set the seconds of silence that follow each file except the last.",
        },
        {
          q: "Are my files uploaded?",
          a: "No. The files are joined in your browser and never leave this device.",
        },
      ],
    },
  },
};
