import type { ToolInput } from "../schema";

export const removeAudioFromVideo: ToolInput = {
  slug: "remove-audio-from-video",
  engine: "mute",
  category: "audio",
  phase: "p1",
  backends: ["webcodecs"],
  accepts: ["video"],
  produces: "video",
  keywords: [
    "remove audio from video",
    "mute video",
    "remove sound from video",
    "video without audio",
  ],
  aliases: ["mute", "silence", "strip audio", "no sound"],
  related: ["trim-video", "compress-video", "mov-to-mp4"],
  updatedAt: "2026-10-01",
  icon: "volume-x",
  content: {
    en: {
      title: "Remove audio from video",
      subtitle:
        "Delete the sound track from a video without touching the picture, in your browser.",
      metaTitle: "Remove audio from video, free, no upload",
      metaDescription:
        "Mute a video by removing its audio track. The picture is copied unchanged, no quality loss. Runs in your browser. Free, no account, no watermark.",
      what: "This tool writes a copy of your video that contains the picture and nothing else. The video stream is not decoded or re-encoded; it is moved into the new file exactly as it was, so there is no quality change; nothing is encoded, so it is limited only by how fast your device reads and writes the file. Every audio track in the file is dropped, including secondary language tracks.",
      steps: [
        "Drop a video onto the page or choose one from your device.",
        "Check the list of audio tracks that will go, with codec and channels; the preview plays muted, as the result will.",
        "Press Remove audio.",
        "Watch the silent result in the preview and download it.",
      ],
      goodToKnow: [
        "Removing audio makes the file smaller by exactly the size of the audio data. For a phone recording that is usually 5 to 10 percent; for a screen recording with a high-quality voice track it can be more. It does not compress the picture at all; use [compress video](/compress-video) for that.",
        "A video with no audio track behaves differently from a video with a silent audio track. Most players and social apps handle both, but a few editors expect an audio track to exist. If a tool complains, keep the original audio and lower its volume in your editor instead of removing the track.",
        "The output keeps the same container as the input, so an MP4 stays MP4 and a MOV stays MOV. Soft subtitle tracks are not carried over: only the picture is copied. If the subtitles matter, save them first with a subtitle tool, or add them back afterwards with [add subtitles](/add-subtitles-to-video).",
        "Muting is the first step for replacing a soundtrack: or skip this page and [replace the audio](/replace-audio-in-video) in one step, which swaps the sound for your music or voiceover.",
        "Because nothing is re-encoded, this works on any video your browser can read, even codecs it cannot decode for playback such as ProRes or some camera formats.",
      ],
      faq: [
        {
          q: "Will the video quality change?",
          a: "No. The picture data is copied without decoding, so the result is identical frame for frame.",
        },
        {
          q: "Can I remove only one of several audio tracks?",
          a: "This page removes all of them. To keep some and drop others, for example a second language or a commentary, use [select audio tracks](/select-audio-tracks).",
        },
        {
          q: "Does this work on large files?",
          a: "Yes. The file is read in chunks and written straight back out, so multi-gigabyte recordings are fine on a desktop. On phones the limit is your free storage.",
        },
        {
          q: "Is my video uploaded?",
          a: "No. The whole operation happens on your device inside the browser. Nothing is sent over the network.",
        },
        {
          q: "How do I add different music afterwards?",
          a: "Use [add audio to a video](/add-audio-to-video) to put music under the original sound, or [replace audio](/replace-audio-in-video) to swap it; this page only removes sound.",
        },
      ],
    },
  },
};
