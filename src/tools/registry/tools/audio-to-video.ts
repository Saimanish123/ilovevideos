import type { ToolInput } from "../schema";

export const audioToVideo: ToolInput = {
  slug: "audio-to-video",
  engine: "audio-to-video",
  category: "convert",
  phase: "p2",
  backends: ["webcodecs"],
  accepts: ["audio"],
  produces: "video",
  keywords: [
    "audio to video",
    "mp3 to mp4",
    "add image to audio",
    "put a picture on an mp3",
    "upload audio to youtube",
    "podcast to video",
  ],
  aliases: ["mp3 to video", "audio with picture", "static image video", "music video", "podcast"],
  related: [
    "images-to-video",
    "add-subtitles-to-video",
    "edit-video-metadata",
    "audio-converter",
    "add-audio-to-video",
  ],
  updatedAt: "2026-10-01",
  icon: "file-video-camera",
  content: {
    en: {
      title: "Turn audio into a video",
      subtitle: "Turn a song or recording into a video with a picture.",
      metaTitle: "Audio to video: MP3 to MP4 with a picture",
      metaDescription:
        "Turn an MP3, M4A, WAV or FLAC into an MP4 with a still image or a title card, for video sites. AAC sound is copied as it is. Runs in your browser.",
      action: "Make video",
      what: "This tool turns a sound file into a video: one still picture for the whole length, either an image you choose or a plain title card with the track's name, over the sound, saved as an MP4. Video sites and many apps take only video files, so this is how a song, a podcast episode or a recorded talk gets uploaded where an MP3 is refused. The picture above the settings is the frame the video will show, and it changes as you edit it.",
      steps: [
        "Drop an audio file onto the page, or choose one from your device.",
        "Keep the title card, which uses the file's title and artist, or choose Image and pick a picture.",
        "Choose the shape: 16:9, square or vertical, or the image's own shape.",
        "Press Make video; the new video plays in the preview, then download the MP4.",
      ],
      goodToKnow: [
        "The picture does not move, so the video holds one frame per second, with a full key frame every ten seconds and nearly empty frames in between. That keeps both the encoding time and the file small: most of the size is the sound. The frame is H.264 in an MP4, the most widely read combination of codec and container.",
        "An M4A or AAC file's sound is copied into the video packet for packet, so it is exactly the sound you dropped. MP3, WAV, FLAC, OGG and Opus sound is encoded once to AAC at 192 kbps, since AAC is the sound format that MP4 players and upload pages expect; the page says which of the two happens before you start. MP3 files keep their exact start and end, because the encoder delay the MP3 notes in its header is taken off first.",
        "The title card is text on a flat dark or light background, drawn with the Geist typeface: the title from the file's own title tag, or its name if it has none, and a second line with the artist. With an image in a frame of another shape, Blurred fills the sides with a soft copy of the picture, Black leaves bars, and Fill crops the picture to the frame. Choosing the image's own shape keeps the whole picture with no bars, scaled so its long side is at most 1920 pixels.",
        "Several audio files dropped together get the same picture settings and one video each, collected in a ZIP; a title card then shows each file's own title. That suits an album or a run of podcast episodes. To show several pictures in turn over one sound, make a slideshow with [images to video](/images-to-video) instead.",
        "Captions or lyrics can be added afterwards with [add subtitles](/add-subtitles-to-video), as a track players can switch on or as text drawn into the picture.",
      ],
      faq: [
        {
          q: "Why can I not upload an MP3 to a video site?",
          a: "Video sites such as YouTube take video files, and an MP3 has no picture. Turning it into an MP4 with one still picture gives the site the video file it asks for, with your sound unchanged or encoded once to AAC.",
        },
        {
          q: "Does the sound lose quality?",
          a: "AAC sound from an M4A or AAC file is copied exactly. Other formats are encoded once to AAC at 192 kbps, a rate commonly used for music; nothing is encoded twice.",
        },
        {
          q: "What size is the video?",
          a: "1920×1080 for 16:9, 1080×1080 for square and 1080×1920 for vertical. With the image's own shape, the long side is 1920 pixels or the image's own size if smaller.",
        },
        {
          q: "Can I use album art or a podcast cover?",
          a: "Yes. Choose Image and pick the picture. A square cover in a 16:9 video sits in the middle on a blurred copy of itself, or choose the image's own shape for a square video.",
        },
        {
          q: "Can I turn many songs into videos at once?",
          a: "Yes. Drop several audio files; each becomes its own video with the same settings, and the title card shows each file's own title.",
        },
        {
          q: "Is my audio uploaded?",
          a: "No. The video is put together in your browser, and the file never leaves your device.",
        },
      ],
    },
  },
};
