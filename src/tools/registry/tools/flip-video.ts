import type { ToolInput } from "../schema";

/** Preset page of the rotate engine: horizontal flip preselected, button says Flip. */
export const flipVideo: ToolInput = {
  slug: "flip-video",
  engine: "rotate",
  category: "edit",
  phase: "p1",
  backends: ["webcodecs"],
  accepts: ["video"],
  produces: "video",
  presetOptions: { flip: "horizontal" },
  keywords: [
    "flip video",
    "mirror video",
    "unmirror video",
    "flip video horizontally",
    "mirror mp4",
  ],
  aliases: ["mirror", "reflect", "backwards text", "selfie"],
  related: [
    "rotate-video",
    "trim-video",
    "compress-video",
    "remove-audio-from-video",
    "webcam-recorder",
  ],
  updatedAt: "2026-09-30",
  icon: "flip-horizontal-2",
  illustration: "flip",
  content: {
    en: {
      title: "Flip video",
      subtitle:
        "Mirror a video left to right or top to bottom so text reads correctly. Processed in your browser.",
      metaTitle: "Flip and mirror video online, free, no upload",
      metaDescription:
        "Flip a video horizontally or vertically to undo a mirrored selfie recording. Live preview, then re-encoded on your device. Free, no account, no upload.",
      action: "Flip",
      what: "This page mirrors the picture along one axis. Horizontal is the common fix: front cameras and many meeting apps show you a mirror image while recording, and the saved file sometimes keeps that mirror, so any text, logo or clock in the frame reads backwards. Vertical flips are rarer and mostly used for effect or for footage from an inverted camera mount. The preview mirrors as soon as you toggle, so you can check a sign or a shirt before running it.",
      steps: [
        "Drop the video onto the page or choose it from your device.",
        "Flip horizontal is already on; toggle Flip vertical instead if the picture is upside down but not sideways.",
        "Add a quarter turn with Rotate left or right if the orientation is wrong as well.",
        "Press Flip and download the corrected file.",
      ],
      goodToKnow: [
        "A flip cannot be expressed by the rotation flag that MP4 and MOV carry, so unlike a plain quarter turn it always rewrites the pixels. Every frame is decoded, mirrored on a canvas and encoded again as H.264 on your device. Expect a file size in the same range as the original and a small, usually invisible, quality cost; if the file is large, run [compress video](/compress-video) afterwards rather than before, so the picture is encoded once with the right orientation.",
        "Mirrored selfie footage is a preview convention leaking into the file. Cameras mirror the viewfinder so that moving left feels like left, and most save the unmirrored image, but some webcam apps and a few phones save the mirrored view. The tell is text: if a poster behind you reads backwards, flip horizontally and it reads correctly with no other change.",
        "A horizontal flip followed by a 180-degree turn is the same as a vertical flip. When a clip is both sideways and mirrored, set the rotation first and toggle the flip while watching the preview; the two controls combine, and the summary line names the final orientation.",
        "Vertical flips are the tool for footage from an upside-down mount that also mirrored the image, and for the rare vertically mirrored capture from a badly configured capture card. For footage that is simply upside down without a mirror, use [rotate video](/rotate-video) with 180 degrees, which keeps the stream untouched on MP4 and MOV.",
        "Audio is copied unchanged, and subtitle tracks, if present, are kept. Any orientation flag the source carried is applied first and then removed, so the output shows the same way in every player without depending on the flag.",
      ],
      faq: [
        {
          q: "Is flipping lossless?",
          a: "No. A flip has no container flag, so the frames are re-encoded. The quality cost is small and the summary line says so before you start.",
        },
        {
          q: "Which flip fixes backwards text?",
          a: "Horizontal. It mirrors left and right, which is what some webcam apps and a few phones did in the first place.",
        },
        {
          q: "Can I flip and rotate at the same time?",
          a: "Yes. The rotation is applied first, then the flip, and the preview shows the combination live.",
        },
        {
          q: "Does the output format change?",
          a: "The container stays the same: MP4 stays MP4, MOV stays MOV, WebM stays WebM. The video codec becomes H.264 where the container allows it.",
        },
        {
          q: "Will a flipped video play on my phone?",
          a: "Yes. The mirror is written into the pixels, so any player shows it correctly without relying on metadata.",
        },
      ],
    },
  },
};
