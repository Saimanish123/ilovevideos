import type { ToolInput } from "../schema";

export const videoToImageSequence: ToolInput = {
  slug: "video-to-image-sequence",
  engine: "video-to-frames",
  category: "gif",
  phase: "p2",
  backends: ["webcodecs"],
  accepts: ["video"],
  produces: "image",
  keywords: [
    "video to image sequence",
    "extract all frames from video",
    "video to jpg sequence",
    "video to png sequence",
    "split video into frames",
    "one frame per second from video",
  ],
  aliases: ["frames", "image sequence", "jpg sequence", "png sequence", "every frame"],
  related: [
    "extract-frame-from-video",
    "video-contact-sheet",
    "images-to-video",
    "video-to-gif",
    "trim-video",
    "change-video-speed",
  ],
  updatedAt: "2026-10-01",
  icon: "images",
  content: {
    en: {
      title: "Convert video to an image sequence",
      subtitle:
        "Save frames every second, every few seconds or every frame as numbered JPG, PNG or WebP files.",
      metaTitle: "Video to image sequence, JPG or PNG, no upload",
      metaDescription:
        "Turn a video into numbered JPG, PNG or WebP images: one per second, every N seconds or every frame. Pick a range on the timeline. Runs in your browser.",
      action: "Extract images",
      what: "This tool turns a video into a series of still images: one every second, one every few seconds, every tenth frame or every single frame, over the whole video or a range you mark on the timeline. The images are numbered in time order, so they sort correctly in any folder and editors can read them back as a sequence, and they download together as one ZIP. Ticks on the timeline show which frames become images before anything runs.",
      steps: [
        "Drop a video onto the page, or choose one from your device.",
        "Choose how often to take a frame; ticks appear on the filmstrip for each image.",
        "Drag the timeline handles if you want only part of the video.",
        "Pick JPG, PNG or WebP, and a smaller size if you do not need full resolution.",
        "Press Extract images, then download the ZIP or single images from the list.",
      ],
      goodToKnow: [
        "Count before you choose every frame. A 30 fps video has 1,800 frames in each minute, so a two-minute clip is 3,600 images; one run writes at most 2,000, and the page says how many a choice gives and asks for a longer interval or a shorter range past that. One image per second or every fifth second is usually what reviewing, picking stills or building a training set needs.",
        "The size estimate is measured, not guessed: the page encodes the frame under the playhead in the format and quality you chose and multiplies by the number of images. PNG is lossless and several times larger than JPG for camera footage; JPG at High quality looks the same at normal viewing size. The images are held in memory until the ZIP is made, and a run stops with a message if they pass 1.5 GB.",
        "With a time step, each image is the frame on screen at that moment, so a 1-second step from a 29.97 fps video gives frames at 0:00, 0:01, 0:02 even though frames do not fall exactly on the second. With a frame step, every N-th decoded frame is kept, counted from the start of the range, which is the right choice for animation or for motion analysis where the exact frame spacing matters.",
        "Files are named after the video with a four-digit number, clip-0001.jpg, clip-0002.jpg and on, and each row in the result lists the time the frame comes from. Editors such as After Effects and Blender can import a numbered sequence as one clip. For a single picture at full size, [extract a frame](/extract-frame-from-video) is quicker, and for an overview of a whole video on one image, make a [contact sheet](/video-contact-sheet).",
        "Frames are decoded by the browser at the video's own resolution, or scaled down once to the width you choose, and phone footage stored sideways comes out upright. Nothing is sent anywhere: decoding, encoding and the ZIP all happen on this device.",
      ],
      faq: [
        {
          q: "How do I get one image per second from a video?",
          a: "Drop the video and keep the default, Every second. The page shows how many images that is and their total size before you press Extract images.",
        },
        {
          q: "Can I extract every frame of a video?",
          a: "Yes, choose Every frame. Short clips work well; for longer ones mark a range on the timeline, since one run writes at most 2,000 images.",
        },
        {
          q: "Should I choose JPG, PNG or WebP?",
          a: "JPG for most uses, since the files are small. PNG when the images will be edited or measured and must stay exact. WebP when the images go on a website and a smaller file matters.",
        },
        {
          q: "Why are the files numbered instead of named by time?",
          a: "Numbered files sort in order everywhere and are what editors expect for a sequence. The time of each frame is listed next to its file in the result.",
        },
        {
          q: "Can I make the images smaller than the video?",
          a: "Yes. Choose a width under Size; the height follows the video's shape. Images are never enlarged beyond the video's own size.",
        },
        {
          q: "Is the video uploaded?",
          a: "No. The frames are decoded and saved in your browser, and the ZIP is put together on your device.",
        },
      ],
    },
  },
};
