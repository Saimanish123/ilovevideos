import type { ToolInput } from "../schema";

export const boomerangVideo: ToolInput = {
  slug: "boomerang-video",
  engine: "loop",
  category: "edit",
  phase: "p2",
  backends: ["webcodecs"],
  accepts: ["video"],
  produces: "video",
  presetOptions: { boomerang: true },
  keywords: [
    "boomerang video",
    "make a boomerang",
    "boomerang video maker",
    "forward and reverse video loop",
    "boomerang from video",
  ],
  aliases: ["boomerang", "ping pong", "back and forth", "bounce", "rewind loop"],
  related: ["loop-video", "reverse-video", "video-to-gif", "trim-video", "change-video-speed"],
  updatedAt: "2026-10-01",
  icon: "iteration-ccw",
  illustration: "boomerang",
  content: {
    en: {
      title: "Make a boomerang video",
      subtitle: "Make a clip play forwards, then backwards, on repeat.",
      metaTitle: "Boomerang video maker, free, no upload",
      metaDescription:
        "Make a boomerang from any short video: it plays forwards, then backwards, on repeat. Choose the bounces or a length. Free, no account, no upload.",
      action: "Make boomerang",
      what: "A boomerang plays a moment forwards and then backwards, over and over, so a jump, a toast or a wave bounces back and forth. This page makes one from any video you have: it encodes one bounce (the clip forwards, then in reverse without repeating the turning frame) and then copies that bounce as many times as you ask, in one MP4.",
      steps: [
        "Trim your clip to the moment first if it is long; one to three seconds makes the classic bounce.",
        "Drop it here and choose the number of bounces, or a length to reach.",
        "Press Make boomerang and wait for the one bounce to encode; the repeats are copied.",
        "Download the MP4; the preview plays it on the page.",
      ],
      goodToKnow: [
        "Short is the point. The effect works because the eye catches the reversal, which is lost in a long clip, and a short bounce also encodes quickly. Cut the moment with [trim video](/trim-video) first, then bring the trimmed file here, or use the next-step link on the trim page's result.",
        "Only one bounce is encoded. Reversing needs every frame decoded and written again last first; the bounce is then copied for each repeat without another encode, so ten bounces take barely longer than one. The picture is H.264 at the quality the site uses for reshaped video.",
        "A boomerang has no sound. Reversed sound on a bounce is rarely what anyone wants, and a looping clip with no audio is also what chat apps and feeds autoplay without asking. For the reversed clip on its own, with or without its sound played backwards, use [reverse video](/reverse-video).",
        "The turning frames are not doubled: the last frame forwards is not shown again as the first frame backwards, so the bounce does not stall at the end. The start of the next bounce does repeat the first frame once, which at 30 fps lasts a thirtieth of a second.",
        "Boomerangs from phone apps are often sped up as well. For that look, run the clip through [change video speed](/change-video-speed) at 1.5× or 2× first; for a boomerang that plays inline anywhere, turn the result into a GIF with [video to GIF](/video-to-gif).",
      ],
      faq: [
        {
          q: "How long should the clip be?",
          a: "One to three seconds is typical. Longer clips work, but the back-and-forth reads best on a short moment.",
        },
        {
          q: "Why is there no sound?",
          a: "The boomerang is written without sound. Use reverse video if you want a clip with its sound played backwards.",
        },
        {
          q: "Can I make it faster, like the phone apps?",
          a: "Yes: speed the clip up with change video speed first, then make the boomerang from the faster clip.",
        },
        {
          q: "How many bounces can it have?",
          a: "Up to 100, as long as the file stays under 1 GB. The panel shows the length and size before you start.",
        },
        {
          q: "Is my video uploaded?",
          a: "No. The bounce is encoded in your browser and the file stays on your device.",
        },
      ],
    },
  },
};
