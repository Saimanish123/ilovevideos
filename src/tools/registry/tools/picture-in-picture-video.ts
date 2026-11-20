import type { ToolInput } from "../schema";

export const pictureInPictureVideo: ToolInput = {
  slug: "picture-in-picture-video",
  engine: "layout",
  category: "edit",
  phase: "p3",
  backends: ["webcodecs"],
  accepts: ["video"],
  produces: "video",
  presetOptions: { layout: "pip" },
  keywords: [
    "picture in picture video",
    "put a video on top of another video",
    "video overlay video online",
    "add a webcam corner to a video",
    "reaction video maker",
  ],
  aliases: ["pip", "video in video", "overlay video", "inset video", "reaction video", "facecam"],
  related: [
    "side-by-side-video",
    "remove-green-screen-from-video",
    "add-watermark-to-video",
    "merge-videos",
    "fix-audio-sync",
    "remove-background-from-video",
  ],
  updatedAt: "2026-11-18",
  icon: "picture-in-picture-2",
  illustration: "picture-in-picture",
  content: {
    en: {
      title: "Make a picture in picture video",
      subtitle: "Put a second video in a corner of the first.",
      metaTitle: "Picture in picture video, free, no upload",
      metaDescription:
        "Overlay one video in a corner of another: drag the inset, choose its size and corners, line the two up, keep either sound or both. Free, no upload.",
      action: "Combine",
      what: "This tool lays a second video over a corner of a first one, the layout of a reaction video, a webcam over a screen recording, or a sign-language interpreter over a talk. Both play in step in the preview as they will in the file. You choose the inset's size and corner or drag it anywhere, round its corners, give it a border, and decide whose sound is heard.",
      steps: [
        "Drop two videos; the first is the main picture and the second becomes the inset, in the bottom right.",
        "Drag the inset on the preview, or pick a size and a corner; Swap exchanges the two videos.",
        "If the recordings did not start together, set when the inset starts so they line up, and play the preview to check.",
        "Choose the sound, then press Combine and download the MP4.",
      ],
      goodToKnow: [
        "The result is as long as the main video. If the inset is shorter, its last frame stays on screen when it ends, or it disappears if you choose Hide it under More options; the same applies before an inset that starts late. With Auto the output has the main video's shape and size, at most 1920 pixels on its long side; 16:9, 9:16 and 1:1 make a frame of that shape and cut the main picture to fill it.",
        "Two recordings of the same moment rarely start on the same frame. Play the preview, find a clap, a cut or a word both pick up, and nudge the inset's start until they match; positive values start it later, negative values skip its first seconds. If the sound alone is out of step within one file, [fix audio sync](/fix-audio-sync) is the right tool instead.",
        "With Both, the two soundtracks are added together and a limiter keeps the peaks under −1 dB, so loud passages do not clip; quiet passages are untouched. For a reaction video, keep the main video's sound and the inset's voice both; for a webcam over a screen recording, the screen recording's sound is usually the one with the microphone.",
        "Everything is drawn into one new picture, so both videos are decoded and the result is encoded once to H.264, with AAC sound (Opus where the browser has no AAC encoder). That is the heaviest kind of job a browser does: on a phone, two 4K inputs may be slow or run out of memory. The output's long side stops at 1920 pixels. For a logo instead of a second video, [add a watermark](/add-watermark-to-video) is lighter and copies the sound when the file allows; for a still picture or a sticker, [add an image](/add-image-to-video).",
      ],
      faq: [
        {
          q: "How do I put a video in the corner of another video?",
          a: "Drop both, the main one first. The second appears in the bottom right; pick another corner or drag it.",
        },
        {
          q: "Can the small video be round or have a border?",
          a: "Under More options choose Square, Rounded or Round corners, and add a white or black border.",
        },
        {
          q: "What if the two videos are different lengths?",
          a: "The result is as long as the main video. A shorter inset holds its last frame or disappears, as you choose.",
        },
        {
          q: "Can I hear both videos?",
          a: "Yes. Choose Both: the two sounds are mixed and kept from clipping.",
        },
        {
          q: "Do the two videos need the same frame rate?",
          a: "No. The output uses the higher of the two rates, up to 60 frames per second, and each video shows the frame it has at that moment.",
        },
        {
          q: "Are my videos uploaded?",
          a: "No. Both are decoded and combined in your browser and never leave your device.",
        },
      ],
    },
  },
};
