import { ffmpegDownloadSize } from "@/tools/engines/ffmpeg/size";
import type { ToolInput } from "../schema";

export const videoConverter: ToolInput = {
  slug: "video-converter",
  engine: "convert-video",
  category: "convert",
  phase: "p1",
  backends: ["webcodecs"],
  accepts: ["video"],
  produces: "video",
  presetOptions: {},
  keywords: [
    "video converter",
    "convert video online",
    "video format converter",
    "change video format",
  ],
  aliases: ["convert", "change format", "container"],
  related: ["gif-to-mp4", "compress-video"],
  updatedAt: "2026-09-30",
  icon: "repeat",
  illustration: "remux",
  content: {
    en: {
      title: "Convert video",
      subtitle: "Change a video to MP4, MOV, WebM, AVI and more.",
      metaTitle: "Video converter online, free, no upload",
      metaDescription:
        "Convert video between MP4, MOV, WebM, MKV, AVI, WMV, FLV, MPEG and more in your browser. Lossless when the formats allow. Free, no account.",
      what: "This is the general converter behind every format-pair page on the site. Drop any video, and it reads the container and codecs, lets you pick a target format, and tells you before you start whether the result will be a lossless copy or a re-encode. A format is just a box; when the codecs inside fit the new box, the file is rewritten with nothing lost. When they do not, the video is re-encoded with the device's hardware encoder where available.",
      steps: [
        "Drop a video file onto the page.",
        "Check the detected container and codecs at the top of the panel.",
        "Choose the output format by what it is for. Each choice says, before you pick it, whether this file would be copied or re-encoded.",
        "Press Convert and download the result.",
      ],
      goodToKnow: [
        "Lossless conversions are possible when the video codec is accepted by both containers: H.264, HEVC and AV1 move freely between MP4, MOV and MKV; VP9 and AV1 move between WebM and MKV. In those cases the output is bit-identical video in a different wrapper, and the conversion is limited only by how fast your device reads and writes the file.",
        "Re-encoding is required when the codec does not fit: anything going into WebM (which only takes VP8, VP9 and AV1), ProRes going anywhere but MOV, and PCM audio going into MP4. The tool re-encodes only the stream that needs it. Video becomes H.264 for MP4, MOV and MKV, or VP9 for WebM; audio becomes AAC or Opus.",
        "If you convert often between two specific formats, the dedicated pair pages such as [MOV to MP4](/mov-to-mp4), [MKV to MP4](/mkv-to-mp4), [WebM to MP4](/webm-to-mp4), [AVI to MP4](/avi-to-mp4) and [MP4 to WebM](/mp4-to-webm) explain the quirks of that pair, for example why iPhone HEVC needs a second step to play on Windows, or why OBS recordings are MKV in the first place. To keep only the sound, [MP4 to MP3](/mp4-to-mp3) is the shorter route, and a file that has the right container but the wrong codec needs [HEVC to H.264](/hevc-to-h264) instead.",
        `Two engines sit behind this page. MP4, MOV, WebM and MKV are handled by the browser's own media pipeline, which streams the file and copies streams losslessly whenever it can. AVI, WMV, FLV, MPEG, MPEG-TS, 3GP, OGV and VOB need a one-time download (about ${ffmpegDownloadSize()}, kept by the browser) and are usually re-encoded (streams can be copied into MPEG-TS and 3GP); because the whole file is held in memory, they suit files up to roughly 2 GB. MXF, RealMedia, DV and SWF can be read but not written; convert them to MP4. A file that will not open in any of them, or stops early, may be cut off; [repair video](/repair-video) says what is missing.`,
        "Every audio track the target container can hold is carried over. Text subtitle tracks survive only in MKV; the other containers drop them.",
      ],
      faq: [
        {
          q: "Which conversions are lossless?",
          a: "Any where the source codec is accepted by the target container. The tool checks this for your file and says so before you convert. As a rule: MP4, MOV and MKV exchange H.264, HEVC and AV1 freely; WebM requires VP8, VP9 or AV1.",
        },
        {
          q: "Can I convert to AVI or WMV?",
          a: "Yes. Legacy containers need a one-time download and are re-encoded. MP4 is the modern replacement and plays on more devices than either, so prefer it unless a specific program demands AVI or WMV.",
        },
        {
          q: "Why is there a separate MOV to MP4 page?",
          a: "Because that pair has its own story: iPhone HEVC, macOS PCM audio, ProRes. The pair pages explain what actually happens for that combination; this page handles every combination.",
        },
        {
          q: "Is my video uploaded?",
          a: "No. Detection, remuxing and encoding all happen in your browser. Nothing is sent over the network.",
        },
        {
          q: "What is the file size limit?",
          a: "MP4, MOV, WebM and MKV are streamed rather than loaded into memory, so multi-gigabyte files work on a desktop and free storage is the limit on phones. Formats that need the one-time download are held in memory and suit files up to roughly 2 GB.",
        },
      ],
    },
  },
};
