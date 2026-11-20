import type { ToolInput } from "../schema";

export const changeAudioSampleRate: ToolInput = {
  slug: "change-audio-sample-rate",
  engine: "convert-audio",
  category: "audio",
  phase: "p2",
  backends: ["webcodecs", "ffmpeg-wasm"],
  accepts: ["audio"],
  produces: "audio",
  presetOptions: { resample: true, keepFormat: true },
  keywords: [
    "change sample rate",
    "48khz to 44.1khz",
    "44.1khz to 48khz",
    "resample audio",
    "convert audio to 16khz",
  ],
  aliases: ["resample", "sample rate converter", "khz", "44100", "48000"],
  related: ["stereo-to-mono", "audio-converter", "normalize-audio"],
  updatedAt: "2026-10-01",
  icon: "sliders-horizontal",
  illustration: "sample-rate",
  content: {
    en: {
      title: "Change audio sample rate",
      subtitle: "48 kHz to 44.1 kHz, or 16 kHz for speech software.",
      metaTitle: "Change audio sample rate online, free",
      metaDescription:
        "Resample WAV, MP3, FLAC, M4A or OGG to 8, 16, 22.05, 44.1 or 48 kHz, in the same format or another. Runs on your device, nothing uploaded. Free.",
      action: "Resample",
      what: "This tool converts an audio file from one sample rate to another, most often between 48 kHz, the rate of video and many recorders, and 44.1 kHz, the rate of CDs and most music, or down to 16 kHz for speech software. The file keeps its format unless you choose another.",
      steps: [
        "Drop an audio file onto the page or choose one from your device; its current rate is shown.",
        "Choose the new sample rate.",
        "Keep the format or pick another under Save as, then press Resample and download.",
      ],
      goodToKnow: [
        "The sample rate is how many times per second the sound is measured. It sets the highest frequency a file can hold, a little under half the rate: 22 kHz at 44.1 kHz, 24 kHz at 48 kHz, and 8 kHz at 16 kHz, which is plenty for speech but dull for music.",
        "Raising the rate adds no detail: a 22.05 kHz file resampled to 48 kHz holds exactly what it did, in more samples. Do it when software demands a rate, such as an editor timeline at 48 kHz or a device that only plays 44.1 kHz, not to improve the sound.",
        "Speech recognition services and telephone systems often ask for 16 kHz or 8 kHz mono; pair this with [stereo to mono](/stereo-to-mono) for a file that uploads quickly and is accepted everywhere. Opus always runs at 48 kHz internally, so it is left at 48 kHz here.",
        "Every rate change goes through a resampler that filters before it drops samples, so high frequencies do not fold back as noise. It is a one-time download the first time. WAV, FLAC and AIFF stay lossless apart from the rate change; MP3, M4A and OGG are encoded again.",
      ],
      faq: [
        {
          q: "Should I use 44.1 kHz or 48 kHz?",
          a: "48 kHz for anything going into a video; 44.1 kHz for music meant for CD or streaming uploads that ask for it. Either sounds the same to listeners.",
        },
        {
          q: "Does resampling lose quality?",
          a: "Going down removes the frequencies the new rate cannot hold, and they are filtered out cleanly first; going up adds nothing. Lossy formats also go through one more encode.",
        },
        {
          q: "Can I change the bit depth too?",
          a: "WAV keeps 24 bits when the source has them and uses 16 bits otherwise. There is no separate bit-depth control here.",
        },
        {
          q: "What does the file show before I start?",
          a: "Its codec, bitrate and current sample rate, read from the file, so you can see whether it needs changing at all.",
        },
        {
          q: "Is my file uploaded?",
          a: "No. Resampling happens in your browser on this device.",
        },
      ],
    },
  },
};
