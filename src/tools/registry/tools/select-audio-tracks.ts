import type { ToolInput } from "../schema";

export const selectAudioTracks: ToolInput = {
  slug: "select-audio-tracks",
  engine: "audio-tracks",
  category: "audio",
  phase: "p2",
  backends: ["webcodecs"],
  accepts: ["video"],
  produces: "video",
  keywords: [
    "remove audio track from mkv",
    "select audio track",
    "remove second audio track",
    "keep one audio track",
    "change default audio track",
  ],
  aliases: ["audio tracks", "language track", "remove commentary", "default audio", "dual audio"],
  related: ["remove-audio-from-video", "video-info", "mkv-to-mp4", "fix-audio-sync"],
  updatedAt: "2026-10-01",
  icon: "languages",
  content: {
    en: {
      title: "Select audio tracks",
      subtitle:
        "Keep the languages you want in a multi-track video and drop the rest, without re-encoding.",
      metaTitle: "Remove or keep audio tracks in MKV and MP4",
      metaDescription:
        "See every audio track of an MKV or MP4 with its language and codec, keep the ones you want and choose which plays first. Copied, not re-encoded. Free.",
      action: "Keep tracks",
      what: "This tool lists every sound track in a video, with its title, language, codec and channels, and writes a copy that keeps only the ones you tick. The track you choose to play first is written first and marked as the default, so players and phones start with it. Picture and sound are copied packet for packet; nothing is re-encoded.",
      steps: [
        "Drop a video with several audio tracks, usually an MKV or an MP4.",
        "Tick the tracks to keep; each row shows its language, codec and channels.",
        "If you keep more than one, choose which plays first.",
        "Press Keep tracks and download the copy.",
      ],
      goodToKnow: [
        "Many players ignore the track you picked last time and start with the file's default. Keeping only one language, or marking the one you want as the default and putting it first, is how a film plays in the right language on a TV, a phone or a game console that has no track menu.",
        "Each extra sound track is a full-length stream: a 5.1 AC-3 track at 448 kbps adds about 400 MB to a two-hour film, so removing unwanted languages and commentaries often shrinks a file noticeably without touching the picture.",
        "Nothing is decoded, so tracks the browser cannot play, such as AC-3 in an MKV, are copied just as well as AAC or Opus. The output keeps the container: an MKV stays MKV and an MP4 stays MP4. Titles and language tags come along with each track.",
        "Soft subtitle tracks, chapters and attached fonts are not carried over: this tool copies only picture and sound. If you need them, keep the original, or add a subtitle file back afterwards with [add subtitles](/add-subtitles-to-video).",
        "To see what a file holds before choosing, open it in [video info](/video-info). To drop every sound track at once, use [remove audio from video](/remove-audio-from-video).",
      ],
      faq: [
        {
          q: "Is anything re-encoded?",
          a: "No. The picture and every kept sound track are copied byte for byte, so quality is unchanged and a large film takes about as long as copying it.",
        },
        {
          q: "How do I change which audio track plays by default?",
          a: "Keep the tracks you want and choose the one under Plays first. It is written as the first sound track and marked default; the others are marked not default.",
        },
        {
          q: "Why does a track show no language?",
          a: "The file does not say. Many recordings leave the language tag empty; the row then shows the track's title or its number, codec and channels.",
        },
        {
          q: "Can I keep all tracks and only change the order?",
          a: "Yes. Keep them all and choose a different track under Plays first.",
        },
        {
          q: "Does it work on large files?",
          a: "The file is read in pieces, but the copy is assembled in memory before you download it, so a phone may run out of room with a multi-gigabyte film. A desktop browser handles several gigabytes.",
        },
        {
          q: "Is my video uploaded?",
          a: "No. The tracks are read and copied in your browser on this device.",
        },
      ],
    },
  },
};
