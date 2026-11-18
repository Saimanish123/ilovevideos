import type { ToolInput } from "../schema";

export const videoInfo: ToolInput = {
  slug: "video-info",
  engine: "inspect",
  category: "info",
  phase: "p1",
  backends: ["webcodecs"],
  accepts: ["video", "audio"],
  produces: "text",
  keywords: [
    "video info",
    "check video codec",
    "video metadata viewer",
    "what codec is my video",
    "video bitrate checker",
    "mediainfo online",
  ],
  aliases: ["codec", "metadata", "mediainfo", "inspect", "bitrate", "details", "properties"],
  related: [
    "video-converter",
    "repair-video",
    "change-video-creation-date",
    "extract-audio-from-video",
    "remove-metadata-from-video",
    "edit-video-metadata",
  ],
  updatedAt: "2026-09-30",
  icon: "info",
  illustration: "inspect",
  content: {
    en: {
      title: "Check video info",
      subtitle:
        "See the container, codecs, resolution, frame rate, bitrates and tags of a file, in your browser.",
      metaTitle: "Video info: codec, bitrate, resolution",
      metaDescription:
        "See what is inside a video or audio file: container, codecs, resolution, frame rate, bitrate, channels and tags. Read in your browser, no upload.",
      what: "This tool reads the structure of a video or audio file and lists what it finds: the container, the duration and size, the video codec with its exact codec string, resolution, frame rate and bitrate, every audio track with its codec, channels and sample rate, and any title, artist or date tags. Nothing is converted and nothing is uploaded; the file is parsed on your device and the report appears as soon as it has been read. A Copy as text button gives you the whole report to paste into a support ticket, a forum post or a note.",
      steps: [
        "Drop a video or audio file onto the page or choose one from your device.",
        "Read the overview at the top of the report in plain words, then the file, video, audio and tags in detail.",
        "Follow a suggested next step when the facts call for one, such as a codec that does not play everywhere, or press Copy as text to put the whole report on your clipboard.",
        "Remove the file to check another one.",
      ],
      goodToKnow: [
        "The container and the codec are different things, and most playback problems come from mixing them up. The container is the file format you see in the extension: MP4, MOV, MKV, WebM. It is a box that holds one or more streams and describes how they are interleaved. The codec is how each stream is compressed: H.264, HEVC, VP9 or AV1 for video, AAC, MP3, Opus or FLAC for audio. An MP4 can hold H.264 or HEVC; a player that opens MP4 files can still refuse one because it lacks the HEVC codec. This page shows both so you know which one is the problem. A file that will not open at all, or stops early, may be cut off; [repair video](/repair-video) says what is missing.",
        "The codec string, for example avc1.640028, is the exact form browsers and streaming servers use to decide whether they can play a stream. For H.264 it encodes the profile and level: 42 is Baseline, 4d is Main, 64 is High, and the last two hex digits are the level, so 28 means level 4.0. If a website or device rejects your file, this string is usually what it is checking. The [video converter](/video-converter) re-encodes to H.264 when a codec is the obstacle.",
        "Frame rate and bitrate here are measured from the file's own packets rather than copied from a header, so a variable frame rate recording from a phone shows its real average, and the bitrate reflects the whole file. The overall bitrate is simply the size divided by the duration; the video and audio bitrates are measured per stream. If the numbers seem high for the picture quality, the file was probably encoded with a generous bitrate and [compress video](/compress-video) can bring it down without a visible change.",
        "Rotation is reported when a file carries a rotation flag, which is how phones store portrait video: the frames are landscape and the flag tells players to turn them. Some players and web pages ignore the flag, which is why a clip that looks right on your phone can appear sideways elsewhere. Seeing 90° or 270° here explains that.",
        "Audio tracks are listed one by one with channels, sample rate and bitrate. Mono is one channel, stereo two, 5.1 six. A sample rate of 48 kHz is the video standard; 44.1 kHz is the CD and music standard. Both play everywhere, but some editing software resamples one to match the other, and knowing which you have saves guessing.",
        "Tags are the descriptive fields the container carries, such as title, artist, album, date or a comment. Cameras and editing software write them; screen recorders often leave them empty. The raw tag keys line lists every tag name the file contains, including ones this page does not display, so you can tell whether a file carries more metadata than its title suggests.",
      ],
      faq: [
        {
          q: "Which file types can it read?",
          a: "MP4, M4V, MOV, MKV, WebM, MP3, WAV, OGG and FLAC are read directly. AVI, WMV, FLV, MPEG, TS, 3GP and other older containers are read with a bundled ffmpeg engine that loads on first use, which shows codecs and dimensions but not codec strings.",
        },
        {
          q: "Does it show the H.264 profile and level?",
          a: "Yes, as the codec string, for example avc1.64001f. The middle two hex digits are the profile (42 Baseline, 4d Main, 64 High) and the last two are the level in hex, so 1f is level 3.1 and 28 is level 4.0.",
        },
        {
          q: "Why is the frame rate not a round number?",
          a: "Because it is measured from the file. Many recordings are 29.97 fps rather than 30, and phone footage with a variable frame rate shows the average of the frames actually stored.",
        },
        {
          q: "Can I use this to check a file before uploading it somewhere?",
          a: "Yes. Platforms usually publish requirements as a codec, a resolution, a frame rate and a bitrate or size cap; the report lists each of those. Copy it as text if you need to ask someone why an upload was rejected.",
        },
        {
          q: "Is the file uploaded to read it?",
          a: "No. The file is parsed in your browser. Only the small parts of the file that hold the structure are read, so even a very large file is reported quickly, and nothing leaves your device.",
        },
        {
          q: "Can I edit or remove the tags here?",
          a: "Not on this page; it only reads. Converting the file with the [video converter](/video-converter) rewrites the container and carries the descriptive tags over.",
        },
      ],
    },
  },
};
