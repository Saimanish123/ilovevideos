import type { ToolInput } from "../schema";

export const trimVideo: ToolInput = {
  slug: "trim-video",
  engine: "trim",
  category: "edit",
  phase: "p1",
  backends: ["webcodecs"],
  accepts: ["video"],
  produces: "video",
  keywords: ["trim video", "cut video", "video cutter", "cut video online", "shorten video"],
  aliases: ["cut", "cutter", "clip", "shorten"],
  related: ["remove-audio-from-video", "compress-video", "screen-recorder", "webcam-recorder"],
  updatedAt: "2026-09-30",
  icon: "scissors",
  content: {
    en: {
      title: "Trim video",
      subtitle: "Cut the start and end of a video.",
      metaTitle: "Trim video online, free, no upload",
      metaDescription:
        "Cut the beginning and end of a video in your browser. Lossless by default, frame-accurate on request. Files never leave your device. Free, no account.",
      what: "This tool removes everything before your start time and after your end time and writes a new file with only the part in between. By default it copies the video and audio streams as they are, so the output has exactly the same quality as the original; nothing is encoded, so it is limited only by how fast your device reads and writes the file. If you need the cut to land on an exact frame, switch on frame-accurate mode and the video is re-encoded around your times.",
      steps: [
        "Drop a video file onto the page or choose one from your device.",
        "Drag the two handles on the timeline, or play the preview and press I where the clip should start and O where it should end (Set start and Set end do the same on a phone).",
        "Leave frame-accurate off for a lossless cut, or turn it on for an exact one. Press Play to watch the selection on repeat.",
        "Press Trim.",
        "Watch the trimmed clip in the preview, then download it. The original is not changed.",
      ],
      goodToKnow: [
        "Video is stored as groups of frames that begin with a key frame, typically every one to five seconds. A lossless cut can only begin at a key frame, so the output may start slightly before the time you typed and include up to a few seconds of extra video. Everything after the cut point is exact. The small ticks under the filmstrip mark the key frames, and a dashed line shows where the cut will really start.",
        "Frame-accurate mode decodes and re-encodes the video so the first frame is exactly your start time. It is slower and re-encoding costs a small amount of quality, similar to saving a JPEG twice. For most purposes the lossless cut is the better default.",
        "In the lossless mode the sound is copied too and starts with the picture on that key frame, so the two stay in step; the summary under the controls and the result both say where the cut really starts. Frame-accurate mode re-encodes the sound as well and cuts it at sample precision, exactly where you asked.",
        "The output keeps the same container and codecs as the input. A trimmed MOV stays MOV, a trimmed MP4 stays MP4. Use the [video converter](/video-converter) afterwards if you also need a different format, or [compress video](/compress-video) if the clip needs to be smaller.",
        "To cut one video into several parts rather than keep one stretch, [split video](/split-video) writes every part in one go; [merge videos](/merge-videos) joins clips back together. To take the pauses out of a talking-head recording, [remove silence from video](/remove-silence-from-video) shows every cut on a timeline first, and for many short vertical clips from one long recording, [cut it into clips for Shorts](/cut-video-into-shorts).",
      ],
      faq: [
        {
          q: "Does trimming reduce the quality?",
          a: "Not in the default mode. The video and audio data are copied byte for byte; only the parts outside your range are dropped. Frame-accurate mode re-encodes and has a small quality cost.",
        },
        {
          q: "Why does my clip start a little earlier than I asked?",
          a: "Because the lossless cut begins at the nearest key frame before your start time. Turn on frame-accurate mode if the exact first frame matters.",
        },
        {
          q: "Can I trim a two-hour recording?",
          a: "Yes. Because the default mode copies data rather than re-encoding it, the time taken depends mostly on how fast your device reads and writes the file, not on how long the video is.",
        },
        {
          q: "Is the file uploaded anywhere?",
          a: "No. Reading, cutting and writing all happen in your browser. Nothing is sent over the network.",
        },
        {
          q: "Can I cut out the middle of a video?",
          a: "Not on this page. Split the video at the start and end of the unwanted part, then join the parts you keep with merge videos.",
        },
      ],
    },
  },
};
