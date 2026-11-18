import type { ToolInput } from "../schema";

export const fadeAudioInVideo: ToolInput = {
  slug: "fade-audio-in-video",
  engine: "audio-fade",
  category: "audio",
  phase: "p2",
  backends: ["webcodecs"],
  accepts: ["video"],
  produces: "video",
  presetOptions: { input: "video" },
  keywords: [
    "fade out audio in video",
    "fade in audio video",
    "fade video sound",
    "add audio fade to video",
  ],
  aliases: ["fade sound", "fade out music video", "soft ending"],
  related: ["change-video-volume", "trim-video", "add-audio-to-video", "fade-audio"],
  updatedAt: "2026-10-01",
  icon: "audio-lines",
  content: {
    en: {
      title: "Fade audio in a video",
      subtitle:
        "Fade a video's sound in at the start and out at the end, with the picture copied as it is.",
      metaTitle: "Fade out audio in a video online, free",
      metaDescription:
        "Fade the sound of an MP4, MOV, MKV or WebM in and out without re-encoding the picture. Drag the fades on the waveform. Runs in your browser. Free.",
      action: "Fade",
      what: "This tool fades the sound of a video in from silence at the start, out to silence at the end, or both, and leaves the picture exactly as it was. The fades are drawn over the video's waveform, where you drag them; the preview plays with them so you can judge the ending before you save.",
      steps: [
        "Drop a video onto the page or choose one from your device.",
        "Drag the fade handles on the waveform under the video, or type each length.",
        "Play the preview to hear how the sound starts and ends.",
        "Press Fade and download the video.",
      ],
      goodToKnow: [
        "Only the sound fades. The picture is copied packet for packet, so it keeps its quality, its size and its frame rate, and the video still starts and ends on the same frames. The sound is decoded and encoded once to AAC at 192 kbps (Opus in a WebM), in the video's own container.",
        "A clip cut out of a longer recording often starts in the middle of a word or a bar of music. A short fade-in, around half a second, removes the jolt at the first frame, and a fade-out of two or three seconds lets the last shot end without the sound stopping dead.",
        "Music added over a video usually needs its own fade where the video ends; [add audio to a video](/add-audio-to-video) does that as it places the music. Use this page for the sound the video already has, or after adding music, to fade the mix.",
        "Only the first sound track of a video is faded and kept. A video with several language tracks should be reduced to the one you want first with [select audio tracks](/select-audio-tracks).",
      ],
      faq: [
        {
          q: "Does the picture fade to black too?",
          a: "No. Only the sound fades; the picture is untouched. Fading the picture means re-encoding every frame, which this page does not do.",
        },
        {
          q: "Is the video re-encoded?",
          a: "The picture is not: it is copied as it is. The sound is encoded once to AAC (Opus for WebM).",
        },
        {
          q: "Why is the fade on the preview but not in my player?",
          a: "The preview applies the fade live while you choose. The file gets it when you press Fade; play the result in the preview afterwards to check.",
        },
        {
          q: "Which video formats work?",
          a: "MP4, MOV, MKV and WebM keep their container. Other containers the browser reads, such as MPEG-TS, are saved as MP4.",
        },
        {
          q: "Is my video uploaded?",
          a: "No. The work happens in your browser on this device.",
        },
      ],
    },
  },
};
