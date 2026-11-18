import type { ToolInput } from "../schema";

export const optimizeVideoForWeb: ToolInput = {
  slug: "optimize-video-for-web",
  engine: "faststart",
  category: "convert",
  phase: "p2",
  backends: ["canvas"],
  accepts: ["video"],
  produces: "video",
  keywords: [
    "optimize video for web",
    "mp4 faststart",
    "move moov atom to beginning",
    "web optimized mp4",
    "mp4 streaming optimization",
    "qt-faststart online",
  ],
  aliases: ["faststart", "moov atom", "progressive download", "streaming", "web optimized"],
  related: [
    "video-info",
    "compress-video",
    "mov-to-mp4",
    "video-converter",
    "hevc-to-h264",
    "repair-video",
  ],
  updatedAt: "2026-10-08",
  icon: "globe",
  illustration: "faststart",
  content: {
    en: {
      title: "Optimize video for the web",
      subtitle:
        "Move an MP4 or MOV's index to the front so it starts playing while it downloads. Nothing re-encoded.",
      metaTitle: "Optimize MP4 for web (fast start), free",
      metaDescription:
        "Move the moov atom of an MP4 or MOV to the front so it streams as it downloads. Every packet stays as it is. Free, no upload, runs on your device.",
      action: "Optimise",
      what: "An MP4 or MOV file has two parts: the media itself and an index (the moov box) that says where every frame is. Many cameras, phones and editors write the index last, after the media. This tool reads the file's layout, shows where the index sits, and if it is at the end, writes a copy with the index in front. The media bytes are not decoded or changed; only the index's pointers are updated for their new position.",
      steps: [
        "Drop an MP4, M4V or MOV file; the panel reads its layout and shows where the index is.",
        "If the index is at the end, the panel gives its size and how much media stands in front of it.",
        "Press Optimise; the copy is ready at once, because only the index is rewritten.",
        "Download it and upload it to your site or server in place of the original.",
      ],
      goodToKnow: [
        "Why it matters: a player cannot show a frame until it has the index. With the index at the end, a browser that can request byte ranges has to fetch the end of the file first, an extra request before playback starts, and a server or player that cannot serve ranges makes it download the whole file. With the index in front, playback can begin as soon as the first part arrives.",
        "This is what ffmpeg's -movflags +faststart and the old qt-faststart program do, and what HandBrake calls Web Optimized. The copy has exactly the same packets in the same order: every video, sound, subtitle and chapter track, every tag and the capture date survive, and the size stays the same, except when a file over 4 GB needs wider offsets: then the index grows by 4 bytes per index entry, usually well under a megabyte.",
        "It is fast because nothing is decoded. The tool reads a few box headers and the index, which is small next to the media, and builds the output from slices of your original file, so even a multi-gigabyte recording is ready in moments and never loaded whole into memory.",
        "Files that already have the index in front are left alone, and the page says so. Fragmented MP4, as written by some screen recorders and streaming tools, carries a small index per fragment and already streams; it is left as it is too. MP4s written by [compress video](/compress-video) and the [video converter](/video-converter) already have their index in front.",
        "WebM and MKV keep their index differently and are not changed here. For a WebM that has to stream on a web page, converting it to MP4 gives a file with the index at the front. To see a file's container and codecs before uploading, use [video info](/video-info).",
      ],
      faq: [
        {
          q: "Does this reduce quality or change the file size?",
          a: "No. Not a single frame is decoded or re-encoded, and the file stays the same size, give or take the index; only the index moves.",
        },
        {
          q: "What is the moov atom?",
          a: "The box in an MP4 or MOV that holds the index: where each frame and sound packet is, how long it plays, and the track settings. Players need it before they can start.",
        },
        {
          q: "How do I know if my video needs this?",
          a: "Drop it here: the panel reads the layout in a moment and says whether the index is already at the front.",
        },
        {
          q: "Will it make my video load faster on my website?",
          a: "Playback starts sooner, especially on servers without range requests. The total download is the same size; to make it smaller, compress it as well.",
        },
        {
          q: "Does it work with MOV files from an iPhone or a camera?",
          a: "Yes. MOV uses the same box structure as MP4, so the same rewrite applies, and the file stays a MOV.",
        },
        {
          q: "Is my video uploaded?",
          a: "No. The index is read and rewritten in your browser, and the file never leaves your device.",
        },
      ],
    },
  },
};
