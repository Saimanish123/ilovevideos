import type { ToolInput } from "../schema";

export const fadeAudio: ToolInput = {
  slug: "fade-audio",
  engine: "audio-fade",
  category: "audio",
  phase: "p2",
  backends: ["webcodecs", "ffmpeg-wasm"],
  accepts: ["audio"],
  produces: "audio",
  presetOptions: { input: "audio" },
  keywords: [
    "fade in fade out audio",
    "fade out mp3",
    "fade in mp3",
    "add fade to audio",
    "audio fade online",
  ],
  aliases: ["fade out", "fade in", "fade song", "crossfade end"],
  related: ["trim-audio", "change-audio-volume", "normalize-audio", "fade-audio-in-video"],
  updatedAt: "2026-11-18",
  icon: "chart-spline",
  content: {
    en: {
      title: "Fade audio in and out",
      subtitle: "Add a fade-in and a fade-out to an MP3, WAV or other audio file, in your browser.",
      metaTitle: "Fade audio in and out online, free, no upload",
      metaDescription:
        "Fade an MP3, M4A, WAV, FLAC or Opus file in from silence and out to silence. Drag the fades on the waveform. Same format out, on your device. Free.",
      action: "Fade",
      what: "This tool makes an audio file start from silence and rise to full level, end by sinking back to silence, or both. You set each fade's length by dragging its handle on the waveform or typing the seconds, and hear it before saving. The file is saved in its own format, with its tags.",
      steps: [
        "Drop an audio file onto the page or choose one from your device.",
        "Drag the handles at the ends of the waveform, or type the fade-in and fade-out lengths.",
        "Press play to hear the fades, and switch between Smooth and Linear if the ending sounds abrupt.",
        "Press Fade and download the file.",
      ],
      goodToKnow: [
        "A song cut in the middle ends with a jolt; two or three seconds of fade-out turn the same cut into an ending. A fade-in of half a second to a second removes the click of a recording that starts mid-sound, without being heard as a fade.",
        "Smooth follows a quarter sine: the level stays up longer and then eases away, the way a hand pulls a fader, and it is −3 dB halfway through. Linear lowers the level in a straight line, −6 dB halfway, so it sounds as if it drops quickly and then lingers. Both are the same curves as ffmpeg's afade filter, so the command shown with the result reproduces the file.",
        "Fades that would overlap on a short file are shortened in proportion so they meet instead of cancelling each other; the summary line shows the lengths actually used.",
        "WAV and FLAC are saved sample for sample outside the fades. MP3, M4A, OGG and Opus are decoded and encoded once more at a bitrate at least as high as the source's; MP3 and OGG are written by the ffmpeg engine on this device, which downloads once.",
        "For a ringtone, the [ringtone maker](/ringtone-maker) cuts, fades and saves the part in one step; for any other clip, [trim the audio](/trim-audio) first and fade the part you kept. To fade the sound of a video without touching its picture, use [fade audio in a video](/fade-audio-in-video).",
      ],
      faq: [
        {
          q: "How long should a fade-out be?",
          a: "Two to five seconds suits most songs; a speech clip or a podcast outro usually needs one or two.",
        },
        {
          q: "Can I only fade out?",
          a: "Yes. Drag the fade-in handle to the start, or set its length to 0; only the end fades.",
        },
        {
          q: "Will the fade change the rest of the file?",
          a: "No. Outside the fades every sample keeps its level. In lossy formats the whole file is re-encoded once, which is rarely audible at the bitrates used here.",
        },
        {
          q: "Can I fade several files at once?",
          a: "Yes. Drop them together; each gets the fade lengths set in the panel, and they download as a zip.",
        },
        {
          q: "Is my audio uploaded?",
          a: "No. The fades are applied in your browser; nothing leaves this device.",
        },
      ],
    },
  },
};
