import type { ToolInput } from "../schema";

export const removeMetadataFromVideo: ToolInput = {
  slug: "remove-metadata-from-video",
  engine: "strip-metadata",
  category: "info",
  phase: "p1",
  backends: ["webcodecs"],
  accepts: ["video"],
  produces: "video",
  keywords: [
    "remove metadata from video",
    "strip video metadata",
    "remove gps from video",
    "remove location from mp4",
    "video metadata remover",
  ],
  aliases: ["strip metadata", "scrub", "clean", "gps", "location", "privacy"],
  related: [
    "blur-video",
    "remove-audio-from-video",
    "compress-video",
    "trim-video",
    "edit-video-metadata",
    "change-video-creation-date",
  ],
  updatedAt: "2026-09-30",
  icon: "shield-off",
  content: {
    en: {
      title: "Remove metadata from video",
      subtitle: "See the hidden details in a video and remove them.",
      metaTitle: "Remove metadata from video, free, no upload",
      metaDescription:
        "Strip GPS location, creation date, device and title tags from MP4, MOV, WebM and MKV. Lists what is found; streams are copied losslessly on your device.",
      what: "This tool reads the descriptive tags stored in a video's container, lists them so you can see what the file gives away, and writes a copy that carries none of them. The video and audio streams themselves are copied bit for bit, so the picture and the sound are identical to the original.",
      steps: [
        "Drop a video onto the page or choose one from your device.",
        "Read the list that takes the preview's place: location first, with its coordinates, then device, dates, software and other tags.",
        "Press Remove metadata.",
        "Check what is left in the clean copy, which the page reads back after the run, then download it and share that one instead of the original.",
      ],
      goodToKnow: [
        "Phones write more into a video than most people expect. An iPhone MOV or MP4 usually carries the GPS position where recording started (the `©xyz` atom or the `com.apple.quicktime.location.ISO6709` key), the creation date and time, the device make and model, the iOS version and sometimes a title. Android phones write a similar set. None of it is needed to play the file, and all of it travels with the clip when you send it.",
        "Video containers do not use EXIF; that is a JPEG and camera-raw standard. MP4 and MOV keep their tags in the `udta` and `meta`/`ilst` atoms of the file header, and WebM and MKV keep them as Matroska tags. This page removes those container tags. It does not alter what is in the picture itself: a street sign, a face or a timestamp burned into the frame stays visible, and stream-level facts such as codec, resolution, frame rate and rotation stay because a player cannot work without them.",
        "Removing tags is lossless and does not shrink the file in any noticeable way; tags are a few hundred bytes. If you also need the video smaller, run [compress video](/compress-video) afterwards; its output carries no tags either, since the encoder writes a fresh header.",
        "A file that shows no tags is still worth running through this page when in doubt: the output is written from scratch with an empty tag set, so anything the reader did not recognise is dropped too. The panel says so plainly instead of blocking the button. One field always stays in MP4 and MOV: the recording time in the file header, which the copy fills with the moment it was written, so it no longer tells when the video was filmed.",
        "Messaging apps behave differently. WhatsApp and Signal re-encode videos and drop most tags on the way; email, cloud drives, AirDrop and direct file transfers send the file untouched, tags included. When the recipient gets the original bytes, scrub first.",
      ],
      faq: [
        {
          q: "Does this remove the location from my video?",
          a: "Yes, when the location is stored as a container tag, which is how phones store it. The panel shows Location (GPS) in the list when one is found.",
        },
        {
          q: "Is the video quality affected?",
          a: "No. Video and audio streams are copied without decoding. Only the header is rewritten.",
        },
        {
          q: "Why does my file show no tags?",
          a: "Some recorders and most editors write none, and messaging apps strip them. The tool still writes a clean copy so you can be sure.",
        },
        {
          q: "Will the rotation of a phone video be kept?",
          a: "Yes. Rotation lives in the track header, not in the descriptive tags, and is copied with the stream so the clip still plays the right way up.",
        },
        {
          q: "Is EXIF removed too?",
          a: "Videos have no EXIF; that standard belongs to photos. The equivalent for video is the container tag set this page removes.",
        },
        {
          q: "Is the file uploaded to check the tags?",
          a: "No. Reading the tags and writing the copy both happen in your browser. Nothing leaves your device.",
        },
      ],
    },
  },
};
