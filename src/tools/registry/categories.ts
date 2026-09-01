import type { CategoryDefinition } from "./schema";

export const categories: CategoryDefinition[] = [
  {
    id: "compress",
    title: "Compress",
    description: "Make videos smaller without visible quality loss.",
    order: 1,
  },
  { id: "convert", title: "Convert", description: "Change video and audio formats.", order: 2 },
  { id: "edit", title: "Edit", description: "Trim, merge, crop, rotate, speed up.", order: 3 },
  {
    id: "audio",
    title: "Audio",
    description: "Extract, replace, mute and adjust sound.",
    order: 4,
  },
  {
    id: "captions",
    title: "Captions",
    description: "Add, generate and convert subtitles.",
    order: 5,
  },
  { id: "gif", title: "GIF", description: "Make GIFs from video and video from GIFs.", order: 6 },
  { id: "image", title: "Frames", description: "Frames, thumbnails and slideshows.", order: 7 },
  {
    id: "info",
    title: "Inspect",
    description: "See what is inside a file. Remove what should not be.",
    order: 8,
  },
  { id: "record", title: "Record", description: "Record your screen, camera or voice.", order: 9 },
  {
    id: "platform",
    title: "For platforms",
    description: "Presets for Discord, WhatsApp, TikTok and more.",
    order: 10,
  },
];
