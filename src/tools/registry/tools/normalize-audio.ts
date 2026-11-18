import type { ToolInput } from "../schema";

export const normalizeAudio: ToolInput = {
  slug: "normalize-audio",
  engine: "volume",
  category: "audio",
  phase: "p2",
  backends: ["webcodecs", "ffmpeg-wasm"],
  accepts: ["audio", "video"],
  produces: "audio",
  presetOptions: { mode: "normalize" },
  keywords: [
    "normalize audio",
    "normalise audio",
    "loudness normalization",
    "lufs normalizer",
    "normalize mp3",
    "normalize video audio",
  ],
  aliases: ["lufs", "ebu r128", "loudness", "level audio", "podcast loudness"],
  related: [
    "change-audio-volume",
    "voice-recorder",
    "change-video-volume",
    "remove-silence-from-audio",
    "audio-converter",
  ],
  updatedAt: "2026-10-08",
  icon: "audio-waveform",
  content: {
    en: {
      title: "Normalize audio",
      subtitle:
        "Bring an audio file or a video's sound to a loudness target in LUFS, measured on your device.",
      metaTitle: "Normalize audio to LUFS online, free",
      metaDescription:
        "Measure integrated loudness and true peak (EBU R128) and bring audio or a video's sound to −14, −16 or −23 LUFS. Runs in your browser. No upload. Free.",
      action: "Normalise",
      what: "This tool measures how loud a recording is, as integrated loudness in LUFS with its true peak (the EBU R128 method), and applies the one gain that brings it to the target you pick. If that gain would push a peak past the ceiling, a limiter holds that peak down. The result is measured again after it is written, and both numbers are shown.",
      steps: [
        "Drop an audio file or a video onto the page or choose one from your device.",
        "Wait a moment while its loudness and true peak are measured; the numbers appear in the panel.",
        "Pick a target: −14 LUFS for music, −16 for podcasts and speech, −23 for broadcast.",
        "Press Normalise, then compare the measured result with the target and download.",
      ],
      goodToKnow: [
        "Peak normalising, which older tools do, only looks at the single loudest sample, so one door slam decides the level of a whole interview. Loudness normalising averages what you actually hear over the whole file, ignores silence below −70 LUFS and anything more than 10 LU under the average, and weights frequencies the way the ear does (K-weighting). Two files normalised to the same LUFS sound about equally loud; two files peak-normalised to 0 dBFS often do not.",
        "Normalising applies one gain to the whole file. It does not compress: quiet passages stay as far below loud ones as they were, except for the brief peaks the limiter turns down. If a speaker is loud one minute and faint the next, the file still reaches the target on average, but that difference remains.",
        "−23 LUFS is the EBU R128 broadcast level, with a true-peak limit of −1 dBTP. −16 LUFS is a common target for podcasts and spoken word. −14 LUFS is loud and suits music. A target louder than the recording can take without heavy limiting is possible, but the more the limiter works, the flatter the peaks sound: the readout says by how much before you run it.",
        "The true peak is the highest point of the sound wave between samples, found here by 4× oversampling. MP3 and AAC encoders can add a little on top of it, which is why the ceiling is −1 dBTP rather than 0. For low-bitrate MP3, −2 dBTP under More options is the safer ceiling.",
        "A video keeps its picture exactly as it was and gets its sound normalised and encoded once to AAC; an audio file keeps its format. For a fixed change instead of a target, use [change audio volume](/change-audio-volume) or [change video volume](/change-video-volume).",
      ],
      faq: [
        {
          q: "What is LUFS?",
          a: "Loudness units relative to full scale: a measure of perceived loudness from ITU-R BS.1770, the method EBU R128 uses. LKFS is the same unit under another name. One LU is one decibel.",
        },
        {
          q: "Which target should I pick?",
          a: "−16 LUFS for a podcast, lecture or voice-over, −14 LUFS for music, and −23 LUFS if a broadcaster asked for EBU R128.",
        },
        {
          q: "Why does the result differ slightly from the target?",
          a: "When the limiter holds peaks down it also lowers the average a little, and a lossy encoder changes the signal slightly. The result line shows the loudness measured on the file itself, usually within a few tenths of a LU.",
        },
        {
          q: "Can a very quiet recording be normalised?",
          a: "Yes, as long as it has at least half a second above −70 LUFS. Its noise rises with it, so a hissy recording gets noticeably hissier.",
        },
        {
          q: "Can I normalise several files to the same loudness?",
          a: "Yes. Drop them all at once; each is measured and gets its own gain, so they come out at the same LUFS.",
        },
        {
          q: "Is anything uploaded?",
          a: "No. Measuring, processing and encoding all happen in your browser on this device.",
        },
      ],
    },
  },
};
