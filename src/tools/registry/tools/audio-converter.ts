import { ffmpegDownloadSize } from "@/tools/engines/ffmpeg/size";
import type { ToolInput } from "../schema";

export const audioConverter: ToolInput = {
  slug: "audio-converter",
  engine: "convert-audio",
  category: "convert",
  phase: "p1",
  backends: ["webcodecs", "ffmpeg-wasm"],
  accepts: ["audio"],
  produces: "audio",
  presetOptions: {},
  keywords: [
    "audio converter",
    "convert audio online",
    "audio format converter",
    "change audio format",
    "music converter",
  ],
  aliases: ["convert audio", "sound converter", "audio format"],
  related: ["extract-audio-from-video", "add-audio-to-video"],
  updatedAt: "2026-09-30",
  icon: "audio-lines",
  illustration: "convert-audio",
  content: {
    en: {
      title: "Convert audio",
      subtitle: "Change an audio file to MP3, WAV, FLAC or another format.",
      metaTitle: "Audio converter online, free, no upload",
      metaDescription:
        "Convert audio between MP3, M4A, WAV, FLAC, OGG, Opus and AIFF in your browser. Reads WMA too. Lossless copies when the codec allows. Free, no account.",
      action: "Convert",
      what: "This is the general audio converter behind every audio pair page on the site. Drop an MP3, M4A, AAC, WAV, FLAC, OGG, Opus, WMA or AIFF file; the page draws its waveform, names the codec inside, and lets you pick one of seven output formats. Before you press Convert, the line under the options says whether the sound will be copied untouched, decoded to a lossless format, or re-encoded at a bitrate you choose, and roughly how large the result will be.",
      steps: [
        "Drop an audio file onto the page. Its waveform, length and codec appear; play it to check it is the right file.",
        "Choose the format to convert to. The hint names the source codec and what the target is good for.",
        "For MP3, M4A, OGG and Opus, choose a bitrate. Lossless targets have none.",
        "Press Convert, play the result on the page, and download it.",
      ],
      goodToKnow: [
        "Three kinds of conversion happen here, and the page tells you which one you are getting. A copy moves the encoded sound into a new container without touching it, for example raw AAC into M4A or Opus from an .ogg into .opus; it is lossless, and with nothing encoded it is limited only by how fast your device reads and writes the file. A lossless conversion decodes to exact samples and writes them again, as between WAV, FLAC and AIFF. A re-encode decodes and compresses again with a lossy codec, which always costs a little quality.",
        "Going from a lossy format to a lossless one does not bring anything back. An MP3 converted to WAV or FLAC sounds exactly like the MP3, only in a much larger file; do it when an editor or an upload form requires it, not to improve the sound. Going from one lossy format to another, such as AAC to MP3, adds a second generation of loss, so choose a bitrate at or above the source's, which the panel shows when the file reports it. The most common directions have their own pages with the target already set: [WAV to MP3](/wav-to-mp3), [M4A to MP3](/m4a-to-mp3), [FLAC to MP3](/flac-to-mp3) and [MP3 to WAV](/mp3-to-wav).",
        `WAV and Opus are written by the browser itself, streaming through the file; WAV from a FLAC or PCM source takes a slower path that keeps every sample exact. MP3, AAC, FLAC, Vorbis and AIFF need a one-time download of about ${ffmpegDownloadSize()}, which the browser keeps; the same download reads WMA and AIFF, which browsers cannot. Those formats are held in memory while they are written, so they suit files up to roughly 2 GB.`,
        "Sample rate and channels are kept wherever the target allows. Opus always runs at 48 kHz, and MP3 stops at 48 kHz, so higher-rate studio files come out at 48 kHz in those two. WAV and AIFF are written as 16-bit PCM, or 24-bit when the source has more than 16 bits, so a 24-bit FLAC stays 24-bit. MP3 and Opus hold at most two channels; 5.1 sources are mixed down to stereo.",
        "Tags such as title, artist and album are carried over between formats that support them: ID3 for MP3, iTunes atoms for M4A, Vorbis comments for FLAC, OGG and Opus. WAV has no tag format that music apps agree on. To take the sound out of a video instead, use [extract audio from video](/extract-audio-from-video); to put a sound onto a video, use [add audio to video](/add-audio-to-video).",
      ],
      faq: [
        {
          q: "Which audio format should I choose?",
          a: "MP3 when it has to play everywhere, M4A for Apple devices and a smaller file at the same quality, WAV for editors and CD burners, FLAC to archive without loss at half the size, Opus for the smallest files, OGG for game engines.",
        },
        {
          q: "Is converting audio lossless?",
          a: "Copies and conversions between WAV, FLAC and AIFF are. Anything that ends in MP3, M4A, OGG or Opus from a different codec is a lossy encode; at 192 kbps or more the loss is inaudible to most listeners.",
        },
        {
          q: "Can it convert WMA files?",
          a: "Yes, unless they are copy-protected. Browsers cannot play WMA, so there is no preview until it is converted, but the result plays on the page.",
        },
        {
          q: "Why can't I convert an MP3 to MP3?",
          a: "Because the file is already in that format; the page would only copy it. To make an MP3 smaller at a lower bitrate, convert it to M4A or Opus instead, which compress better.",
        },
        {
          q: "Is my audio uploaded to a server?",
          a: "No. Reading, decoding and encoding all run in your browser tab. The only download is the converter code itself, the first time a format needs it.",
        },
      ],
    },
  },
};
