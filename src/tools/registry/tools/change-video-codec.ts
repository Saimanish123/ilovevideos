import type { ToolInput } from "../schema";

export const changeVideoCodec: ToolInput = {
  slug: "change-video-codec",
  engine: "codec",
  category: "convert",
  phase: "p2",
  backends: ["webcodecs"],
  accepts: ["video"],
  produces: "video",
  keywords: [
    "change video codec",
    "convert video codec",
    "video codec converter",
    "convert video to av1",
    "convert video to vp9",
    "re-encode video",
  ],
  aliases: ["codec", "h264", "h265", "hevc", "av1", "vp9", "encode", "transcode"],
  related: [
    "hevc-to-h264",
    "h264-to-hevc",
    "video-converter",
    "video-info",
    "compress-video",
    "change-video-bitrate",
  ],
  updatedAt: "2026-10-01",
  icon: "binary",
  illustration: "codec",
  content: {
    en: {
      title: "Change video codec",
      subtitle:
        "Re-encode a video as H.264, HEVC, VP9 or AV1, with what this browser can encode shown first.",
      metaTitle: "Change video codec online, free, no upload",
      metaDescription:
        "Re-encode video to H.264, HEVC, VP9 or AV1 in your browser. The page asks your browser which encoders it has before you choose. Free, no account.",
      what: "This tool re-encodes the picture of a video with a different codec and keeps everything else: the size, the frame rate and, when the new container holds it, the exact same sound. Before you choose, it asks this browser's own encoder, codec by codec and at this video's size, whether it can do the job, and marks each choice as available or not. Nothing is promised that the encoder has not confirmed.",
      steps: [
        "Drop a video; the panel shows its current codec, container and size.",
        "Look at the four codecs: each says what it is for and whether this browser can encode it at this size.",
        "Choose one; the line under the panel gives the container, the estimated size and what happens to the sound.",
        "Press Change codec, watch the frame count and the time left, and download the result.",
      ],
      goodToKnow: [
        "A codec is how the pictures are compressed; the container (MP4, WebM, MOV, MKV) is the box they are stored in. Changing the box alone is lossless and is the [video converter](/video-converter)'s job. Changing the codec always decodes and re-encodes every frame, which costs a little quality each time, so keep the original and convert from it rather than from an earlier conversion.",
        "Which codecs you can write depends on the browser and the device, not on this site. Encoders come from the browser's WebCodecs support and, where there is one, the device's hardware encoder; HEVC and AV1 in particular are present on some systems and missing on others, and the same browser can differ between a laptop and a phone. That is why the list is checked for your file every time rather than printed on the page.",
        "H.264 is the safe choice for playing anywhere: almost every browser, phone, television and editor reads it. HEVC and AV1 reach a similar picture at a lower bitrate, so they suit archiving and phones that play them in hardware; VP9 is the web's WebM codec. The bitrate here is chosen for a similar picture to the source and never above what the source spends, adjusted for how efficient the new codec is, so a converted file is not padded with bits that add no detail.",
        "The container follows the codec: H.264 and HEVC go into MP4 (a MOV or MKV stays what it was), VP9 into WebM, AV1 into MP4. HEVC in MP4 is tagged hvc1, the form Apple's players expect. The sound is copied when the container takes it; AAC into WebM is encoded to Opus, because WebM does not hold AAC.",
        "Software encoders are slower than hardware ones, and AV1 in software is the slowest of the four. The progress line counts frames and, after a few seconds, shows the time left from the real rate, so a long clip tells you early how long it will take. To only make a file smaller without choosing a codec, [compress video](/compress-video) is the simpler page.",
      ],
      faq: [
        {
          q: "Why is HEVC or AV1 marked as not available?",
          a: "This browser's encoder said it cannot encode that codec at this video's size. Another browser, or the same one on other hardware, may be able to.",
        },
        {
          q: "Is changing the codec lossless?",
          a: "No. Every frame is decoded and encoded again. At the bitrates used here the loss is small, but it adds up if you convert a converted file.",
        },
        {
          q: "Which codec gives the smallest file?",
          a: "Usually AV1, then HEVC and VP9, then H.264, at a similar picture. The panel estimates the size for your file and the result shows the real one.",
        },
        {
          q: "Will the sound change?",
          a: "Not when the new container holds it: it is copied byte for byte. AAC going into WebM is encoded once to Opus, and the panel says so first.",
        },
        {
          q: "What if my file is AVI or WMV?",
          a: "This page reads MP4, MOV, WebM and MKV. Convert older formats with the [video converter](/video-converter) first, then change the codec here if you still need to.",
        },
        {
          q: "Is my video uploaded?",
          a: "No. The encoder runs in your browser, and the file never leaves your device.",
        },
      ],
    },
  },
};
