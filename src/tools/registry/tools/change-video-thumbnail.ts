import type { ToolInput } from "../schema";

export const changeVideoThumbnail: ToolInput = {
  slug: "change-video-thumbnail",
  engine: "cover",
  category: "info",
  phase: "p3",
  backends: ["canvas"],
  accepts: ["video"],
  produces: "video",
  presetOptions: { task: "cover", coverInQuickTime: true },
  keywords: [
    "change video thumbnail",
    "set mp4 thumbnail",
    "change thumbnail of video file",
    "video cover frame",
    "set poster frame mp4",
  ],
  aliases: ["video cover", "poster frame", "file thumbnail", "mp4 cover", "finder thumbnail"],
  related: [
    "video-thumbnail-maker",
    "edit-video-metadata",
    "sharpest-frame-from-video",
    "extract-frame-from-video",
    "change-video-creation-date",
    "video-info",
  ],
  updatedAt: "2026-11-18",
  icon: "image-up",
  illustration: "thumbnail",
  content: {
    en: {
      title: "Change a video file's thumbnail",
      subtitle: "Choose the frame an MP4 or MOV shows as its thumbnail. Nothing is re-encoded.",
      metaTitle: "Change a video file's thumbnail, free",
      metaDescription:
        "Store any frame of an MP4 or MOV in the file as its thumbnail (cover art), shown in macOS Quick Look and Finder. Runs in your browser, no re-encoding.",
      action: "Set thumbnail",
      what: "File browsers usually show a video as its first frame, which is often black or a blurred blink. This tool stores a frame you choose inside the file as its cover picture, the same place music files keep album art, so programs that read it show that frame instead. You scrub to the frame on a filmstrip under the video; the picture and sound are copied byte for byte and only the file's header changes.",
      steps: [
        "Drop one MP4 or MOV.",
        "Drag along the filmstrip, or use the arrow keys, until the video shows the frame you want.",
        "Press Set thumbnail and download the copy.",
      ],
      goodToKnow: [
        "Where it shows: we checked the macOS Quick Look thumbnailer, which also draws Finder's icons. A test MP4 whose first frame is blue showed blue; with a red cover stored by this page it showed red. The same held for a portrait MP4 and for a MOV. Windows Explorer, phone galleries and media players were not tested, and some of them ignore covers in video files and keep showing the first frame.",
        "The cover is a JPEG of the chosen frame at the video's own size, up to 1920 pixels on the long side, stored as cover art in the file's item list. Nothing else changes: titles, dates, location and every frame and sound sample stay as they were. A file that already has a cover gets the new one in its place.",
        "This changes what a file browser shows for the file on your own computer. Video sites and social apps choose their thumbnails themselves, or let you upload one in their editor; for that, [make a thumbnail image](/video-thumbnail-maker) at the shape they ask for and upload it there.",
        "MKV and WebM keep a cover, if at all, as an attachment Finder does not read, so the page offers to convert them to MP4 first. A MOV written by FFmpeg with its tags as numbered metadata keys has no place a cover can go without rebuilding those tags; the page says so rather than writing a file that some players would misread.",
        "To choose the frame by sharpness rather than by eye, [find the sharpest frame](/sharpest-frame-from-video) around the moment first, note its time, then come back and scrub to it.",
      ],
      faq: [
        {
          q: "Will Windows show the new thumbnail?",
          a: "We have not been able to check Windows Explorer. macOS Finder and Quick Look show it; other apps may keep showing the first frame.",
        },
        {
          q: "Does it lower the video's quality?",
          a: "No. The file gains a picture in its header; the video and sound streams are copied unchanged.",
        },
        {
          q: "Will YouTube or Instagram use this thumbnail?",
          a: "Not from the file. Those sites choose a frame or take an image you upload in their own thumbnail setting; make one with [the thumbnail maker](/video-thumbnail-maker) and upload it there.",
        },
        {
          q: "Can I use a picture that is not in the video?",
          a: "Yes, on [edit metadata](/edit-video-metadata), which takes any JPEG or PNG as the cover of an MP4.",
        },
        {
          q: "Is my video uploaded?",
          a: "No. The frame is taken and the file rewritten in your browser; nothing leaves your device.",
        },
      ],
    },
  },
};
