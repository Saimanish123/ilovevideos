import type { ToolInput } from "../schema";

export const changeAudioVolume: ToolInput = {
  slug: "change-audio-volume",
  engine: "volume",
  category: "audio",
  phase: "p2",
  backends: ["webcodecs", "ffmpeg-wasm"],
  accepts: ["audio"],
  produces: "audio",
  presetOptions: { mode: "gain", input: "audio" },
  keywords: [
    "increase audio volume",
    "make mp3 louder",
    "boost audio volume",
    "reduce audio volume",
    "amplify audio online",
  ],
  aliases: ["louder mp3", "amplify", "volume booster", "turn down audio"],
  related: ["normalize-audio", "fade-audio", "audio-converter", "trim-audio"],
  updatedAt: "2026-10-01",
  icon: "volume-1",
  content: {
    en: {
      title: "Change audio volume",
      subtitle: "Make an MP3, WAV or other audio file louder or quieter, in your browser.",
      metaTitle: "Make audio louder online, free, no upload",
      metaDescription:
        "Boost or lower an MP3, M4A, WAV, FLAC or Opus file by a number of decibels, with a limiter against clipping. Same format out. On your device. Free.",
      what: "This tool raises or lowers the level of an audio file by the number of decibels you set and saves it in the format it came in: an MP3 stays an MP3, a WAV stays a WAV. The sound is decoded, multiplied by the gain, held under the clipping point by a limiter when a boost needs it, and encoded once. Its loudness is measured before and after on your device.",
      steps: [
        "Drop an audio file onto the page or choose one from your device.",
        "Choose a preset or drag the slider; press play to hear the new level before saving.",
        "Check the loudness readout and leave Prevent clipping on unless you have a reason not to.",
        "Press Change volume and download the file.",
      ],
      goodToKnow: [
        "WAV and FLAC come back sample-exact apart from the gain itself, because both store every sample. MP3, M4A, OGG and Opus are lossy: changing the level means decoding and encoding again, a second generation. The new file is written at a bitrate at least as high as the source's (an MP3 at 128 kbps is written at 128 kbps or more), which keeps the extra loss hard to hear.",
        "WebCodecs, the browser's own encoder, cannot write MP3 or Vorbis, so for those the processed sound is handed to the ffmpeg engine, which runs on this device too and downloads once. The volume change itself, the limiter and the measurements are the same code on every path.",
        "Tags stay with the file: title, artist, album and, in MP3 and FLAC, the cover picture. Players that manage libraries by tag see the same track, only louder or quieter.",
        "Many MP3s already sit close to full scale, so +6 dB on a mastered song mostly makes the limiter work: the readout's true peak says so before you save. For speech recorded on a phone, which rarely reaches full scale, the same boost usually fits untouched.",
        "To bring several files to one level, choose [normalise audio](/normalize-audio) instead, which works out each file's own gain. To change only part of a file, [trim it](/trim-audio) first.",
      ],
      faq: [
        {
          q: "Will my MP3 stay an MP3?",
          a: "Yes. The file is saved in its own format and extension, with its tags. Only WMA, which is read by the ffmpeg engine, is saved as MP3.",
        },
        {
          q: "Does a boost reduce quality?",
          a: "The gain itself adds nothing. For MP3, M4A, OGG and Opus the re-encode is a second lossy step; at the bitrates used here it is rarely audible. WAV and FLAC lose nothing.",
        },
        {
          q: "What does Prevent clipping do?",
          a: "It runs a limiter that turns down only the moments that would pass −1 dBTP, 5 ms before they arrive, so a boost does not crackle. Below that level it changes nothing.",
        },
        {
          q: "How loud is too loud?",
          a: "When the readout shows the limiter holding peaks down by more than about 6 dB, the file starts to sound squashed. Use a smaller boost, or normalise to −14 LUFS.",
        },
        {
          q: "Can I process a whole album?",
          a: "Yes. Drop several files at once; they run one after another with the same setting and download together as a zip.",
        },
      ],
    },
  },
};
