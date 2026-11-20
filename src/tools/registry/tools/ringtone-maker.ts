import type { ToolInput } from "../schema";

export const ringtoneMaker: ToolInput = {
  slug: "ringtone-maker",
  engine: "ringtone",
  category: "audio",
  phase: "p2",
  backends: ["webcodecs", "ffmpeg-wasm"],
  accepts: ["audio", "video"],
  produces: "audio",
  keywords: [
    "ringtone maker",
    "make a ringtone",
    "mp3 to m4r",
    "iphone ringtone maker",
    "android ringtone maker",
    "make ringtone from video",
  ],
  aliases: ["m4r", "ringtone", "custom ringtone", "notification sound", "song to ringtone"],
  related: ["trim-audio", "fade-audio", "normalize-audio"],
  updatedAt: "2026-11-18",
  icon: "bell-ring",
  content: {
    en: {
      title: "Make a ringtone",
      subtitle: "From any song or video, for iPhone or Android.",
      metaTitle: "Ringtone maker for iPhone and Android, free",
      metaDescription:
        "Pick the best part of a song or video on its waveform, add fades and save an iPhone .m4r or Android MP3 ringtone. Runs on your device. Free.",
      action: "Make ringtone",
      what: "This tool cuts a short part out of a song, a voice memo or the sound of a video, fades it in and out so it does not start or stop with a jolt, and saves it in the format your phone takes as a ringtone: an .m4r file for an iPhone, or an MP3 or OGG file for Android.",
      steps: [
        "Drop a song or a video onto the page; the loudest 30 seconds are selected for you.",
        "Drag the handles on the waveform to move the part, and press play to hear it.",
        "Choose iPhone or Android, and adjust the fades if the start or end sounds abrupt.",
        "Press Make ringtone and download the file, then copy it to your phone.",
      ],
      goodToKnow: [
        "An .m4r file is an ordinary AAC recording in an MPEG-4 file, the same as an .m4a, with a name that tells iPhones and their companion apps to file it under ringtones. This tool encodes the part to AAC at 192 kbps and names it .m4r, so there is no renaming step to get wrong.",
        "This page makes the file; it does not put it on the phone. Adding an .m4r to an iPhone is done in Apple's own software, and the steps change between versions of iOS, macOS and Windows, so follow Apple's instructions for the versions you have. No maximum length is applied here; if the phone does not offer the ringtone, try a shorter part.",
        "For Android the result is an MP3 or an OGG (Vorbis) file at 192 kbps. Where to copy it and how to choose it as a ringtone depend on the phone's maker and Android version, so follow the instructions for your phone.",
        "The part is chosen for you as the loudest stretch of 30 seconds, which is often the chorus, starting at the quietest moment just before it so it begins on a phrase. A fade-in of half a second and a fade-out of two seconds are applied by default; set either to 0 for a hard edge, for example when the part already starts on a drum hit.",
        "Make it louder brings the part to −14 LUFS with peaks under −1 dBTP: a soft acoustic song is raised to ring as clearly as a loud one, and a part mastered louder than that is turned down, so leave it off for songs that are already loud. For a part of a longer file without a ringtone format, use [trim audio](/trim-audio); for fades on a whole file, use [fade audio](/fade-audio).",
      ],
      faq: [
        {
          q: "How do I make a ringtone for an iPhone?",
          a: "Choose iPhone, pick the part on the waveform and press Make ringtone. You get an .m4r file, which you then add to the iPhone with Apple's software; the steps depend on your versions of iOS and of the computer's system.",
        },
        {
          q: "Can I make a ringtone from a video?",
          a: "Yes. Drop the video; its sound is shown as a waveform under the picture and only the sound of the chosen part is saved.",
        },
        {
          q: "Is M4R different from M4A?",
          a: "Only in its name. Both hold AAC sound in an MPEG-4 file; the .m4r extension marks it as a ringtone.",
        },
        {
          q: "Why is the suggested part 30 seconds long?",
          a: "It is a length that usually covers a chorus and suits a ringtone. Drag either handle to make it shorter or longer.",
        },
        {
          q: "Is my song uploaded?",
          a: "No. The ringtone is cut and encoded in your browser; the file never leaves this device.",
        },
      ],
    },
  },
};
