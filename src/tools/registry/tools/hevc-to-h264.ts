import type { ToolInput } from "../schema";

export const hevcToH264: ToolInput = {
  slug: "hevc-to-h264",
  engine: "codec",
  category: "convert",
  phase: "p2",
  backends: ["webcodecs"],
  accepts: ["video"],
  produces: "video",
  presetOptions: { codec: "avc", from: "hevc", lockTarget: true },
  keywords: [
    "hevc to h264",
    "h265 to h264",
    "convert hevc to h264",
    "iphone video to h264",
    "hevc not playing",
  ],
  aliases: ["h265", "hevc", "iphone", "high efficiency", "most compatible", "windows"],
  related: ["mov-to-mp4", "change-video-codec", "h264-to-hevc", "video-info", "compress-video"],
  updatedAt: "2026-10-08",
  icon: "binary",
  illustration: "codec",
  content: {
    en: {
      title: "Convert HEVC to H.264",
      subtitle:
        "Re-encode an HEVC (H.265) video as H.264 so it plays and edits everywhere. Runs in your browser.",
      metaTitle: "HEVC to H.264 converter, free, no upload",
      metaDescription:
        "Turn HEVC (H.265) video from an iPhone, a drone or a camera into H.264 that every player and editor opens. The sound is copied. Free, on your device.",
      action: "Convert",
      what: "This page re-encodes the picture of an HEVC video as H.264 and keeps the rest: resolution, frame rate, rotation and, in MP4 and MOV, the original sound, copied without re-encoding. It is for the moment a clip from a phone, drone or camera will not open in an editor, a presentation, an older television or a website's upload form, because those only read H.264.",
      steps: [
        "Drop the HEVC video; the panel confirms the codec and says whether this browser can encode H.264 at its size.",
        "Check the output line: container, estimated size and what happens to the sound.",
        "Press Convert and wait for the frame count to finish.",
        "Download the H.264 file; the preview plays it first.",
      ],
      goodToKnow: [
        "iPhones record HEVC when the camera format is set to High Efficiency, and H.264 when it is set to Most Compatible (Settings, Camera, Formats). Changing that setting only affects new recordings; the clips already on the phone stay HEVC, which is what this page is for. Many drones and action cameras also record HEVC to fit more on the card.",
        "HEVC needs a decoder that many programs and devices do not have or do not license. Windows usually needs an extension from the Microsoft Store to play it, some editors and presentation tools refuse it, and older televisions and set-top boxes ignore it. H.264 is the codec every one of them reads, which is the whole reason to convert.",
        "Expect the H.264 file to be larger than the HEVC one at a similar picture: HEVC was designed to need fewer bits for the same quality. The bitrate here is set from the source, scaled for H.264, and capped at the density the site's compressor calls best quality, so the file is not larger than it needs to be. To bring it down afterwards, [compress video](/compress-video) works on the result.",
        "An iPhone MOV goes out as a MOV with H.264 inside and the same AAC sound; an HEVC MP4 or MKV stays in its container. If the goal is an MP4 file that plays everywhere rather than a codec change, [MOV to MP4](/mov-to-mp4) with its plays-everywhere choice does both in one step.",
        "Browsers without a hardware decoder for HEVC cannot read the source at all; the panel then says so rather than failing half way. If that happens, the same page in a browser on a device that plays HEVC, such as a recent Mac or iPhone, can usually do the conversion.",
      ],
      faq: [
        {
          q: "Is H.265 the same as HEVC?",
          a: "Yes. H.265 and HEVC (High Efficiency Video Coding) are two names for the same codec, as H.264 and AVC are for the older one.",
        },
        {
          q: "Will I lose quality?",
          a: "A little, as with any re-encode. The bitrate is chosen so the picture stays close to the source; keep the original if you may need it later.",
        },
        {
          q: "Why is the H.264 file bigger?",
          a: "H.264 needs more bits than HEVC for a similar picture. That is the price of playing everywhere.",
        },
        {
          q: "What happens to the sound?",
          a: "In MP4 and MOV the AAC sound is copied as it is. The panel says before you start if a file's sound has to be encoded instead.",
        },
        {
          q: "My video is already H.264. What now?",
          a: "Then there is nothing to convert; the page says so. If it still will not play, check its container and codecs in [video info](/video-info).",
        },
        {
          q: "Is my video uploaded?",
          a: "No. Decoding and encoding happen in your browser, and the file stays on your device.",
        },
      ],
    },
  },
};
