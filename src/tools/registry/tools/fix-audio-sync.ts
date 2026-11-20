import type { ToolInput } from "../schema";

export const fixAudioSync: ToolInput = {
  slug: "fix-audio-sync",
  engine: "audio-sync",
  category: "audio",
  phase: "p2",
  backends: ["webcodecs"],
  accepts: ["video"],
  produces: "video",
  keywords: [
    "fix audio sync",
    "audio out of sync video",
    "audio delay video",
    "lip sync fix",
    "shift audio in video",
  ],
  aliases: ["audio delay", "out of sync", "lip sync", "audio offset", "itsoffset"],
  related: [
    "shift-subtitle-timing",
    "replace-audio-in-video",
    "select-audio-tracks",
    "trim-video",
    "picture-in-picture-video",
  ],
  updatedAt: "2026-10-01",
  icon: "move-horizontal",
  content: {
    en: {
      title: "Fix audio sync",
      subtitle: "Line a video's sound up with the picture.",
      metaTitle: "Fix audio out of sync in a video, free",
      metaDescription:
        "Shift a video's sound earlier or later by milliseconds to fix lip sync. Nothing is re-encoded; MP4 and MOV stay sample-exact. In your browser. Free.",
      action: "Fix sync",
      what: "This tool moves the whole sound track of a video earlier or later against the picture by the amount you set, from a few milliseconds to ten seconds. Nothing is decoded or re-encoded: picture and sound are copied packet for packet and only the time the sound starts changes, so there is no quality loss and a long file takes about as long as copying it.",
      steps: [
        "Drop the video onto the page or choose one from your device.",
        "Play it and decide whether the sound comes too late (lips move first) or too early.",
        "Set how far to move it, in milliseconds.",
        "Press Fix sync, check a moment where someone speaks in the result, and download it.",
      ],
      goodToKnow: [
        "When the sound is late, which is the usual fault, it is played earlier and the last moment of the video becomes silent by the same amount. When it is early, it is played later and the few milliseconds of sound that would run past the last frame are cut, so the video keeps its length.",
        "In MP4 and MOV the shift is exact to the sample: the file tells players where the sound starts with an edit list, the same mechanism that marks the start of an AAC track, so 37 ms means 37 ms. MKV and WebM have no such marker that the browser can write, so there the shift lands on the nearest sound frame, about 20 ms, which is below what most people notice.",
        "Every sound track moves together, so a video with two languages stays in step in both. The picture keeps its frames, frame rate and size, and the file keeps its container and tags.",
        "A delay that grows over the length of a recording, small at the start and large at the end, is a drift, not an offset: the sound runs at a slightly different speed from the picture. A fixed shift cannot fix drift; it can only line the two up at one point.",
        "Subtitles out of step are a different file: [shift subtitle timing](/shift-subtitle-timing) moves every cue. If the sound was recorded on a separate device, [replace the audio](/replace-audio-in-video) and place the new recording on the timeline instead.",
      ],
      faq: [
        {
          q: "How do I know how much to shift?",
          a: "Find a sharp moment, a clap, a door or a hard consonant, and compare when you see it and when you hear it. Start with about 100 ms, check the result, and adjust.",
        },
        {
          q: "Does this re-encode my video?",
          a: "No. Both the picture and the sound are copied as they are; only their timing relative to each other changes.",
        },
        {
          q: "Can I move the sound by more than a second?",
          a: "Yes, up to ten seconds either way. Type the value in milliseconds; the slider covers the first two seconds.",
        },
        {
          q: "Why is my MKV only accurate to about 20 ms?",
          a: "The shift lands on the nearest sound frame there, because the browser cannot write the marker MKV and WebM use for a start inside a frame. Converting to MP4 first gives an exact shift.",
        },
        {
          q: "Is my video uploaded?",
          a: "No. The copy is made in your browser; nothing leaves this device.",
        },
      ],
    },
  },
};
