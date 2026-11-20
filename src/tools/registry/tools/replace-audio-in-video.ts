import type { ToolInput } from "../schema";

export const replaceAudioInVideo: ToolInput = {
  slug: "replace-audio-in-video",
  engine: "add-audio",
  category: "audio",
  phase: "p1",
  backends: ["webcodecs"],
  accepts: ["video", "audio"],
  produces: "video",
  presetOptions: { mode: "replace" },
  keywords: [
    "replace audio in video",
    "change audio of video",
    "swap audio in video",
    "sync external audio to video",
    "replace video soundtrack",
  ],
  aliases: ["swap audio", "change soundtrack", "dub video", "sync audio"],
  related: ["add-audio-to-video", "remove-audio-from-video", "extract-audio-from-video"],
  updatedAt: "2026-09-30",
  icon: "replace",
  illustration: "replace-audio",
  content: {
    en: {
      title: "Replace audio in video",
      subtitle: "Swap a video's sound for another recording.",
      metaTitle: "Replace audio in video online, free, no upload",
      metaDescription:
        "Swap a video's soundtrack for another file in your browser. Line it up to the hundredth of a second; the picture is copied, not re-encoded. Free.",
      action: "Replace audio",
      what: "This page throws away a video's own sound and puts another recording in its place: a clean microphone track recorded separately, a dubbed or translated voice, a corrected mix, or music instead of wind noise. Drop the video and the new audio, line the audio up on the timeline, and the video is rewritten with the new sound. The picture is copied without re-encoding.",
      steps: [
        "Drop the video and the replacement audio onto the page.",
        "Play the preview. If the new sound is early or late, drag the audio clip on the timeline, or press the arrow keys on it: 0.1 s per press, 1 s with Shift.",
        "For recordings that started before the video, drag the clip left: the page skips that much of the audio.",
        "Press Replace audio, check the result on the page, and download it.",
      ],
      goodToKnow: [
        "The most common reason to replace audio is a separate recording: a lavalier or USB microphone, a recorder on the table, or a phone's voice memo, all of which sound far better than a camera's built-in microphone. Those recordings rarely start at the same instant as the video. Play the preview, watch for a clap or a hard consonant, and move the clip until picture and sound agree; the timecode above the lane shows the position to the hundredth of a second, and Skip into audio takes a typed value for exact alignment.",
        "Line-up is by offset only. If the separate recorder's clock runs slightly fast or slow, a long take can drift apart by the end even when the start is right; this page does not stretch the audio to correct drift, so for a take of more than about half an hour check the sync near the end as well as at the start.",
        "When the replacement needs no change at all, it starts at 0:00 with no skip, fade or volume change, and the container holds its codec (AAC into MP4 or MOV, Opus into WebM), it is copied as is, and the result is lossless for both picture and sound. Otherwise the new sound is encoded once as AAC at 192 kbps, or Opus for WebM, and the picture is still copied.",
        "The video's own sound is removed completely in Replace mode. To keep it quietly underneath, switch to Keep and mix, or use [add audio to video](/add-audio-to-video), which starts with mixing chosen; to remove the sound and add nothing, use [remove audio from video](/remove-audio-from-video).",
      ],
      faq: [
        {
          q: "How do I sync separately recorded audio to a video?",
          a: "Play the preview and move the audio clip until a sharp sound, such as a clap, lines up with the picture. The arrow keys move it by 0.1 s, Shift and an arrow by 1 s, and the exact values can be typed.",
        },
        {
          q: "Does replacing the audio re-encode the video?",
          a: "No. The picture is copied frame for frame. Only the new sound is encoded, unless it can be copied as is.",
        },
        {
          q: "My audio is longer than the video. What happens?",
          a: "It is cut where the video ends, with a short fade-out so it does not stop abruptly. The fade length is in the options.",
        },
        {
          q: "Can I use the sound from another video?",
          a: "Yes. Drop both videos; the first video in the list keeps its picture and the other one lends its sound.",
        },
        {
          q: "Will the sound drift out of sync on long videos?",
          a: "It can, if the two recorders' clocks differ. This page aligns the start but does not stretch the audio, so check the end of long takes.",
        },
      ],
    },
  },
};
