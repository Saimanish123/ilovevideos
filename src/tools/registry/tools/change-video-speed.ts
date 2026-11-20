import type { ToolInput } from "../schema";

export const changeVideoSpeed: ToolInput = {
  slug: "change-video-speed",
  engine: "speed",
  category: "edit",
  phase: "p1",
  backends: ["ffmpeg-wasm"],
  accepts: ["video"],
  produces: "video",
  keywords: [
    "change video speed",
    "speed up video",
    "slow down video",
    "video speed changer",
    "2x video",
    "slow motion video",
  ],
  aliases: ["fast forward", "time lapse", "slow motion", "faster", "slower", "tempo"],
  related: [
    "trim-video",
    "video-to-gif",
    "gif-to-mp4",
    "compress-video",
    "remove-audio-from-video",
    "add-timer-to-video",
  ],
  updatedAt: "2026-09-30",
  icon: "gauge",
  content: {
    en: {
      title: "Change video speed",
      subtitle: "From 0.1× to 8×, with the sound kept in tune.",
      metaTitle: "Change video speed online, free, no upload",
      metaDescription:
        "Speed up or slow down a video from 0.1× to 8×. The preview plays at the new speed first; audio keeps its pitch or is muted. Free, runs on your device.",
      what: "This tool re-times a video so that it plays faster or slower and writes a new MP4 with the new length. Pick a preset or type an exact factor, and the preview immediately plays at that speed so you can judge it before anything is encoded. The sound is stretched to match without turning voices into a squeak, shifted along with the picture for the tape effect, or removed.",
      steps: [
        "Drop a video onto the page or choose one from your device.",
        "Pick a speed preset or type an exact value; the preview plays at that speed straight away.",
        "Choose how the sound should follow: keep its pitch, shift with the speed, or mute.",
        "Check the new length at the top of the panel, for example 1:20 → 0:40, and press Change speed.",
        "Watch the result in the preview and download the MP4.",
      ],
      goodToKnow: [
        "Speed and length are the same setting seen from two sides: 2× halves the running time, 0.5× doubles it, and the panel shows the resulting length as you change the value. A one-minute screen recording at 1.5× becomes forty seconds, which is the usual sweet spot for a walkthrough that people would otherwise scrub through.",
        "Faster than the original drops frames; slower repeats them. A clip recorded at 30 fps and slowed to 0.25× shows each frame four times, so motion looks stepped rather than smooth. Real slow motion needs footage recorded at a high frame rate, such as the 120 or 240 fps modes on phones, which this tool then slows without repetition down to 0.25× or 0.125×. To lower the frame rate itself and keep the speed, use [change video frame rate](/change-video-frame-rate).",
        "Keep pitch uses a time-stretch that preserves the tone of voices and music while changing their tempo, in half or double steps chained together for the extreme factors. It sounds natural between about 0.5× and 4×; beyond that range stretched speech turns watery and the panel points you to Mute. Shift pitch is the old tape recorder behaviour: faster and higher, slower and deeper.",
        "The picture is always re-encoded, because changing the timing of every frame is not something a container flag can express. Output is H.264 in MP4 at a quality setting tuned for screen recordings and phone footage; if you need it smaller afterwards, [compress video](/compress-video) works on the result, and [trim video](/trim-video) beforehand keeps the encode short.",
        "For a time-lapse effect from a long recording, values above 4× are allowed up to 8×; combine with Mute, since sound at that speed carries no information. For a GIF at a different tempo, change the speed here first and then use [video to GIF](/video-to-gif) on the result. To play a clip backwards, use [reverse video](/reverse-video).",
      ],
      faq: [
        {
          q: "Does the audio go out of sync?",
          a: "No. Picture and sound are re-timed by the same factor in one pass, so they stay aligned throughout.",
        },
        {
          q: "Can I change the speed of only part of the video?",
          a: "Not on this page. Trim the part you want to change, run it here, and join the pieces with [merge videos](/merge-videos).",
        },
        {
          q: "Why does slowed-down footage look choppy?",
          a: "Slowing down repeats frames; the source only has so many. Footage recorded at 120 or 240 fps slows smoothly, ordinary 30 fps footage looks stepped below about 0.5×.",
        },
        {
          q: "What happens to the pitch of voices?",
          a: "With Keep pitch, voices keep their tone and only speak faster or slower. With Shift pitch they rise when sped up and drop when slowed, like a tape.",
        },
        {
          q: "Does the output keep the original resolution?",
          a: "Yes. Width, height and frame rate stay the same; only the timing and the length change.",
        },
        {
          q: "Is my video uploaded?",
          a: "No. The re-encode runs in your browser after a one-time download that the browser keeps. Your file never leaves the device.",
        },
      ],
    },
  },
};
