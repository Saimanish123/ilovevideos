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
  related: [
    "mov-to-mp4",
    "mkv-to-mp4",
    "webm-to-mp4",
    "mp4-to-webm",
    "gif-to-mp4",
    "compress-video",
  ],
  updatedAt: "2026-09-30",
  icon: "repeat",
  illustration: "remux",
  content: {
    en: {
      title: "Convert video",
      subtitle:
        "Change a video's format: MP4, MOV, WebM, MKV, AVI, WMV, FLV, MPEG and more, in your browser.",
      metaTitle: "Video converter online, free, no upload",
      metaDescription:
        "Convert video between MP4, MOV, WebM, MKV, AVI, WMV, FLV, MPEG and more in your browser. Lossless when the formats allow. Free, no account.",
      what: "This is the general converter behind every format-pair page on the site. Drop any video, and it reads the container and codecs, lets you pick a target format, and tells you before you start whether the result will be a lossless copy or a re-encode. A format is just a box; when the codecs inside fit the new box, the file is rewritten with nothing lost. When they do not, the video is re-encoded on your device with the hardware encoder where available.",
      steps: [
        "Drop a video file onto the page.",
        "Check the detected container and codecs at the top of the panel.",
        "Choose the output format by what it is for. Each choice says, before you pick it, whether this file would be copied or re-encoded.",
        "Press Convert and download the result.",
      ],
      goodToKnow: [
        "Lossless conversions are possible when the video codec is accepted by both containers: H.264, HEVC and AV1 move freely between MP4, MOV and MKV; VP9 and AV1 move between WebM and MKV. In those cases the output is bit-identical video in a different wrapper, and the conversion is limited only by how fast your device reads and writes the file.",
        "Re-encoding is required when the codec does not fit: anything going into WebM (which only takes VP8, VP9 and AV1), ProRes going anywhere but MOV, and PCM audio going into MP4. The tool re-encodes only the stream that needs it. Video becomes H.264 for MP4, MOV and MKV, or VP9 for WebM; audio becomes AAC or Opus.",
        "If you convert often between two specific formats, the dedicated pair pages such as [MOV to MP4](/mov-to-mp4) and [MKV to MP4](/mkv-to-mp4) explain the quirks of that pair, for example why iPhone HEVC needs a second step to play on Windows, or why OBS recordings are MKV in the first place.",
        `Two engines sit behind this page. MP4, MOV, WebM and MKV are handled by the browser's own media pipeline, which streams the file and copies streams losslessly whenever it can. AVI, WMV, FLV, MPEG, MPEG-TS, 3GP, OGV and VOB go through a bundled build of ffmpeg that loads on first use (about ${ffmpegDownloadSize()}, cached by the browser) and usually re-encodes (streams can be copied into MPEG-TS and 3GP); because it holds the whole file in memory, it suits files up to roughly 2 GB. MXF, RealMedia, DV and SWF can be read but not written; convert them to MP4.`,
        "Every audio track the target container can hold is carried over. Text subtitle tracks survive only in MKV; the other containers drop them.",
      ],
      faq: [
        {
          q: "Which conversions are lossless?",
          a: "Any where the source codec is accepted by the target container. The tool checks this for your file and says so before you convert. As a rule: MP4, MOV and MKV exchange H.264, HEVC and AV1 freely; WebM requires VP8, VP9 or AV1.",
        },
        {
          q: "Can I convert to AVI or WMV?",
          a: "Yes. Legacy containers go through the bundled ffmpeg engine, which loads once and re-encodes on your device. MP4 is the modern replacement and plays on more devices than either, so prefer it unless a specific program demands AVI or WMV.",
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
          a: "MP4, MOV, WebM and MKV are streamed rather than loaded into memory, so multi-gigabyte files work on a desktop and free storage is the limit on phones. Formats that go through the ffmpeg engine are held in memory and suit files up to roughly 2 GB.",
        },
      ],
    },
  },
};
