import type { ToolInput } from "../schema";

export const movToMp4: ToolInput = {
  slug: "mov-to-mp4",
  engine: "convert-video",
  category: "convert",
  phase: "p1",
  backends: ["webcodecs", "ffmpeg-wasm"],
  accepts: ["video"],
  produces: "video",
  presetOptions: { from: "mov", to: "mp4" },
  keywords: ["mov to mp4", "convert mov to mp4", "mov to mp4 converter", "quicktime to mp4"],
  aliases: ["quicktime", "iphone video to mp4"],
  related: ["compress-video", "convert-video", "hevc-to-h264", "mp4-to-mov"],
  updatedAt: "2026-09-02",
  icon: "repeat",
  content: {
    en: {
      title: "Convert MOV to MP4",
      subtitle:
        "Turn QuickTime files from iPhone or Mac into MP4 that plays anywhere. Usually instant.",
      metaTitle: "MOV to MP4 converter online, free, no upload",
      metaDescription:
        "Convert MOV to MP4 in your browser without uploading. Most files convert instantly with no quality loss. Free, no account, no watermark.",
      what: "MOV and MP4 are close relatives: both are containers based on the same QuickTime structure, and both usually carry H.264 or HEVC video with AAC audio. In most cases this tool does not re-encode anything. It copies the video and audio streams into a new MP4 container in a second or two, with zero quality loss. Only when the MOV holds a codec that MP4 players do not accept (ProRes, PCM audio, some screen-recording codecs) does it transcode.",
      steps: [
        "Drop your .mov file onto the page.",
        "The tool inspects the streams and tells you whether it can convert losslessly.",
        "If the file uses HEVC, choose whether to keep it (smaller) or convert to H.264 (plays everywhere).",
        "Press Convert.",
        "Download the .mp4.",
      ],
      goodToKnow: [
        'iPhones record in HEVC by default since iOS 11 ("High Efficiency" in Camera settings). A HEVC MOV remuxed to MP4 is still HEVC, which Windows Media Player, older Android phones and many web players cannot decode. If the destination is unknown, convert to H.264.',
        "Mac screen recordings (Shift-Cmd-5) are MOV files with H.264 video and often no audio track, or with uncompressed PCM audio. MP4 does not officially support PCM, so we convert that audio to AAC and copy the video untouched.",
        "ProRes MOV files from editing software are enormous and must be re-encoded; expect a 1 GB ProRes file to become roughly 50–100 MB of H.264. That re-encode runs on your device and may take a few minutes.",
        "Rotation on iPhone MOV files is stored as metadata. We preserve it, so the MP4 plays with the correct orientation. Some old players ignore this flag; if yours does, use Rotate video to bake the rotation in.",
      ],
      faq: [
        {
          q: "Does converting MOV to MP4 lose quality?",
          a: "Not when the streams are compatible, which is most iPhone and Mac files. The video data is copied bit for bit into the new container.",
        },
        {
          q: "Why is my MP4 the same size as the MOV?",
          a: "Because nothing was re-encoded. If you want a smaller file, use Compress video after converting.",
        },
        {
          q: "Why won't the MP4 play on Windows?",
          a: "It probably still contains HEVC video. Convert again and choose H.264, or install the HEVC extension in Windows.",
        },
        {
          q: "Can I convert many MOV files at once?",
          a: "Yes. Drop several files and they are processed one after another; download them individually or as a zip.",
        },
        {
          q: "Is the file uploaded?",
          a: "No. The conversion runs in your browser and the file stays on your device.",
        },
      ],
    },
  },
};
