import type { ToolInput } from "../schema";

export const splitVideo: ToolInput = {
  slug: "split-video",
  engine: "split",
  category: "edit",
  phase: "p1",
  backends: ["webcodecs"],
  accepts: ["video"],
  produces: "video",
  keywords: [
    "split video",
    "split video into parts",
    "cut video into parts",
    "video splitter",
    "split video into equal parts",
    "split video every 30 seconds",
  ],
  aliases: ["splitter", "cut into parts", "chop", "segment"],
  related: [
    "merge-videos",
    "trim-video",
    "compress-video",
    "extract-frame-from-video",
    "cut-video-into-shorts",
  ],
  updatedAt: "2026-09-30",
  icon: "split",
  content: {
    en: {
      title: "Split video",
      subtitle: "Cut one video into several separate files.",
      metaTitle: "Split video into parts online, free, no upload",
      metaDescription:
        "Cut a video into equal parts, fixed-length clips or at your own markers. Lossless by default. Runs in your browser; files never leave your device.",
      action: "Split",
      what: "This tool cuts one video into several shorter files. Choose how many equal parts you want, how long each part should be, or place the cuts yourself on the timeline. By default every part is a straight copy of the original streams, so nothing is re-encoded and no quality is lost; the cuts move to the nearest key frame to make that possible.",
      steps: [
        "Drop a video onto the page or choose one from your device.",
        "Pick equal parts, a part length, or Custom and place cuts with Split here or by dragging a marker.",
        "Check the parts list: every part shows its start, end and length, and you can give it a file name.",
        "Press Split.",
        "Play any part in the preview, download the parts one by one, or download all of them as one ZIP.",
      ],
      goodToKnow: [
        "A video file can only start cleanly on a key frame, a picture stored in full that the frames after it are built on. Cameras and apps usually place one every second or every few seconds. Without re-encoding, a part has to begin on one, so each cut moves to the nearest key frame, and the timeline draws a small tick for every key frame in your file. The markers show where the cuts will really land, not where you first dropped them.",
        "Because each part starts exactly where the previous one ends, the parts add up to the whole video with no frame missing and none repeated. With equal parts, the lengths can differ by up to the distance between two key frames; the summary line says so when snapping changes how many parts you get.",
        "Frame-accurate cuts re-encode the video so every part starts on the exact frame you chose. That is slower and costs a small amount of quality, so leave it off unless the exact frame matters, for example for a clip that has to begin on a clap.",
        "Each part keeps the container and codecs of the original: an MP4 splits into MP4 parts, a MOV into MOV parts. Parts are named after the original with a two-digit number, so they sort in order in any folder, or with the names you type in the parts list.",
        "The parts stay in your browser's memory until you download them. Together they are about the size of the original, so very long recordings need a computer with enough free memory; a phone may run out before a desktop does. The ZIP is built from the parts already in memory without compressing them again, since video does not shrink in a ZIP.",
        "To keep one stretch and throw the rest away, [trim video](/trim-video) is quicker. To put parts back together or join them with other clips, use [merge videos](/merge-videos). If a part is still too large to send, [compress video](/compress-video) reduces it. To get vertical clips cut at pauses for Shorts, use [cut a video into Shorts](/cut-video-into-shorts).",
      ],
      faq: [
        {
          q: "Does splitting a video reduce its quality?",
          a: "Not by default. Every part is a copy of the original video and audio data, cut at key frames. Only frame-accurate mode re-encodes, and it says so before you start.",
        },
        {
          q: "Why did my cut move a little from where I put it?",
          a: "Because a part can only start on a key frame without re-encoding, and the nearest one is a little earlier or later. Turn on frame-accurate cuts if the exact frame matters.",
        },
        {
          q: "How do I split a video into 30-second clips?",
          a: "Choose By length and pick 30 s. Every part is 30 seconds long, give or take the distance to a key frame, and the last part takes whatever is left.",
        },
        {
          q: "I asked for ten parts and got fewer. Why?",
          a: "Some cuts landed on the same key frame, which happens when a short video has few key frames. Turn on frame-accurate cuts to get exactly the number you asked for.",
        },
        {
          q: "Can I download all the parts at once?",
          a: "Yes. Download all puts every part into one ZIP file. Each part also has its own Download button.",
        },
        {
          q: "Is my video uploaded?",
          a: "No. Reading, cutting and writing the parts all happen in your browser, and the ZIP is assembled there too. Nothing is sent to a server.",
        },
      ],
    },
  },
};
