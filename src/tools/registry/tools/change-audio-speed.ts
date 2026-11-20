import type { ToolInput } from "../schema";

export const changeAudioSpeed: ToolInput = {
  slug: "change-audio-speed",
  engine: "speed",
  illustration: "audio-speed",
  category: "audio",
  phase: "p2",
  backends: ["ffmpeg-wasm"],
  accepts: ["audio"],
  produces: "audio",
  presetOptions: { input: "audio" },
  keywords: [
    "change audio speed",
    "speed up audio",
    "slow down audio",
    "speed up mp3",
    "change tempo without changing pitch",
  ],
  aliases: ["tempo", "speed up podcast", "slow down song", "playback speed"],
  related: ["change-video-speed", "trim-audio", "change-audio-volume", "audio-converter"],
  updatedAt: "2026-11-18",
  icon: "gauge",
  content: {
    en: {
      title: "Change audio speed",
      subtitle: "Speed up or slow down an audio file.",
      metaTitle: "Speed up or slow down audio online, free",
      metaDescription:
        "Make an MP3, M4A, WAV or other audio file faster or slower, from 0.25× to 4× and beyond, with the pitch kept or shifted. On your device. Free.",
      action: "Change speed",
      what: "This tool makes an audio file play faster or slower and saves it in its own format. Keep pitch stretches the sound in time so voices still sound like themselves, the way a podcast app's 1.5× does; Shift pitch changes speed and pitch together, like a record played at the wrong speed. The player plays at the new speed before you save.",
      steps: [
        "Drop an audio file onto the page or choose one from your device.",
        "Choose a speed, or type an exact one from 0.1× to 8×.",
        "Choose Keep pitch or Shift pitch, and press play to hear it.",
        "Press Change speed and download the file.",
      ],
      goodToKnow: [
        "Keep pitch works in steps of 0.5× to 2× and chains itself for anything beyond, so 4× is two passes of 2×. Speech usually stays clear to about 2×; music tends to smear sooner, because the stretch repeats or drops short overlapping pieces of the sound to change its length.",
        "Shift pitch resamples: every sample is played at a new rate, so 2× is an octave higher and 0.5× an octave lower, with no processing artefacts at all. It is the sound of speeding up a tape, useful for effects and for slowed-down versions of songs.",
        "The new length is shown before you save: a 45-minute lecture at 1.5× becomes 30 minutes. Speed changes need a one-time download, and the file is encoded again at no less than its own bitrate; WAV and FLAC stay lossless.",
        "For the sound of a video together with its picture, use [change video speed](/change-video-speed). To shorten a recording without changing how it sounds, cut its pauses with [remove silence](/remove-silence-from-audio) instead. To change the key without changing the speed, use [change audio pitch](/change-audio-pitch).",
      ],
      faq: [
        {
          q: "Can I speed up a podcast without the chipmunk voice?",
          a: "Yes. Keep pitch is on by default, so voices keep their natural pitch at 1.25×, 1.5× or 2×.",
        },
        {
          q: "Will my MP3 stay an MP3?",
          a: "Yes, with its title and artist tags. It is encoded again at no less than its own bitrate.",
        },
        {
          q: "How slow can I go?",
          a: "Down to 0.1×. Below about 0.5× with Keep pitch, stretched speech usually starts to sound metallic; Shift pitch has no such artefacts but drops the pitch a lot.",
        },
        {
          q: "Why does it download something first?",
          a: "Speed changes need a one-time download from this site, which your browser keeps.",
        },
        {
          q: "Is my audio uploaded?",
          a: "No. The speed change happens in your browser on this device.",
        },
      ],
    },
  },
};
