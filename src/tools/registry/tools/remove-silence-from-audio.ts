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
  related: [
    "normalize-audio",
    "trim-audio",
    "remove-silence-from-video",
    "remove-background-noise",
  ],
  updatedAt: "2026-11-19",
  icon: "audio-waveform",
  content: {
    en: {
      title: "Remove silence from audio",
      subtitle: "Cut the long pauses out of a recording.",
      metaTitle: "Remove silence from audio and MP3, free",
      metaDescription:
        "Find and cut the pauses in an MP3, M4A, WAV or other recording on your device. Every cut is shown on a timeline first. Same format out. Free.",
      action: "Remove silence",
      what: "This tool finds the pauses in a recording and joins the rest back together, so a lecture, an interview or a voice memo loses its dead air. A small speech model listens for the gaps between words, and every pause that will go is shaded on a timeline before anything is cut. The file comes back in its own format.",
      steps: [
        "Drop an audio file onto the page or choose one from your device.",
        "Check the shaded pauses on the timeline; for a recording without speech, switch to Loudness and drag the threshold line.",
        "Choose the shortest pause to cut and how much room to keep around words.",
        "Play it, which skips the marked pauses, then press Remove silence and download.",
      ],
      goodToKnow: [
        "By speech, the default, a pause is where the model hears no voice, read every 32 ms. That is why a fan or a music bed under the voice does not hide the gaps the way it hides them from a level threshold. It can still miss a pause, so check the shaded cuts on the timeline before you run it. To take that noise out of the recording itself, [remove the background noise](/remove-background-noise).",
        "By loudness, the threshold is suggested from the recording itself: 8 dB above its background noise, taken from its quietest tenth. A phone memo in a busy room has a high floor and needs a higher line than a studio podcast, which is why a fixed level such as −40 dBFS cuts too much from one and too little from the other.",
        "Pauses shorter than the minimum are left alone, so the rhythm of speech survives: 0.5 s trims hesitations and dead air, 1 s or 2 s only removes the long gaps, for example between questions in an interview.",
        "Each join gets a 5 ms ramp so it does not click, and a little of every pause is kept on both sides of it. A WAV or FLAC is otherwise sample for sample what it was; MP3, M4A, OGG and Opus are encoded again at least at the source bitrate, MP3 and OGG after a one-time download.",
        "Cutting pauses changes the running time, so chapter marks and timestamps in show notes will no longer line up. Cut first, then write the notes from the result. To bring the tightened recording to a standard loudness afterwards, [normalise it](/normalize-audio).",
      ],
      faq: [
        {
          q: "Will it cut quiet words?",
          a: "By speech, the model listens for a voice rather than a level, so a soft word is not judged by how loud it is. It can mark speech a few hundredths of a second late, which the 150 ms kept around words covers. By loudness, lower the line if a soft speaker loses words. The timeline shows every cut before you run it.",
        },
        {
          q: "Can it remove silence at the start and end only?",
          a: "It cuts every pause it finds. For just the start and end, [trim the audio](/trim-audio) instead.",
        },
        {
          q: "Does it work with music?",
          a: "A file with too little speech is cut by loudness, which finds the silences between tracks but also quiet passages. It is made for speech.",
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
