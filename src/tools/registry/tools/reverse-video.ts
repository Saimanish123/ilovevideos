import type { ToolInput } from "../schema";

export const reverseVideo: ToolInput = {
  slug: "reverse-video",
  engine: "reverse",
  category: "edit",
  phase: "p2",
  backends: ["webcodecs"],
  accepts: ["video"],
  produces: "video",
  keywords: [
    "reverse video",
    "play video backwards",
    "reverse video online",
    "rewind video",
    "reverse a video with sound",
  ],
  aliases: ["backwards", "rewind", "reverse playback", "play in reverse", "reverse mp4"],
  related: ["boomerang-video", "loop-video", "change-video-speed", "trim-video", "video-to-gif"],
  updatedAt: "2026-10-01",
  icon: "rewind",
  illustration: "reverse",
  content: {
    en: {
      title: "Reverse a video",
      subtitle:
        "Make a video play backwards, with its sound reversed or removed. Runs in your browser.",
      metaTitle: "Reverse video online, free, no upload",
      metaDescription:
        "Play a video backwards: every frame re-encoded last first, the sound reversed or removed. Memory stays bounded on long clips. Free, on your device.",
      what: "This tool writes a copy of a video that runs from its last frame to its first. The sound can play backwards with it or be left out. Decoders only work forwards, so the video is decoded a section at a time from the end, each section's frames are held as raw pixels and encoded in reverse order, then the section is released; that keeps memory in check however long the clip is.",
      steps: [
        "Drop a video onto the page; the panel shows the number of frames to reverse.",
        "Choose whether the sound is reversed too or removed.",
        "Press Reverse and follow the frame count and the time left.",
        "Download the result; the preview plays it backwards first.",
      ],
      goodToKnow: [
        "A video file stores most frames as changes from the ones before, starting from a key frame. To play a section backwards its frames have to be decoded forwards from the key frame and then written in the opposite order, so a reverse takes about as long as a full re-encode. The picture is written as H.264 at the site's quality for re-encoded video; the size is estimated before you start.",
        "Memory stays bounded. Frames are decoded one key frame gap at a time, and a gap too long to hold in about 384 MB of raw frames is split into windows decoded from the key frame again. Screen recordings and some cameras put key frames many seconds apart; those take longer, and the panel says how much extra decoding a file needs. ffmpeg's own reverse filter keeps every frame of the clip in memory instead, which is why its documentation suggests trimming first.",
        "Reversed sound is decoded whole, so it has a limit: about 17 minutes of 48 kHz stereo, a little more at 44.1 kHz. A longer clip can still be reversed, silent; the panel switches to Remove it and says why. Speech and music played backwards sound strange, as on tape, which is sometimes the point and sometimes not.",
        "For a clip that goes forwards and then backwards in a loop, [boomerang video](/boomerang-video) makes that in one step. To slow a reversed moment down, run the result through [change video speed](/change-video-speed); to reverse only part of a video, cut that part out first with [trim video](/trim-video).",
        "Rotation, size and frame timing are kept: a portrait phone clip stays portrait, and each frame lasts as long as it did going forwards, so a variable frame rate recording keeps its rhythm in reverse.",
      ],
      faq: [
        {
          q: "Can the sound be reversed too?",
          a: "Yes, for clips up to about 17 minutes of 48 kHz stereo sound. Longer clips are reversed without sound.",
        },
        {
          q: "Why does reversing take longer than other edits?",
          a: "Every frame is decoded and encoded again, and frames far from a key frame may be decoded more than once, because decoders only run forwards.",
        },
        {
          q: "Is there a length limit for the picture?",
          a: "No fixed limit: memory stays bounded. Very long clips simply take as long as a full re-encode, and the result is held in memory until you download it.",
        },
        {
          q: "Does the quality change?",
          a: "Slightly, as with any re-encode. The bitrate is set high enough to keep the picture close to the source.",
        },
        {
          q: "Which formats work?",
          a: "MP4, MOV, WebM and MKV. Older formats need converting to MP4 first; the page links to the converter when that happens.",
        },
        {
          q: "Is my video uploaded?",
          a: "No. It is decoded and encoded in your browser, and nothing leaves your device.",
        },
      ],
    },
  },
};
