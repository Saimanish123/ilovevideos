import type { ToolInput } from "../schema";

export const h264ToHevc: ToolInput = {
  slug: "h264-to-hevc",
  engine: "codec",
  category: "convert",
  phase: "p2",
  backends: ["webcodecs"],
  accepts: ["video"],
  produces: "video",
  presetOptions: { codec: "hevc", from: "avc", lockTarget: true },
  keywords: [
    "h264 to hevc",
    "h264 to h265",
    "convert video to hevc",
    "convert to h265",
    "hevc encoder online",
  ],
  aliases: ["h265", "hevc", "x265", "smaller", "archive", "high efficiency"],
  related: ["hevc-to-h264", "change-video-codec", "compress-video", "video-info", "mov-to-mp4"],
  updatedAt: "2026-10-08",
  icon: "binary",
  illustration: "codec-pair:h264:hevc",
  content: {
    en: {
      title: "Convert H.264 to HEVC",
      subtitle: "Make an H.264 video smaller by saving it as HEVC.",
      metaTitle: "H.264 to HEVC converter, free, no upload",
      metaDescription:
        "Re-encode H.264 video as HEVC (H.265) in your browser, if its encoder supports HEVC. The page checks first and copies the sound. Free, no account.",
      action: "Convert",
      what: "This page re-encodes the picture of an H.264 video as HEVC, the codec newer phones record in, and copies the sound as it is. HEVC stores a similar picture in fewer bits than H.264, so the usual reason is a smaller file for an archive or a phone. Whether it can run at all depends on this browser: the page asks its HEVC encoder before you start and says plainly if there is none.",
      steps: [
        "Drop an H.264 video; the panel shows its codec and checks whether this browser has an HEVC encoder for its size.",
        "If HEVC is available, read the estimate: the output size next to the source's.",
        "Press Convert and follow the frame count and the time left.",
        "Download the HEVC file and check that it plays where you need it before removing the original.",
      ],
      goodToKnow: [
        "HEVC encoding in a browser comes from the platform: usually the device's hardware encoder. Some browsers and systems have one and some do not, and there is no software HEVC encoder built into this site, so on a system without one the page cannot convert and says so. The [change video codec](/change-video-codec) page shows every codec this browser can write, which may offer AV1 or VP9 instead.",
        "How much smaller the result is depends on the source. A camera file recorded at a high bitrate shrinks a lot; a clip that was already compressed hard, such as a download from a streaming site, has little left to give, because a re-encode cannot recover detail that was thrown away. The bitrate here is capped by what the source itself spends, so the HEVC file is not made larger than the H.264 one by mistake, and the result states the real size.",
        "Re-encoding costs a little quality every time. Keep the H.264 original if you may edit the clip again, and use HEVC as the final copy. For a smaller file that still plays everywhere, [compress video](/compress-video) keeps H.264 and lowers its bitrate instead.",
        "Before deleting anything, check where the HEVC copy has to play. Apple devices from recent years decode it in hardware, and the MP4 is tagged hvc1, the form Apple's players expect. Windows usually needs an extension from the Microsoft Store, and some editors, televisions and upload forms do not read HEVC at all; for those, [HEVC to H.264](/hevc-to-h264) is the way back.",
      ],
      faq: [
        {
          q: "Why can't this browser convert to HEVC?",
          a: "Its encoder reported no HEVC support for this video's size. HEVC encoding usually relies on the device's hardware, which some systems lack or do not expose to the browser.",
        },
        {
          q: "How much smaller will the file be?",
          a: "It depends on how hard the source was compressed. The panel estimates it before you start and the result shows the actual size.",
        },
        {
          q: "Is HEVC the same as H.265?",
          a: "Yes, two names for one codec. Apple's camera setting calls it High Efficiency.",
        },
        {
          q: "Does the sound change?",
          a: "No. It is copied byte for byte when the container holds it, which is the case for AAC sound in MP4 and MOV.",
        },
        {
          q: "Is my video uploaded?",
          a: "No. The conversion runs with your browser's own encoder, on your device.",
        },
      ],
    },
  },
};
