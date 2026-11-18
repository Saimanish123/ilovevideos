import type { ToolInput } from "../schema";

export const removeSilenceFromVideo: ToolInput = {
  slug: "remove-silence-from-video",
  engine: "remove-silence",
  category: "edit",
  phase: "p2",
  backends: ["webcodecs"],
  accepts: ["video"],
  produces: "video",
  presetOptions: { input: "video" },
  keywords: [
    "remove silence from video",
    "jump cut video",
    "cut silence video",
    "remove pauses from video",
    "auto jump cut",
  ],
  aliases: ["jump cut", "silence remover", "cut pauses", "dead air"],
  related: ["trim-video", "split-video", "remove-silence-from-audio", "compress-video"],
  updatedAt: "2026-10-01",
  icon: "scissors-line-dashed",
  content: {
    en: {
      title: "Remove silence from video",
      subtitle:
        "Cut the pauses out of a talking-head video, with every cut shown on a timeline first.",
      metaTitle: "Remove silence from video (jump cut), free",
      metaDescription:
        "Find the pauses in a video's sound on your device, see every cut on a timeline, and cut them from picture and sound together. No upload. Free.",
      action: "Remove silence",
      what: "This tool finds the pauses in a video's sound and cuts them out of the picture and the sound together, the jump cut used in talking-head videos, lectures and screen recordings. The pauses are measured on your device and drawn on a timeline before anything runs, so you see every cut and can move the threshold until the right ones are marked.",
      steps: [
        "Drop a video onto the page or choose one from your device.",
        "Look at the timeline: the shaded parts are the pauses that will be cut.",
        "Drag the threshold line up to cut more or down to cut less, and choose the shortest pause and the room kept around words.",
        "Play the preview, which skips the marked pauses, then press Remove silence and download.",
      ],
      goodToKnow: [
        "A pause is a stretch quieter than the threshold for at least the minimum length. The threshold starts 8 dB above the recording's own background noise, measured from its quietest tenth, and is kept between −55 and −30 dBFS. A noisy room needs the line higher; a quiet studio can go lower.",
        "Room around words keeps a little of each pause on both sides of a cut. Without it, the soft start of a word, a breath or the tail of a sentence would be clipped; 150 ms sounds natural, 50 ms gives the fast, clipped pace of many online videos.",
        "Every cut starts and ends on a frame, and the sound is cut at exactly the same times, so picture and sound stay in sync after any number of cuts. Each join gets a 5 ms ramp in the sound so it does not click.",
        "A cut inside a stretch of video cannot be copied: the frames after it depend on frames that were removed. So the picture is decoded and encoded again, to H.264 at a high quality setting, and the sound to AAC, in an MP4. Encoding is the slow part of the job; how long it takes depends on the length, the resolution and your device's video encoder, and the progress line shows the real position.",
        "The detection listens for level only; it cannot tell a thoughtful pause from dead air, or music from speech. For a single long silence at the start or end, [trimming the video](/trim-video) keeps the picture untouched instead. For audio files and podcasts, use [remove silence from audio](/remove-silence-from-audio).",
      ],
      faq: [
        {
          q: "Will the video lose quality?",
          a: "It is re-encoded once at a high quality setting, which is rarely visible. The cuts themselves change nothing else in the picture.",
        },
        {
          q: "Why is my background music preventing cuts?",
          a: "Music under the voice keeps the level above the threshold, so nothing counts as a pause. Raise the line above the music's level, or cut before the music is added.",
        },
        {
          q: "Can I undo one cut?",
          a: "Not one by one. Raise the minimum pause or lower the threshold until that pause is no longer shaded; the timeline updates as you change them.",
        },
        {
          q: "How long can the video be?",
          a: "As long as your device can hold the result in memory while it is written; a desktop has far more room than a phone. Finding the pauses only decodes the sound, which is quick next to encoding the picture.",
        },
        {
          q: "Is my video uploaded?",
          a: "No. The pauses are found and the video is cut and encoded in your browser.",
        },
      ],
    },
  },
};
