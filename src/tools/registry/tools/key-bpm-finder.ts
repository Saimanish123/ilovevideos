import type { ToolInput } from "../schema";

export const keyBpmFinder: ToolInput = {
  slug: "key-bpm-finder",
  engine: "audio-analyze",
  category: "audio",
  phase: "p2",
  backends: ["webcodecs"],
  accepts: ["audio", "video"],
  produces: "text",
  keywords: [
    "key and bpm finder",
    "bpm finder",
    "song key finder",
    "find bpm of a song",
    "what key is this song in",
    "camelot key finder",
  ],
  aliases: ["bpm detector", "tempo finder", "key detector", "camelot", "harmonic mixing"],
  related: ["change-audio-pitch", "change-audio-speed", "trim-audio", "audio-converter"],
  updatedAt: "2026-11-18",
  icon: "drum",
  content: {
    en: {
      title: "Find a song's key and BPM",
      subtitle: "One song or fifty, with the Camelot code for mixing.",
      metaTitle: "Key and BPM finder online, free, no upload",
      metaDescription:
        "Find the BPM and musical key of an MP3, WAV or video, with half and double tempo, the relative key and the Camelot code. On your device. Free.",
      what: "This tool listens to a song and tells you its tempo in beats per minute and its key, with the relative key and the Camelot code DJs use for harmonic mixing. Drop one file for a full reading, or up to 50 for a list you can download as a spreadsheet.",
      steps: [
        "Drop one or more songs, or videos with music, onto the page.",
        "Wait while each file is read; the list fills in one song at a time.",
        "Read the tempo and key in the panel, and choose another song to see its details.",
        "Download the results as a CSV file, or follow Change the key to transpose a song.",
      ],
      goodToKnow: [
        "Tempo has no single right answer between half and double: a drum and bass track is 174 BPM to a DJ and 87 to someone nodding along, and a slow ballad can be counted at 70 or 140. The reading favours the pulse of the kick drum, and both alternatives are always shown so you can pick the one your software or your feet use.",
        "When a song speeds up or slows down, as live recordings and older records do, the tempo shown is the average over the whole song and the panel says between which values it moves. A small drift is ignored: the range is shown only when the tempo moves by more than 2% across the song.",
        "Every major key shares its notes with a minor key, its relative: C major and A minor, E-flat major and C minor. Songs often sit between the two, so the relative key is listed with the result. The Camelot code puts the 24 keys on a wheel of 12 numbers with A for minor and B for major: neighbouring numbers and the same number with the other letter mix without clashing.",
        "Confidence says how clearly one key stands out. It tends to be lower for songs that change key halfway, use modes such as Dorian or Mixolydian, or are mostly drums or speech; the next most likely key is then shown too. Recordings tuned away from A = 440 Hz are measured as they are, and the panel reports the offset in cents when it is 10 or more.",
        "The analysis is signal processing, not a trained model or a database lookup: it measures rhythm from changes in the spectrum and pitch from the notes it finds, so an unreleased demo or a rehearsal is read the same way as a released song. Tempo is read to 0.1 BPM. The key is an estimate, so check a close call by ear. To move a song into another key at the same tempo, use [change audio pitch](/change-audio-pitch).",
      ],
      faq: [
        {
          q: "Why does it show half and double the BPM?",
          a: "The same beat can be counted at two speeds, and DJ software, metronomes and dancers do not always agree. Use whichever matches how you count the song.",
        },
        {
          q: "What is the Camelot code?",
          a: "A number from 1 to 12 with A for minor or B for major. Songs with the same code, a neighbouring number, or the same number with the other letter are the usual choices to mix into each other.",
        },
        {
          q: "Can I analyse a whole folder of songs?",
          a: "Yes. Drop up to 50 files at once; each row shows its tempo and key, and Download results saves them all as a CSV file.",
        },
        {
          q: "Does it work on videos?",
          a: "Yes. The sound of the video is analysed; the picture is ignored.",
        },
        {
          q: "Why is the key confidence low?",
          a: "The song may change key, use a mode that is neither major nor minor, or have too few sustained notes. Check the next most likely key shown under it.",
        },
        {
          q: "Are my songs uploaded?",
          a: "No. Every file is analysed in your browser and stays on this device.",
        },
      ],
    },
  },
};
