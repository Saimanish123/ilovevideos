import type { ToolInput } from "../schema";

export const imagesToVideo: ToolInput = {
  slug: "images-to-video",
  engine: "images-to-video",
  category: "gif",
  phase: "p2",
  backends: ["webcodecs"],
  accepts: ["image"],
  produces: "video",
  keywords: [
    "images to video",
    "photos to video",
    "slideshow maker",
    "make a video from pictures",
    "jpg to mp4",
    "photo slideshow with music",
  ],
  aliases: ["slideshow", "photo video", "pictures to video", "ken burns", "photo montage"],
  related: [
    "audio-to-video",
    "video-to-image-sequence",
    "merge-videos",
    "compress-video",
    "add-audio-to-video",
  ],
  updatedAt: "2026-10-01",
  icon: "gallery-horizontal",
  content: {
    en: {
      title: "Make a video from images",
      subtitle:
        "Turn photos into a slideshow video with crossfades, a slow zoom and music, as an MP4.",
      metaTitle: "Images to video: photo slideshow maker, free",
      metaDescription:
        "Turn photos into an MP4 slideshow: set the order, the time per image, crossfades, a slow zoom and music. Runs in your browser; nothing is uploaded.",
      action: "Make slideshow",
      what: "This tool makes a video out of still pictures: each image shows for the time you set, one after another in the order you arrange, with a crossfade or a straight cut between them, an optional slow zoom, and optional music underneath. The result is an H.264 MP4 at 30 frames per second in the shape you choose, ready for a phone, a presentation or a video site.",
      steps: [
        "Drop your images onto the page, or choose them from your device; up to 200.",
        "Put them in order: drag a thumbnail, or focus it and use the arrow keys, or the up and down buttons.",
        "Set how long each image shows, crossfade or cut, and the slow zoom if you want movement.",
        "Add music if you like, and choose whether the slideshow stretches to its length.",
        "Press Make slideshow; the video plays in the preview, then download the MP4.",
      ],
      goodToKnow: [
        "The length is simple arithmetic: the number of images times the seconds for each, so 20 photos at 3 s make one minute. A crossfade does not add time; it starts as the next picture's turn begins and lasts 0.6 s, or half a picture's time if that is shorter. With Fit the slideshow to the music, the time per image is the music's length divided by the number of images instead.",
        "Photos rarely share one shape. Each picture is fitted into the frame without being cut: Blurred fills the sides with a soft, darkened copy of the same photo, Black leaves plain bars, and Fill crops the photo to the frame instead. The frame is 1920×1080 for 16:9, 1080×1080 square, 1080×1350 for 4:5, 1080×1920 vertical, or the first image's own shape with its long side at most 1920 pixels.",
        "The slow zoom moves each picture by 8% while it is on screen, growing on one picture and shrinking on the next, the effect documentary editors call Ken Burns after the film maker who used it on archive photographs. Without it, a picture is drawn once and repeated, which encodes quickly and keeps the file small.",
        "Music is cut at the end of the slideshow and faded out over its last two seconds when it runs longer; when it is shorter, the rest of the video is silent and the page says so. An M4A or AAC file that fits is copied into the video as it is; anything else is encoded once to AAC. To put one picture under a whole recording instead, use [audio to video](/audio-to-video).",
        "JPEG, PNG, WebP and GIF open in every current browser; a GIF contributes its first frame. HEIC photos from phones open only where the browser can decode them, and the page names any file it could not read. Going the other way, a video can be turned back into numbered stills with [video to image sequence](/video-to-image-sequence).",
      ],
      faq: [
        {
          q: "How do I change the order of the photos?",
          a: "Drag a thumbnail up or down, or focus its handle and press the up and down arrow keys, or use the arrow buttons at the end of each row. The number on each thumbnail is its place in the video.",
        },
        {
          q: "How long will the video be?",
          a: "The number of images times the seconds per image; the page shows the total before you start. With music and Fit the slideshow to the music, it is exactly as long as the music.",
        },
        {
          q: "Can I add music to the slideshow?",
          a: "Yes. Choose Add music and pick an MP3, M4A, WAV, FLAC or OGG file. It is cut and faded out at the end if it is longer than the pictures.",
        },
        {
          q: "What resolution is the video?",
          a: "1920×1080 for 16:9 by default, or 1080 pixels wide for square, 4:5 and vertical, at 30 frames per second in H.264, which phones, computers and video sites play.",
        },
        {
          q: "Will my photos be cropped?",
          a: "Not unless you choose Fill. By default each photo is shown whole, on a blurred copy of itself where its shape differs from the frame.",
        },
        {
          q: "Are my photos uploaded?",
          a: "No. The pictures are decoded and the video is made in your browser; nothing leaves your device.",
        },
      ],
    },
  },
};
