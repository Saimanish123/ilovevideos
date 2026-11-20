import type { ToolInput } from "../schema";

export const removeBackgroundNoise: ToolInput = {
  slug: "remove-background-noise",
  engine: "speech-denoise",
  category: "audio",
  phase: "p3",
  backends: ["webcodecs", "ffmpeg-wasm"],
  accepts: ["audio", "video"],
  produces: "audio",
  keywords: [
    "remove background noise from audio",
    "remove background noise from video",
    "noise reduction",
    "clean up audio",
    "remove hiss from audio",
    "reduce noise in voice recording",
  ],
  aliases: [
    "noise remover",
    "noise reduction",
    "clean up voice",
    "remove fan noise",
    "remove hiss",
    "denoise audio",
  ],
  related: [
    "normalize-audio",
    "remove-silence-from-audio",
    "remove-silence-from-video",
    "change-audio-volume",
    "voice-recorder",
    "denoise-video",
  ],
  updatedAt: "2026-11-19",
  icon: "audio-lines",
  content: {
    en: {
      title: "Remove background noise",
      subtitle: "Remove fan hum, hiss and traffic from behind a voice.",
      metaTitle: "Remove background noise from audio and video",
      metaDescription:
        "Take fan hum, hiss and other steady noise out of speech in an MP3, WAV, M4A or a video's sound. Listen first. Runs on your device. Free, no upload.",
      action: "Remove noise",
      what: "This tool takes the steady noise out from behind someone talking: a laptop fan, air conditioning, tape or preamp hiss, the rumble of a road outside. It uses a small speech model that downloads once (1.4 MB). You hear a few seconds cleaned before you process the whole file, and the result keeps its format, its length and, if you want, its loudness.",
      steps: [
        "Drop a voice recording, podcast, lecture or video onto the page, or choose one from your device.",
        "Move the playhead to a part with talking and noise, then press Listen to 8 s, cleaned.",
        "Lower the strength if the voice starts to sound processed; 100% removes the most.",
        "Press Remove noise, play the result and download it.",
      ],
      goodToKnow: [
        "The model looks at the sound 10 ms at a time and, band by band, keeps what it hears as a voice and turns down the rest. That is why it works best on noise that sits still, such as a fan, hiss or traffic: the gaps between sentences go much quieter while the voice changes little.",
        "It is made for speech, and that is also its limit. Music is neither removed nor left alone: a music bed stays almost as loud, but its level wobbles from moment to moment, which you hear as pumping. Short bursts such as keyboard clicks dropped by only about 14 dB, and it does not remove room echo.",
        "Strength mixes the cleaned sound with the original. At 90% the noise ends up about 20 dB quieter than before instead of gone, which often sounds more natural on a voice that was recorded close to the microphone. The listen button uses exactly the same processing, so set it by ear on the noisiest part.",
        "Taking the noise out makes a file quieter, because the noise was part of its loudness. With Keep the original's loudness on, the cleaned sound is measured (EBU R128) and brought back to the integrated loudness the file had, with peaks held under −1 dBTP. To bring a podcast to a set level such as −16 LUFS instead, [normalise it](/normalize-audio) afterwards.",
        "A video's picture is copied as it is, so nothing about it changes; only the sound is encoded again, to AAC in MP4 and MOV or Opus in WebM. Audio files keep their format: WAV and FLAC stay lossless, MP3 and OGG are encoded once more, after a one-time download. Grain in the picture is a different job: [denoise the video](/denoise-video).",
      ],
      faq: [
        {
          q: "Will it remove music or other voices?",
          a: "Other voices are speech, so they stay. Music mostly stays too, but its level pumps; this tool is for a voice over noise, not for separating music from speech.",
        },
        {
          q: "Can I hear the result before processing?",
          a: "Yes. Press Listen and it plays 8 seconds from the playhead, cleaned with the strength you chose, while the player shows where you are.",
        },
        {
          q: "Does it work on a phone?",
          a: "It is built for current browsers. A phone is slower than a laptop, so an hour-long file is best done on a computer.",
        },
        {
          q: "What gets downloaded?",
          a: "Once, the noise model as a 1.4 MB file from this site.",
        },
        {
          q: "Is this the same as FFmpeg's arnndn filter?",
          a: "It is the same idea: FFmpeg's arnndn filter runs the same kind of speech model from a model file you supply, and its mix setting works like Strength here.",
        },
      ],
    },
  },
};
