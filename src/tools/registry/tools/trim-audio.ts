import type { ToolInput } from "../schema";

export const trimAudio: ToolInput = {
  slug: "trim-audio",
  engine: "video-to-audio",
  illustration: "trim-audio",
  category: "audio",
  phase: "p2",
  backends: ["webcodecs", "ffmpeg-wasm"],
  accepts: ["audio"],
  produces: "audio",
  presetOptions: { trimOnly: true },
  keywords: ["trim audio", "cut mp3", "trim mp3", "audio cutter", "cut audio file"],
  aliases: ["cut audio", "mp3 cutter", "crop audio", "shorten audio", "clip audio"],
  related: [
    "fade-audio",
    "remove-silence-from-audio",
    "audio-converter",
    "trim-video",
    "voice-recorder",
  ],
  updatedAt: "2026-11-18",
  icon: "scissors",
  content: {
    en: {
      title: "Trim audio",
      subtitle: "Cut an audio file down to the part you want.",
      metaTitle: "Trim audio and cut MP3 online, free, no upload",
      metaDescription:
        "Drag the handles on the waveform to keep part of an MP3, M4A, WAV, FLAC or OGG file. Copied without re-encoding when it can be. On your device. Free.",
      action: "Trim",
      what: "This tool keeps one part of an audio file and drops the rest. You choose the part by dragging its two handles on the waveform, or by typing the start and end, and play it before saving. When the file stays in its own format, the kept part is copied frame for frame rather than encoded again, so it sounds exactly like the original.",
      steps: [
        "Drop an audio file onto the page or choose one from your device.",
        "Drag the handles at each end of the waveform to the start and end of the part you want.",
        "Press play: playback stays inside the part, so you hear exactly what you keep.",
        "Keep the format, or choose another under Save as, then press Trim and download.",
      ],
      goodToKnow: [
        "A trim that keeps the format copies the sound in the pieces it is stored in, frames of about 26 ms in an MP3 and blocks of a similar size in WAV and FLAC, so the cut lands within a few hundredths of a second of each handle. In an M4A the start and end are then marked exactly, to the sample, the way players expect. Nothing is decoded, so there is no second generation of loss.",
        "Saving the part in another format, MP3 from a WAV for example, decodes it and encodes it once, which is where the choice of bitrate matters. Going to WAV or FLAC keeps every sample the source had.",
        "Title, artist and album tags are carried into the trimmed file, so a clip of a song still shows its name in a music app. The file name gets the start and end times added, so several clips from one recording do not overwrite each other.",
        "A cut in the middle of a sound can end abruptly. For a podcast clip or a sample, [fade the audio](/fade-audio) afterwards: half a second in and a second or two out is usually enough. For a ringtone, the [ringtone maker](/ringtone-maker) does the cut, the fades and the phone's format in one step. To cut the pauses out of a long recording instead of keeping one part, use [remove silence from audio](/remove-silence-from-audio).",
      ],
      faq: [
        {
          q: "Is trimming lossless?",
          a: "Yes when the format stays the same: the kept frames are copied as they are. A different format is encoded once.",
        },
        {
          q: "How precise is the cut?",
          a: "The handles move in hundredths of a second. When the format is kept, the cut lands within a few hundredths of a second of them, and exactly in an M4A; saved in another format, it is where the handle is.",
        },
        {
          q: "Can I cut out the middle and keep both ends?",
          a: "Not in one step: this keeps one part. Trim each part and join them with a sound editor, or cut pauses with remove silence.",
        },
        {
          q: "Which formats work?",
          a: "MP3, M4A, AAC, WAV, FLAC, OGG and Opus are read in the browser; WMA and AIFF need a one-time download first.",
        },
        {
          q: "Is my audio uploaded?",
          a: "No. The file is cut in your browser; nothing leaves this device.",
        },
      ],
    },
  },
};
