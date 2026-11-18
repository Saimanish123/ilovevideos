import type { ToolInput } from "../schema";

export const removeSilenceFromAudio: ToolInput = {
  slug: "remove-silence-from-audio",
  engine: "remove-silence",
  category: "audio",
  phase: "p2",
  backends: ["webcodecs", "ffmpeg-wasm"],
  accepts: ["audio"],
  produces: "audio",
  presetOptions: { input: "audio" },
  keywords: [
    "remove silence from audio",
    "remove silence from mp3",
    "cut silence audio",
    "remove pauses from recording",
    "podcast silence remover",
  ],
  aliases: ["silence remover", "trim silence", "cut dead air", "tighten podcast"],
  related: ["normalize-audio", "trim-audio", "remove-silence-from-video", "audio-converter"],
  updatedAt: "2026-10-01",
  icon: "audio-waveform",
  content: {
    en: {
      title: "Remove silence from audio",
      subtitle:
        "Cut the long pauses out of a recording, podcast or voice memo, with the cuts shown first.",
      metaTitle: "Remove silence from audio and MP3, free",
      metaDescription:
        "Find and cut the pauses in an MP3, M4A, WAV or other recording on your device. Every cut is shown on a timeline first. Same format out. Free.",
      action: "Remove silence",
      what: "This tool finds the pauses in a recording and joins the rest back together, so a lecture, an interview or a voice memo loses its dead air. The level of the sound is measured every 10 ms on your device and every pause that will go is shaded on a timeline, where you drag the threshold until the cuts are the right ones. The file comes back in its own format.",
      steps: [
        "Drop an audio file onto the page or choose one from your device.",
        "Check the shaded pauses on the timeline; drag the threshold line to mark more or fewer.",
        "Choose the shortest pause to cut and how much room to keep around words.",
        "Play it, which skips the marked pauses, then press Remove silence and download.",
      ],
      goodToKnow: [
        "The threshold is suggested from the recording itself: 8 dB above its background noise, taken from its quietest tenth. A phone memo in a busy room has a high floor and needs a higher line than a studio podcast, which is why a fixed level such as −40 dBFS cuts too much from one and too little from the other.",
        "Pauses shorter than the minimum are left alone, so the rhythm of speech survives: 0.5 s trims hesitations and dead air, 1 s or 2 s only removes the long gaps, for example between questions in an interview.",
        "Each join gets a 5 ms ramp so it does not click, and a little of every pause is kept on both sides of it. A WAV or FLAC is otherwise sample for sample what it was; MP3, M4A, OGG and Opus are encoded again at least at the source bitrate, MP3 and OGG by the ffmpeg engine on this device.",
        "Cutting pauses changes the running time, so chapter marks and timestamps in show notes will no longer line up. Cut first, then write the notes from the result. To bring the tightened recording to a standard loudness afterwards, [normalise it](/normalize-audio).",
      ],
      faq: [
        {
          q: "Will it cut quiet words?",
          a: "Only if they are quieter than the threshold for longer than the minimum pause. Lower the line if a soft speaker loses words; the timeline shows every cut before you run it.",
        },
        {
          q: "Can it remove silence at the start and end only?",
          a: "It cuts every pause it finds. For just the start and end, [trim the audio](/trim-audio) instead.",
        },
        {
          q: "Does it work with music?",
          a: "It works on level alone, so it will cut the silences between tracks but also quiet passages. It is made for speech.",
        },
        {
          q: "Will my MP3 stay an MP3?",
          a: "Yes, with its tags. It is decoded, cut and encoded again at least at its own bitrate.",
        },
        {
          q: "Is my recording uploaded?",
          a: "No. It is measured, cut and saved in your browser on this device.",
        },
      ],
    },
  },
};
