import { ffmpegDownloadSize } from "@/tools/engines/ffmpeg/size";
import type { ToolInput } from "../schema";

export const extractAudioFromVideo: ToolInput = {
  slug: "extract-audio-from-video",
  engine: "video-to-audio",
  category: "audio",
  phase: "p1",
  backends: ["webcodecs", "ffmpeg-wasm"],
  accepts: ["video"],
  produces: "audio",
  presetOptions: {},
  keywords: [
    "extract audio from video",
    "video to audio",
    "video to mp3",
    "get audio from video",
    "save sound from video",
  ],
  aliases: ["audio", "sound", "rip audio", "video to wav", "video to m4a"],
  related: [
    "mp4-to-mp3",
    "remove-audio-from-video",
    "replace-audio-in-video",
    "add-audio-to-video",
    "trim-video",
    "compress-video",
  ],
  updatedAt: "2026-09-30",
  icon: "audio-lines",
  content: {
    en: {
      title: "Extract audio from video",
      subtitle:
        "Save the sound of a video as MP3, M4A, WAV, FLAC, OGG, Opus or AIFF, in your browser. Not uploaded.",
      metaTitle: "Extract audio from video, free, no upload",
      metaDescription:
        "Pull the audio out of any video as MP3, M4A, WAV, FLAC, OGG, Opus or AIFF. Lossless copy when the codec allows, bitrate presets otherwise. In your browser.",
      what: "This tool separates the sound from a video and writes it as a standalone audio file. It reads the container, shows which audio codec the video carries, and tells you before you start whether that track will be copied bit for bit or decoded and re-encoded. You can keep the whole track or drag two handles on a timeline to save only a part, and listen to the result on the page before you download it.",
      steps: [
        "Drop a video onto the page. Its sound appears as a waveform you can play, and the file card shows the audio codec inside it.",
        "Pick the audio format by what it is for. Each choice says whether the track is copied or re-encoded, and the line under the options gives the size to expect.",
        "For lossy formats choose a bitrate; for a section of the video tick the range box and drag the handles on the timeline.",
        "Press Extract audio, play the result on the waveform, then download.",
      ],
      goodToKnow: [
        "Most phone, camera and screen recordings store their sound as AAC inside MP4 or MOV. Choosing M4A moves that AAC track into an audio-only file without decoding it, so the result is byte-identical to what the camera recorded, and with nothing to encode it is limited only by how fast your device reads and writes the file. Choosing MP3 forces a decode and a second lossy encode, which costs a little quality and a lot more time. If your player accepts M4A, and everything from iPhones to Windows Media Player does, it is the better default.",
        "A bitrate preset only applies when the audio is re-encoded to a lossy format. 128 kbps is plenty for speech and podcasts, 192 kbps is transparent for most music at normal listening levels, and 320 kbps is the ceiling MP3 allows. The size line under the options is computed from bitrate and duration, so a 10 minute clip at 192 kbps lands near 14 MB regardless of how large the video was.",
        "WAV and FLAC are lossless from this point on, not retroactively. They store what the decoder produced from the video's AAC, Opus or MP3 track; they cannot restore detail that the original encoder discarded. Choose them when the audio goes into an editor or a transcription pipeline that wants PCM, not to improve quality. WAV is 16-bit PCM at the source sample rate (24-bit when the video carries 24-bit PCM, as some cameras record), about 11 MB per stereo minute at 48 kHz; FLAC is typically 50 to 60 percent of that.",
        `MP3, AAC, FLAC, OGG (Vorbis) and AIFF encodes run through the ffmpeg engine, which loads once (about ${ffmpegDownloadSize()}) and holds the whole video in memory, so it suits files up to roughly 2 GB. Copies, and WAV and Opus encodes, run on the streaming engine and handle any size the browser can read. OGG means Vorbis here, the kind game engines expect; choose Opus for the smaller, newer codec in an .opus file. The ffmpeg command shown after each run is the exact equivalent, with libmp3lame for MP3.`,
        "Only the first audio track is extracted. Videos with several language tracks or a commentary track keep only the default one; choosing another track is not possible yet. When the video carries title, artist or album tags, the page shows them and copies them into the audio file.",
        "To cut a clip instead of extracting its sound, use [trim video](/trim-video); to keep the picture and drop the sound, use [remove audio from video](/remove-audio-from-video). If you only ever need MP3 from an MP4, the [MP4 to MP3](/mp4-to-mp3) page locks that choice. This page does the opposite of muting: the picture is discarded and only the sound is written.",
      ],
      faq: [
        {
          q: "Which format should I choose?",
          a: "M4A when the video has AAC audio and your player supports it: it is a lossless copy. MP3 when it has to play on an old device or be uploaded somewhere that only takes MP3. WAV or FLAC when the audio goes into an editor.",
        },
        {
          q: "Does extracting audio lose quality?",
          a: "Copying into M4A or Opus loses nothing. Re-encoding to MP3, OGG or Opus is a second lossy step; at 192 kbps or higher the difference is inaudible for most people. WAV and FLAC keep everything the decoder produced.",
        },
        {
          q: "Can I extract only part of the video?",
          a: "Yes. Tick the range box, then drag the two handles on the timeline under the preview or type exact start and end times. Only that section is written.",
        },
        {
          q: "Why is the estimated size the same for a small and a large video?",
          a: "Because the audio size depends on bitrate and duration, not on the picture. A 4K video and a 480p video of the same length with the same audio track produce the same audio file.",
        },
        {
          q: "Is the video uploaded anywhere?",
          a: "No. The file is read and processed by your browser. The only download is the converter code itself, and only the first time a format needs it.",
        },
        {
          q: "What happens to the video's title and artist tags?",
          a: "When the file has them, the panel names the title and artist it found and copies them into the audio file: ID3 tags for MP3, iTunes-style atoms for M4A, Vorbis comments for FLAC, OGG and Opus. Files without tags stay without tags.",
        },
      ],
    },
  },
};
