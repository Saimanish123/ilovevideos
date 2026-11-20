import type { ToolInput } from "../schema";

export const changeVideoVolume: ToolInput = {
  slug: "change-video-volume",
  engine: "volume",
  category: "audio",
  phase: "p2",
  backends: ["webcodecs"],
  accepts: ["video"],
  produces: "video",
  presetOptions: { mode: "gain", input: "video" },
  keywords: [
    "increase video volume",
    "make video louder",
    "boost video volume",
    "lower video volume",
    "change video volume",
  ],
  aliases: ["louder", "boost volume", "quieter", "turn up sound", "amplify video"],
  related: ["normalize-audio", "fade-audio-in-video", "replace-audio-in-video", "compress-video"],
  updatedAt: "2026-10-01",
  icon: "volume-2",
  illustration: "video-volume",
  content: {
    en: {
      title: "Change video volume",
      subtitle: "Make a video's sound louder or quieter.",
      metaTitle: "Increase video volume online, free, no upload",
      metaDescription:
        "Boost or lower the sound of a video by a set number of decibels, with a limiter so it does not clip. The picture is copied. Runs on your device. Free.",
      what: "This tool turns the sound of a video up or down by the number of decibels you choose and writes a new file. The picture is copied into it exactly as it was, frame for frame; only the sound is decoded, changed and encoded again. A limiter keeps a boost from clipping, and the loudness of the source and of the result are measured, so you see what changed.",
      steps: [
        "Drop a video onto the page or choose one from your device.",
        "Pick a preset or drag the volume slider; the preview plays at the new level.",
        "Read the loudness readout: the level now, and where it will land.",
        "Press Change volume, then download the video.",
      ],
      goodToKnow: [
        "Decibels are a ratio, not a percentage. +6 dB doubles the height of the sound wave, but people hear about +10 dB as twice as loud, so a clip that is hard to hear usually needs +6 to +10 dB, and −6 dB takes a noisy clip down by a clear step without making it faint.",
        "Turning a quiet recording up raises everything in it: the voice, the room hiss and the hum of a fan, by the same amount. Volume cannot separate them. If the problem is that the voice is quiet next to loud music or effects, a single gain will not fix the balance.",
        "Digital sound has a hard ceiling. A boost that pushes the loudest moments past it would flatten their tops (clipping), which sounds like crackle. With Prevent clipping on, a look-ahead limiter turns only those moments down so they stay under −1 dBTP; the rest of the sound gets the full boost. Turn it off only if you want the plain gain and have checked the peaks.",
        "The readout gives the loudness in LUFS, measured the way broadcasters measure it (EBU R128): an average over the whole clip that leaves out silence, so a long pause does not make a clip look quieter than it sounds. The true peak beside it is the highest point of the wave, including between samples, which is what decides whether a boost needs the limiter.",
        "If you do not know how much to add, [normalise the loudness](/normalize-audio) instead: it measures the sound and picks the gain that reaches a standard level, which is the better choice when several clips should end up equally loud.",
      ],
      faq: [
        {
          q: "Does the picture lose quality?",
          a: "No. The video stream is copied without being decoded, so every frame is exactly as it was. Only the sound is re-encoded, once, to AAC at 192 kbps (Opus for WebM).",
        },
        {
          q: "How much louder can I make it?",
          a: "Up to +20 dB. Beyond about +12 dB a normal recording is mostly limiter and background noise; the readout shows how far the peaks would be held down.",
        },
        {
          q: "Can I make a video quieter?",
          a: "Yes. Choose −6 dB or drag the slider below zero; nothing is limited when the level goes down.",
        },
        {
          q: "Will it fix a video that already distorts?",
          a: "No. Sound that clipped when it was recorded stays clipped; turning it down only makes the distortion quieter.",
        },
        {
          q: "What happens to a second audio track?",
          a: "Only the first sound track is processed and kept. Keep the language you want first with [select audio tracks](/select-audio-tracks) if the video has several.",
        },
        {
          q: "Is my video uploaded?",
          a: "No. The file is read, processed and written in your browser; nothing is sent anywhere.",
        },
      ],
    },
  },
};
