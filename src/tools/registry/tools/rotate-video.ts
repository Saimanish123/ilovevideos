import type { ToolInput } from "../schema";

export const rotateVideo: ToolInput = {
  slug: "rotate-video",
  engine: "rotate",
  category: "edit",
  phase: "p1",
  backends: ["webcodecs"],
  accepts: ["video"],
  produces: "video",
  keywords: [
    "rotate video",
    "rotate video 90 degrees",
    "rotate mp4",
    "video is sideways",
    "fix upside down video",
  ],
  aliases: ["turn", "sideways", "upside down", "orientation", "portrait to landscape"],
  related: ["flip-video", "trim-video", "compress-video", "mov-to-mp4"],
  updatedAt: "2026-09-30",
  icon: "rotate-cw",
  content: {
    en: {
      title: "Rotate video",
      subtitle:
        "Turn a sideways or upside-down video by 90, 180 or 270 degrees in your browser, without re-encoding.",
      metaTitle: "Rotate video online, free, no upload",
      metaDescription:
        "Rotate a video by 90, 180 or 270 degrees, or flip it. MP4 and MOV are fixed losslessly by rewriting one flag. Runs in your browser, nothing uploaded.",
      what: "This tool turns a video a quarter turn at a time and shows the result in the preview as you press. For MP4 and MOV files the picture data is not touched at all: the file header carries a rotation flag, and rewriting that flag is enough for every modern player to show the video the right way up. A flip, or a WebM or MKV file, needs each frame redrawn and re-encoded, and the panel tells you which of the two will happen before you start.",
      steps: [
        "Drop a video onto the page or choose one from your device.",
        "Press Rotate left or Rotate right until the preview looks right; add a flip if the picture is mirrored.",
        "Read the dimensions at the top of the panel, for example 1920×1080 → 1080×1920, and whether only the rotation flag changes or the video is re-encoded.",
        "Press Rotate.",
        "Watch the rotated result in the preview, then download it, or press Start over for the next file.",
      ],
      goodToKnow: [
        "Sideways phone videos are almost always a metadata problem, not a pixel problem. The phone records the sensor as it lies and stores an orientation flag in the MP4 or MOV header; a player that ignores the flag shows the clip on its side. Setting the flag here fixes the clip everywhere the flag is honoured, which today means every current browser, phone, desktop player and social app.",
        "Because the metadata path copies the video stream bit for bit, the output is the same size and quality as the input and works for any codec the file holds, including HEVC and ProRes that your browser could not decode for playback. The re-encode path, used for flips and for WebM or MKV, writes H.264 and follows the same rules as [compress video](/compress-video): a little quality is traded, and the result plays anywhere.",
        "A quarter turn swaps width and height. A 1920×1080 landscape clip becomes 1080×1920 portrait, which is the shape TikTok, Reels and Shorts expect; the reverse turns a portrait recording into a landscape one for a presentation or a monitor. The panel shows the exact output dimensions before you run it.",
        "Some editors and older tools strip or ignore the rotation flag on export. If a video you already rotated comes back sideways after passing through another program, rotate it here again with a flip toggled and untoggled, which forces the re-encode path and writes the pixels in their final orientation.",
        "If the clip only needs to be shorter as well, [trim video](/trim-video) first and rotate the trimmed file; both steps copy the stream on MP4 and MOV, so running them in sequence costs nothing in quality.",
      ],
      faq: [
        {
          q: "Does rotating lose quality?",
          a: "Not for MP4 and MOV without a flip: only the header changes and the picture is copied. Flips and WebM or MKV inputs are re-encoded, which the panel states before you start.",
        },
        {
          q: "Can I rotate by an angle other than 90 degrees?",
          a: "No. Video containers only store quarter turns, and arbitrary angles would need padding or cropping. This page rotates by 90, 180 and 270 degrees and flips.",
        },
        {
          q: "Why does my video look fine on my phone but sideways on the computer?",
          a: "The phone honours the orientation flag and the program on the computer does not. Rotating here makes the stored orientation match what you see, so both agree.",
        },
        {
          q: "Will the output play on Windows Media Player or older devices?",
          a: "Players from before about 2015 sometimes ignore the rotation flag. If yours does, toggle a flip on and off to force the re-encode path, which bakes the rotation into the pixels.",
        },
        {
          q: "Is the file uploaded anywhere?",
          a: "No. The header rewrite and any re-encoding happen inside your browser. Nothing is sent over the network.",
        },
        {
          q: "Does the sound change?",
          a: "No. The audio track is copied unchanged on both paths.",
        },
      ],
    },
  },
};
