import type { ToolInput } from "../schema";

export const compressVideo: ToolInput = {
  slug: "compress-video",
  engine: "compress",
  category: "compress",
  phase: "p1",
  backends: ["webcodecs", "ffmpeg-wasm"],
  accepts: ["video"],
  produces: "video",
  keywords: [
    "compress video",
    "compress video online",
    "reduce video size",
    "video compressor",
    "make video smaller",
  ],
  aliases: ["shrink", "reduce size", "smaller", "file size"],
  related: [
    "compress-video-for-discord",
    "compress-video-for-whatsapp",
    "compress-video-for-email",
    "compress-video-under-25mb",
    "trim-video",
    "mov-to-mp4",
  ],
  updatedAt: "2026-09-30",
  icon: "minimize-2",
  content: {
    en: {
      title: "Compress video",
      subtitle: "Make a video smaller without visible quality loss. Runs in your browser.",
      metaTitle: "Compress video online, free, no upload",
      metaDescription:
        "Reduce video file size in your browser. Choose a target size or quality. Files never leave your device. Free, no account, no watermark.",
      what: "This tool re-encodes your video at a lower bitrate, optionally capping the resolution, so the file takes less space while looking the same to most viewers. It runs entirely on your device using your browser's built-in hardware encoder where available, so a 500 MB phone clip typically finishes in under a minute and is never uploaded anywhere.",
      steps: [
        "Drop a video file onto the page or choose one from your device.",
        "Pick a preset (Smaller, Balanced, Best quality) or set a target file size.",
        "Optionally cap the resolution, for example 4K to 1080p; the width follows to keep the aspect ratio.",
        "Press Compress and watch the real progress.",
        "Download the result. The original is untouched.",
      ],
      goodToKnow: [
        "Most of a video's size comes from bitrate, not resolution. Halving the bitrate roughly halves the file; going from 4K to 1080p on a phone clip often saves 60–75% with no visible change on a phone screen.",
        "Size mode works backwards from a number: it divides the size by the duration, lowers the audio bitrate and then the resolution when the budget is tight, and measures the finished file. Encoders are not perfectly predictable, so when the first attempt comes out over, it encodes once more at a corrected bitrate. For a known limit there are ready pages: [Discord](/compress-video-for-discord), [WhatsApp](/compress-video-for-whatsapp), [email](/compress-video-for-email), and sizes from [under 8 MB](/compress-video-under-8mb) to [under 100 MB](/compress-video-under-100mb).",
        "H.264 (AVC) is the safest output: it plays everywhere. HEVC and AV1 are 30–50% smaller at the same quality but older devices and some chat apps will not play them. This tool defaults to H.264 for that reason.",
        "Audio is usually a small part of the file. We keep it at 128 kbps AAC by default, which is transparent for speech and most music. If your video is silent, [remove the audio track](/remove-audio-from-video) first for a few extra percent. To set an exact number in kb/s instead, use [change video bitrate](/change-video-bitrate).",
        "Compressing an already heavily compressed video (for example one downloaded from a chat app) will show artifacts sooner. Start from the highest-quality copy you have.",
      ],
      faq: [
        {
          q: "Is the video uploaded to a server?",
          a: "No. Compression runs inside your browser using WebCodecs and WebAssembly. You can disconnect from the internet after the page loads and it will still work.",
        },
        {
          q: "How much smaller will my video get?",
          a: "It depends on the source. Phone recordings are usually encoded at very high bitrates and shrink 50–80% with no visible loss. Videos that were already compressed for the web shrink less.",
        },
        {
          q: "Will there be a watermark?",
          a: "No. There are no watermarks, accounts or limits on the number of files.",
        },
        {
          q: "What is the maximum file size?",
          a: "There is no fixed limit. Because processing happens on your device, the practical limit is your device's memory and disk space. Multi-gigabyte files work on desktop; on phones, files over about 2 GB may fail depending on the device.",
        },
        {
          q: "Does it work on iPhone and Android?",
          a: "Yes, in Safari, Chrome and Firefox. Phones are slower than laptops and hardware encoding availability varies, so a long 4K clip may take several minutes.",
        },
      ],
    },
  },
};
