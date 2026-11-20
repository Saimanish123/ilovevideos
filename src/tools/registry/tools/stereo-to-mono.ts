import type { ToolInput } from "../schema";

export const stereoToMono: ToolInput = {
  slug: "stereo-to-mono",
  engine: "convert-audio",
  category: "audio",
  phase: "p2",
  backends: ["webcodecs", "ffmpeg-wasm"],
  accepts: ["audio"],
  produces: "audio",
  presetOptions: { channels: 1, keepFormat: true },
  keywords: [
    "stereo to mono",
    "convert stereo to mono",
    "mp3 stereo to mono",
    "make audio mono",
    "mono audio converter",
  ],
  aliases: ["mono", "downmix", "single channel", "mix to mono"],
  related: [
    "audio-converter",
    "change-audio-sample-rate",
    "change-audio-volume",
    "normalize-audio",
  ],
  updatedAt: "2026-10-08",
  icon: "ear",
  illustration: "stereo-to-mono",
  content: {
    en: {
      title: "Convert stereo to mono",
      subtitle: "Both channels mixed into one, nothing lost on one side.",
      metaTitle: "Convert stereo to mono online, free, no upload",
      metaDescription:
        "Mix an MP3, WAV, M4A, FLAC or other stereo file down to one mono channel. Same format out, tags kept. Runs on your device. Free, no account.",
      action: "Make mono",
      what: "This tool mixes the channels of an audio file into a single mono channel and saves it in the format it came in, or another you choose. Left and right are averaged sample by sample, so a sound in only one ear ends up in both, at half its level.",
      steps: [
        "Drop a stereo audio file onto the page or choose one from your device.",
        "Keep the format it is saved in, or pick another under Save as.",
        "Press Make mono and download the file.",
      ],
      goodToKnow: [
        "A recording with the voice in only one channel, a lavalier into the left input of a two-channel recorder for example, sounds lopsided in headphones and vanishes on a speaker set to one side. Mono puts it in both ears: it is the fix for one-sided interviews and screen recordings.",
        "Averaging halves the level of anything that is only in one channel (−6 dB) and keeps anything that is in both at its level. Two channels that are out of phase, which happens with badly wired microphones, partly cancel: if the mono file sounds thin or hollow, the original channels were fighting each other.",
        "A mono file needs about half the data of a stereo one for the same quality. WAV and FLAC shrink by half; for MP3, M4A and OGG the size follows the bitrate you choose, so a mono file at a lower bitrate sounds as good as stereo at a higher one. Speech is fine at 96 kbps in mono.",
        "WAV and FLAC stay lossless apart from the mix. MP3, M4A, OGG and Opus are decoded and encoded once more. WAV and Opus are written by the browser itself; MP3, M4A, FLAC and OGG need a one-time download. To also change the sample rate, use [change audio sample rate](/change-audio-sample-rate); to convert between formats without mixing, use the [audio converter](/audio-converter).",
      ],
      faq: [
        {
          q: "Does converting to mono lose quality?",
          a: "It loses the stereo image, which is the point. The sound itself is kept at full resolution; lossy formats go through one more encode.",
        },
        {
          q: "Will my MP3 stay an MP3?",
          a: "Yes, unless you pick another format. Tags such as title and artist are kept.",
        },
        {
          q: "What happens to a file that is already mono?",
          a: "Nothing needs doing, and the page says so instead of writing a copy.",
        },
        {
          q: "Can I convert 5.1 surround to mono?",
          a: "Yes. The channels are mixed into one with the ITU-R BS.775 downmix: the centre, where dialogue sits, at full level, left and right 3 dB lower, the surrounds 6 dB lower and the LFE left out, then scaled so the mix cannot clip.",
        },
        {
          q: "Is my file uploaded?",
          a: "No. The mix is done in your browser on this device.",
        },
      ],
    },
  },
};
