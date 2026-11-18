import type { ToolInput } from "../schema";

export const changeVideoBitrate: ToolInput = {
  slug: "change-video-bitrate",
  engine: "bitrate",
  category: "compress",
  phase: "p2",
  backends: ["webcodecs"],
  accepts: ["video"],
  produces: "video",
  keywords: [
    "change video bitrate",
    "reduce video bitrate",
    "set video bitrate online",
    "video bitrate converter",
    "constant bitrate video",
  ],
  aliases: ["bitrate", "kbps", "mbps", "cbr", "vbr", "data rate"],
  related: [
    "compress-video",
    "change-video-codec",
    "change-video-frame-rate",
    "video-info",
    "extract-audio-from-video",
  ],
  updatedAt: "2026-11-18",
  icon: "gauge",
  illustration: "bitrate",
  content: {
    en: {
      title: "Change video bitrate",
      subtitle:
        "Re-encode a video at the exact video and audio bitrate you set. Runs in your browser.",
      metaTitle: "Change video bitrate online, free, no upload",
      metaDescription:
        "Set a video's bitrate in kb/s, variable or constant, and its audio bitrate or a copy. Size estimated before you start. Runs in your browser. Free.",
      what: "This tool re-encodes the picture of a video at a bitrate you choose, in kilobits per second, and either copies the sound as it is or re-encodes it at its own bitrate. It is for when a spec asks for a number: an upload limit per second, a streaming encoder's setting, a broadcaster's delivery sheet, or files that should match each other.",
      steps: [
        "Drop a video onto the page; its current bitrate is shown under the slider.",
        "Set the video bitrate with the slider or type it in kb/s.",
        "Choose the sound: copy it, pick a bitrate, or leave it out.",
        "Under More options, pick constant rate if your spec asks for it.",
        "Press Change bitrate; the result names the bitrate actually written.",
      ],
      goodToKnow: [
        "Bitrate is how many bits each second of video gets, so it sets the file size directly: size ≈ (video kb/s + audio kb/s) × seconds ÷ 8, in kilobytes. A 60-second clip at 4,000 kb/s video and 128 kb/s sound is about 31 MB. The estimate under the controls uses this sum plus about 1% for the container; the encoder lands near it, a little under on still footage.",
        "What a bitrate looks like depends on the codec, the frame size and how much moves. The tool keeps the source's codec where this browser can write it (such as VP9 in a WebM), because the same number buys more picture in a newer codec; otherwise it writes H.264, which every device plays. Asking for more than the source already has makes a bigger file but cannot restore detail the source lost, and the hint under the slider says so when you do.",
        "Variable rate, the default, lets busy scenes take more bits than still ones and averages to your number; it gives the best picture for a size. Constant rate holds every second near the number, which some streaming and broadcast specs require; it is offered only where this browser's encoder confirms it can. Frame size and frame rate are kept; to lower them, use [compress video](/compress-video) or [change frame rate](/change-video-frame-rate).",
        "The sound is copied packet for packet when the container can hold it, which changes nothing about it. Picking a number re-encodes it once to AAC (or Opus in WebM). 128 kb/s AAC suits speech and most music; going above 256 kb/s rarely helps. Leaving the sound out removes it. Check the written numbers afterwards with [video info](/video-info).",
      ],
      faq: [
        {
          q: "What bitrate should I use for 1080p?",
          a: "For H.264 at 30 fps, 4,000 to 8,000 kb/s looks clean for most footage; fast sport or grain needs more. The default here is a balanced starting point for your video's size and rate.",
        },
        {
          q: "Is this different from compressing?",
          a: "Compress video picks the bitrate for you from a quality preset or a target file size. This page is for when you need a specific number.",
        },
        {
          q: "Why is the written bitrate a little off?",
          a: "Encoders aim for the average, not each second, and spend less on still scenes. The result shows the real average read back from the file.",
        },
        {
          q: "Can I change only the audio bitrate?",
          a: "Not here: this page always re-encodes the picture. No page here changes only the sound's bitrate yet; in FFmpeg it is -c:v copy with a new -b:a.",
        },
        {
          q: "Is my video uploaded?",
          a: "No. The re-encode runs in your browser and the file never leaves your device.",
        },
      ],
    },
  },
};
