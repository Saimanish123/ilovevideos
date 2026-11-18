import type { CategoryDefinition } from "./schema";

export const categories: CategoryDefinition[] = [
  {
    id: "compress",
    title: "Compress",
    description: "Make videos smaller without visible quality loss.",
    metaDescription:
      "Make videos smaller in your browser: presets, a target size in MB, or a platform's limit. Nothing is uploaded, no account, no watermark. Free.",
    order: 1,
  },
  {
    id: "convert",
    title: "Convert",
    hubTitle: "Video and audio converters",
    description: "Change video and audio formats, copying the streams whenever they fit.",
    metaDescription:
      "Convert video, audio and subtitle files between formats in your browser, copying the streams whenever they fit. No upload, no account. Free.",
    order: 2,
    updatedAt: "2026-10-08",
  },
  {
    id: "edit",
    title: "Edit",
    description:
      "Cut, join, reframe, restyle and repair video: trim, crop, black bars, colour, sharpening, grain, shake, text, timers, progress bars, intros, blur, green screen, freeze frames, zoom and pan, picture in picture, side by side and Shorts clips.",
    metaDescription:
      "Trim, merge, crop and fade videos, blur faces, add text, timers or intros, steady shaky clips, sharpen, reduce grain, remove black bars. No upload.",
    order: 3,
    updatedAt: "2026-11-18",
  },
  {
    id: "audio",
    title: "Audio",
    hubTitle: "Audio tools",
    description:
      "Join, trim, change the volume, loudness, speed and pitch of audio, make ringtones, read a song's key and BPM, and fix, add, replace or remove the sound of a video.",
    metaDescription:
      "Join, trim and normalise audio, shift its pitch, make a ringtone, find key and BPM, or edit a video's sound, in your browser. No upload. Free.",
    order: 4,
    updatedAt: "2026-11-18",
  },
  {
    id: "captions",
    title: "Captions",
    hubTitle: "Subtitle and caption tools",
    description:
      "Add subtitles to a video as a track or burned in with a styled look, and convert, shift and repair subtitle files.",
    metaDescription:
      "Add subtitles to a video as a track or burned in with a styled look, and convert, shift and repair SRT, WebVTT, ASS and SBV files. No upload. Free.",
    order: 5,
  },
  {
    id: "gif",
    title: "GIF and stills",
    hubTitle: "GIF and image tools",
    description:
      "Turn video into GIFs, animated WebP, APNG and AVIF, sharp stills, thumbnails, contact sheets and image sequences, and GIFs or photos into video.",
    metaDescription:
      "Turn a video into a GIF, animated WebP, AVIF or APNG, a sharp still or a thumbnail, or GIFs and photos into an MP4, in your browser. No upload.",
    order: 6,
    updatedAt: "2026-10-08",
  },
  {
    id: "image",
    title: "Frames",
    hubTitle: "Frame tools",
    description: "Save a frame of a video as an image.",
    order: 7,
  },
  {
    id: "info",
    title: "Inspect",
    description:
      "See what is inside a file, edit its tags, thumbnail and recording date, remove what should not be there, and repair a cut-off file.",
    metaDescription:
      "See what a video contains, edit its tags, thumbnail and recording date, remove location tags or repair a cut-off file, in your browser. No upload.",
    order: 8,
    updatedAt: "2026-10-08",
  },
  {
    id: "record",
    title: "Record",
    hubTitle: "Recorders",
    description: "Record your screen, camera or voice.",
    metaDescription:
      "Record your screen, webcam or voice in the browser, saved as MP4, M4A, WAV or Opus on your device. No upload, no account, no watermark. Free.",
    order: 9,
    updatedAt: "2026-11-18",
  },
  {
    id: "platform",
    title: "For platforms",
    hubTitle: "Video tools for platforms",
    // Name only platforms that have a page here.
    description:
      "Presets for Discord, WhatsApp, email, TikTok, Instagram Reels, YouTube and Facebook, with each platform's dated limits.",
    metaDescription:
      "Compress or resize videos for Discord, WhatsApp, email, TikTok, Reels, YouTube and Facebook, from each platform's dated limits. Free.",
    order: 10,
  },
];
