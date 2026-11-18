import { ffmpegDownloadSize } from "@/tools/engines/ffmpeg/size";
import type { ToolInput } from "../schema";

export const mp4ToMp3: ToolInput = {
  slug: "mp4-to-mp3",
  engine: "video-to-audio",
  category: "audio",
  phase: "p1",
  backends: ["ffmpeg-wasm", "webcodecs"],
  accepts: ["video"],
  produces: "audio",
  presetOptions: { from: "mp4", to: "mp3", lockTarget: true },
  keywords: ["mp4 to mp3", "convert mp4 to mp3", "mp4 to mp3 converter", "mp4 audio to mp3"],
  aliases: ["mp3", "mp4 audio"],
  related: [
    "extract-audio-from-video",
    "remove-audio-from-video",
    "replace-audio-in-video",
    "trim-video",
    "mov-to-mp4",
  ],
  updatedAt: "2026-09-30",
  icon: "music",
  content: {
    en: {
      title: "Convert MP4 to MP3",
      subtitle:
        "Turn the sound of an MP4 video into an MP3 file, on your device. Choose 128, 192 or 320 kbps.",
      metaTitle: "MP4 to MP3 converter online, free, no upload",
      metaDescription:
        "Convert MP4 video to MP3 audio in your browser. Pick 128, 192 or 320 kbps, trim to a range, keep the tags. Files never leave your device. Free, no account.",
      action: "Convert",
      what: "This page takes the audio track of an MP4 and encodes it as MP3 with the LAME encoder, running inside your browser. Nearly every MP4 stores its sound as AAC, so the conversion decodes that AAC and encodes MP3 at the bitrate you choose. You can convert the whole track or a range chosen on a timeline, and play the MP3 on the page before downloading it.",
      steps: [
        "Drop an MP4 onto the page. The card confirms the audio codec, usually AAC.",
        "Choose a bitrate: 128 kbps for speech, 192 kbps for music, 320 kbps for the maximum MP3 allows.",
        "Optionally tick the range box and drag the handles to convert one section.",
        "Press Convert, play the MP3 on the waveform, and download it.",
      ],
      goodToKnow: [
        "MP3 is worth choosing for one reason: compatibility. Car stereos, older MP3 players, some voice recorders and many upload forms accept MP3 and nothing else. If your destination plays M4A, use [extract audio from video](/extract-audio-from-video) and choose M4A instead; it copies the AAC track without touching it and finishes faster with no quality cost.",
        "Because AAC to MP3 is a second lossy encode, bitrate matters more than usual. At 128 kbps MP3 is noticeably worse than the 128 kbps AAC it came from, and cymbals and applause can sound smeared. 192 kbps is where most listeners stop hearing a difference; 320 kbps costs two thirds more space than 192 kbps and is the sensible choice for music you plan to keep. The size estimate under the controls is bitrate times duration: at 192 kbps every minute is about 1.4 MB.",
        `The encoder is libmp3lame, the same one ffmpeg and most desktop converters use, compiled to WebAssembly and loaded once from this site (about ${ffmpegDownloadSize()}). Because the whole MP4 is held in memory while it runs, very large files, above roughly 2 GB, may fail on phones; trim the video first or extract on a desktop browser.`,
        "MP3 has no notion of chapters or multiple tracks. If the MP4 has several audio tracks, only the first is converted; if it has chapter markers, they are dropped. When the MP4 carries title, artist or album tags, the page shows them before you start and writes them into the MP3 as ID3v2 tags so music apps show them.",
        "The MP3 is written with a constant bitrate. Variable-bitrate MP3 saves a little space at the same quality, but a few older players show the wrong duration for VBR files, and the difference at 192 kbps is small. The ffmpeg line shown after the run reproduces the result exactly on a computer with ffmpeg installed.",
      ],
      faq: [
        {
          q: "Which bitrate should I pick for MP4 to MP3?",
          a: "192 kbps for music you will listen to casually, 320 kbps for music you want to keep, 128 kbps for lectures, podcasts and voice memos.",
        },
        {
          q: "Will the MP3 sound as good as the video?",
          a: "Almost. The MP4 audio is already compressed once, and MP3 compresses it again. At 192 kbps or higher the loss is inaudible for most people; at 128 kbps it can be heard on complex music.",
        },
        {
          q: "Can I convert just a part of the MP4?",
          a: "Yes. Tick the range box, set the two handles on the timeline or enter start and end times, and press Convert. The MP3 contains only that part, and its name carries the times.",
        },
        {
          q: "Why does the first conversion take longer?",
          a: `The MP3 encoder is downloaded once, about ${ffmpegDownloadSize()}, and cached by the browser. Every following conversion starts immediately.`,
        },
        {
          q: "Is my MP4 uploaded to a server?",
          a: "No. Decoding and encoding happen inside your browser. The file is never sent anywhere.",
        },
      ],
    },
  },
};
