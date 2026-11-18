import type { ToolInput } from "../schema";

export const loopVideo: ToolInput = {
  slug: "loop-video",
  engine: "loop",
  category: "edit",
  phase: "p2",
  backends: ["webcodecs"],
  accepts: ["video"],
  produces: "video",
  keywords: [
    "loop video",
    "repeat video",
    "loop video online",
    "make video longer by repeating",
    "loop a video 10 times",
    "video looper",
  ],
  aliases: ["repeat", "looper", "replay", "loop mp4", "make longer"],
  related: [
    "boomerang-video",
    "video-to-gif",
    "merge-videos",
    "trim-video",
    "reverse-video",
    "add-progress-bar-to-video",
  ],
  updatedAt: "2026-10-01",
  icon: "repeat-2",
  illustration: "loop",
  content: {
    en: {
      title: "Loop a video",
      subtitle:
        "Repeat a clip a number of times, or until it reaches a length, without re-encoding. In your browser.",
      metaTitle: "Loop video online, free, no upload",
      metaDescription:
        "Repeat a video 2, 5 or 100 times, or until it lasts 30 seconds or 10 minutes. Streams are copied, so nothing is re-encoded. Free, on your device.",
      what: "This tool writes one file in which your clip plays several times in a row. The encoded frames and sound are copied as they are for each play, joined end to end, so nothing is decoded and every play is bit for bit the original. Choose a number of plays, or a length to reach, and the panel shows the new running time and the size before anything is written.",
      steps: [
        "Drop a video onto the page.",
        "Choose how often it should play, or switch to To a length and pick how long the result must be at least.",
        "Check the new length and size at the top of the panel.",
        "Press Loop and download the file; the preview plays it.",
      ],
      goodToKnow: [
        "Because the frames are copied rather than re-encoded, looping is fast and lossless: a 20-second clip played ten times takes about as long to write as copying the file ten times, and looks exactly like the original. The ffmpeg equivalent is -stream_loop with -c copy, which is what the result card shows.",
        "A copy can only stop at the end of a play, so To a length rounds up to whole plays: a 7-second clip asked to reach 30 seconds plays five times and lasts 35 seconds. For an exact end time, loop first and then cut the result with [trim video](/trim-video).",
        "The sound is joined play to play the same way [merge videos](/merge-videos) joins clips: each join is off by at most half an audio packet, about 12 ms at 44.1 kHz, and the error never builds up over many plays. A clip whose last and first moments do not match will click or jump at each join; picking a loop point with trim first gives a smoother repeat.",
        "The size grows with every play, since each one is a full copy. The result is held in memory until you download it, so this page stops at 1 GB and says how many plays fit. Background loops for a screen or a website are usually better short: loop to the length needed, then [compress video](/compress-video) if the file is still large.",
        "Forwards and backwards in one play is a boomerang: it has its own page, [boomerang video](/boomerang-video), and the option here does the same. For a loop that plays by itself on a web page or in a chat without a player, a [GIF](/video-to-gif) of the original clip is often simpler than a long video.",
      ],
      faq: [
        {
          q: "Does looping reduce the quality?",
          a: "No. The frames are copied, not re-encoded, so every play is identical to the original.",
        },
        {
          q: "How many times can I loop a video?",
          a: "Up to 100 plays, as long as the result stays under 1 GB; the panel tells you if it would not.",
        },
        {
          q: "Can I loop a video to exactly one minute?",
          a: "It loops in whole plays, so it reaches at least a minute and stops at the end of that play. Trim the result for an exact minute.",
        },
        {
          q: "Is there a gap between plays?",
          a: "No. Each play starts where the previous one ended, picture and sound together.",
        },
        {
          q: "Which formats work?",
          a: "MP4, MOV, WebM and MKV, which stay in their own container. Older formats need converting to MP4 first.",
        },
        {
          q: "Is my video uploaded?",
          a: "No. The copy is made in your browser; nothing leaves your device.",
        },
      ],
    },
  },
};
