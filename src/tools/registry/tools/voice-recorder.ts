import type { ToolInput } from "../schema";

export const voiceRecorder: ToolInput = {
  slug: "voice-recorder",
  engine: "audio-record",
  category: "record",
  phase: "p2",
  backends: ["webcodecs"],
  accepts: ["audio"],
  produces: "audio",
  keywords: [
    "voice recorder",
    "online voice recorder",
    "record audio online",
    "microphone recorder",
    "record voice to mp3",
  ],
  aliases: ["audio recorder", "record microphone", "voice memo", "dictaphone", "record sound"],
  related: [
    "trim-audio",
    "normalize-audio",
    "remove-silence-from-audio",
    "m4a-to-mp3",
    "screen-recorder",
    "webcam-recorder",
  ],
  updatedAt: "2026-11-18",
  icon: "mic",
  content: {
    en: {
      title: "Record your voice",
      subtitle:
        "Record from your microphone to M4A, WAV or Opus, with a live level, in your browser.",
      metaTitle: "Voice recorder online, free, no upload",
      metaDescription:
        "Record your voice or any sound from a microphone. Live level and waveform, pause and resume. Save as M4A, WAV or Opus on your device. Free, no account.",
      action: "Record",
      what: "This page records sound from a microphone and saves it as an audio file. You choose the format first, can check the level before you start, and watch the sound draw itself while you speak; pausing leaves the silence out.",
      steps: [
        "Choose M4A, WAV or Opus.",
        "Press Check the level and speak to see the microphone respond, or go straight on.",
        "Press Start recording and allow the microphone if the browser asks.",
        "Pause and resume as you need, press Stop, then listen and download the file.",
      ],
      goodToKnow: [
        "M4A is AAC at 128 kb/s for a mono microphone, about 1 MB a minute, and plays on phones and computers without extra software. WAV is uncompressed 16-bit sound at the microphone's own rate, usually 48 kHz: about 5.8 MB a minute in mono, exact for editing, and capped by the format at 4 GiB (about 4.3 GB), which this page stops at, 12 h 25 min in mono. Opus at 64 kb/s is half the size of M4A and very clear for speech, but older players and some editors do not open it.",
        "Browsers clean up microphone sound for calls, and all three cleanups are on by default because they suit a voice: noise suppression lowers steady sounds such as a fan, automatic level evens out a voice that moves closer and further away, and echo cancellation removes what your speakers play. For music or an instrument, turn them off under More options, since they flatten dynamics and can chop sustained notes.",
        "Browsers cannot write MP3 themselves. When the recording is done, the result offers to convert it to MP3, which runs on this device with the ffmpeg engine; for a spoken recording, M4A is smaller than an MP3 of the same clarity.",
        "The sound is written to this device's storage while you record, so a long interview does not fill memory; where the browser refuses that storage, the recording is held in memory and stops at about 1.8 GB, keeping everything up to then. Closing or reloading the tab ends the recording without saving it; the page asks the browser to warn you first. On a phone, allow the microphone when asked; if the browser cannot record the chosen format, the page says so when you press Start recording.",
        "After recording, [trim the start and end](/trim-audio), [even out the loudness](/normalize-audio) for a podcast or voice-over, or [cut the pauses](/remove-silence-from-audio) out of a long take.",
      ],
      faq: [
        {
          q: "How long can I record?",
          a: "As long as the device has free storage, except WAV, which stops at its 4 GiB format limit, and a recording held in memory, which stops at about 1.8 GB. The time and size show while you record.",
        },
        {
          q: "Can I record in MP3?",
          a: "Not directly, because browsers have no MP3 encoder. Record in M4A or WAV and use Convert it to MP3 on the result.",
        },
        {
          q: "Which format should I choose?",
          a: "M4A for voice memos and sharing, WAV when the recording goes into an editor, Opus when the smallest file matters and the listener has a current app.",
        },
        {
          q: "My recording sounds muffled or pumps in level. Why?",
          a: "That is the browser's noise suppression and automatic level working on music or a quiet room. Turn them off under More options and record again.",
        },
        {
          q: "Is the recording uploaded?",
          a: "No. Your voice is turned into a file by the browser itself, with no server in between, and the file waits on this device until you save it.",
        },
      ],
    },
  },
};
