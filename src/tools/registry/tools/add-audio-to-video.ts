import type { ToolInput } from "../schema";

export const addAudioToVideo: ToolInput = {
  slug: "add-audio-to-video",
  engine: "add-audio",
  category: "audio",
  phase: "p1",
  backends: ["webcodecs"],
  accepts: ["video", "audio"],
  produces: "video",
  presetOptions: { mode: "mix" },
  keywords: [
    "add audio to video",
    "add music to video",
    "put music on a video",
    "add sound to video",
    "add voiceover to video",
  ],
  aliases: ["add music", "background music", "voiceover", "soundtrack"],
  related: [
    "replace-audio-in-video",
    "remove-audio-from-video",
    "extract-audio-from-video",
    "trim-video",
  ],
  updatedAt: "2026-09-30",
  icon: "music",
  illustration: "add-audio",
  content: {
    en: {
      title: "Add audio to video",
      subtitle: "Music or a voiceover, placed where you want it.",
      metaTitle: "Add audio to video online, free, no upload",
      metaDescription:
        "Add music or a voiceover to a video in your browser: drag it into place, mix it under the original sound, fade it out. The picture is copied. Free.",
      action: "Add audio",
      what: "This page puts a sound onto a video: a song, a voiceover, a clean microphone recording or the sound of another video. Drop the video and the audio together, drag the audio clip along the video's timeline to where it should start, and set how loud it sits against the video's own sound. The picture is copied frame for frame without re-encoding, so it looks exactly as before; only the sound is written anew.",
      steps: [
        "Drop the video and the audio file onto the page, together or one after the other.",
        "Drag the audio clip on the timeline to where it should start, or type the time. Play the preview to hear the placement.",
        "Choose Keep and mix to hear both sounds, set which one is in front, or Replace it to hear only the new audio.",
        "Pick a fade-out for where the video ends, and loop the audio if it is shorter than the video.",
        "Press Add audio, watch the result on the page, and download it.",
      ],
      goodToKnow: [
        "The video decides the length. Audio that runs past the end of the video is cut there, with a fade-out of 2 s by default so the music does not stop mid-note; audio that is shorter ends early and leaves the rest silent, unless you tick Loop, which repeats it to the end with a 10 ms ramp at each seam so the joins do not click. Dragging the clip left past the start of the video skips into the audio instead, so you can begin a song at its chorus.",
        "Keep and mix plays both sounds. Even sets each to 70% of its level, so two loud tracks rarely collide; Video in front turns the new audio down to 30% for music under speech; New audio in front does the reverse for a voiceover over room sound. A soft limiter catches the peaks where both are loud at once. The preview plays the video with the new audio in place at the chosen balance before anything is written.",
        "The picture and its frame timing are copied without decoding, whatever the codec: H.264, HEVC, VP9 or AV1. The sound is encoded once as AAC at 192 kbps for MP4, MOV and MKV, or Opus for WebM, and the file keeps the video's own container. When nothing about the new audio changes (it replaces the original, starts at 0:00, needs no fade or volume change) and the container holds its codec, it is copied too, and the whole job is lossless.",
        "Any sound the browser can decode works as the new audio: MP3, M4A, AAC, WAV, FLAC, OGG and Opus, or another video whose sound you want. WMA and AIFF cannot be decoded by browsers; convert them first with the [audio converter](/audio-converter). If there is no video yet, only the sound, [turn audio into a video](/audio-to-video) with a picture or a title card. The video can be MP4, MOV, WebM or MKV.",
        "To take the original sound out without adding anything, use [remove audio from video](/remove-audio-from-video); to swap the soundtrack entirely, [replace audio in video](/replace-audio-in-video) starts with Replace chosen. The result plays on the page before you download it.",
      ],
      faq: [
        {
          q: "How do I add music to a video without losing quality?",
          a: "Use this page: the picture is copied, not re-encoded, so it keeps its exact quality. Only the sound is encoded, once, at 192 kbps AAC.",
        },
        {
          q: "What happens if the song is longer than the video?",
          a: "It is cut where the video ends and fades out over the last 2 s. Choose another fade length or Off in the options.",
        },
        {
          q: "Can I start the music partway through the song?",
          a: "Yes. Drag the audio clip to the left past the start of the video, or type a value in Skip into audio. The timeline shows exactly which part plays.",
        },
        {
          q: "Can I keep the original sound of the video?",
          a: "Yes. Keep and mix plays both. Choose which one is in front, or Even, and play the preview to check the balance.",
        },
        {
          q: "Does the audio have to be an MP3?",
          a: "No. MP3, M4A, AAC, WAV, FLAC, OGG and Opus all work, and so does another video, whose sound is used.",
        },
        {
          q: "Are my video and music uploaded?",
          a: "No. Both files are read and combined inside your browser. Nothing is sent to a server.",
        },
      ],
    },
  },
};
