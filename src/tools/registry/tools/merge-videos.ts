import type { ToolInput } from "../schema";

export const mergeVideos: ToolInput = {
  slug: "merge-videos",
  engine: "merge",
  category: "edit",
  phase: "p1",
  backends: ["webcodecs"],
  accepts: ["video"],
  produces: "video",
  keywords: [
    "merge videos",
    "join videos",
    "combine videos",
    "merge mp4 files",
    "video joiner",
    "put videos together",
  ],
  aliases: ["join", "combine", "concatenate", "stitch", "joiner"],
  related: [
    "split-video",
    "trim-video",
    "compress-video",
    "video-converter",
    "side-by-side-video",
    "add-intro-to-video",
  ],
  updatedAt: "2026-11-18",
  icon: "merge",
  content: {
    en: {
      title: "Merge videos",
      subtitle: "Join several clips into one video.",
      metaTitle: "Merge videos online, free, no upload",
      metaDescription:
        "Join video clips into one file in the order you choose. Matching clips are joined without re-encoding. Runs in your browser; nothing is uploaded.",
      action: "Merge",
      what: "This tool joins two or more videos into one file, one after the other, in the order of the list. When every clip was recorded the same way, it copies them end to end without re-encoding, so the result looks exactly like the originals. When the clips differ, it re-encodes them into one common frame and tells you which clip made that necessary.",
      steps: [
        "Drop two or more videos onto the page, or choose several at once; you can add more later.",
        "Put the clips in order by dragging a thumbnail, or with the up and down buttons.",
        "Read the line above the button: it says whether the join is lossless and, if not, which clip differs.",
        "Press Merge.",
        "Watch the result in the preview, then download it.",
      ],
      goodToKnow: [
        "A lossless join needs every clip to carry the same kind of streams: the same video codec with the same profile and level, the same frame size and rotation, and sound in the same format, sample rate and channel count. Clips filmed on one phone or camera with the same settings usually match, and so do parts cut from one video with [split video](/split-video). The page checks this as soon as the files are read, and checks once more when it starts.",
        "When the clips differ, every frame is decoded and encoded again as H.264 at high quality, at the frame size of the first clip in the list. Clips of another shape get black bars, or are cropped to fill if you choose that. Move a different clip to the top of the list to use its size. Sound is converted to one sample rate and channel layout, and a clip without sound gets silence so the picture and sound of later clips stay together.",
        "A lossless join keeps the container of the first clip, so MOV clips give a MOV and MP4 clips an MP4. A re-encoded join is always an MP4, which plays on practically every phone, computer and site.",
        "Joins are straight cuts from one clip to the next; there are no crossfades or transitions on this page. To open or close with a title card, a logo or a short clip that crossfades into the video, [add an intro and outro](/add-intro-to-video). In a lossless join each clip's sound starts within half an audio frame of its first picture, 12 ms at most for 44.1 kHz sound, and the offset does not build up however many clips you join. The first 23 ms of sound after each join is decoded without the audio frame that came before it in the original clip, so a sharp sound right on the cut can come out softened.",
        "Up to 50 clips can be joined at a time. The joined video is built in your browser's memory before you download it, so the clips together need to fit in the memory your device has free.",
        "To remove the unwanted start or end of a clip before joining, use [trim video](/trim-video) first. If the joined file is too large to send, [compress video](/compress-video) makes it smaller. To join audio files without a picture, such as MP3 chapters, use [merge audio](/merge-audio).",
      ],
      faq: [
        {
          q: "Will merging reduce the quality of my videos?",
          a: "Not when the clips match: they are copied end to end without re-encoding. When they differ, the video is re-encoded at high quality, and the page tells you before you start.",
        },
        {
          q: "Can I merge videos with different sizes or orientations?",
          a: "Yes. The first clip sets the frame size, and the others are fitted into it with black bars, or cropped to fill it. This means re-encoding.",
        },
        {
          q: "Why does it say my clips will be re-encoded?",
          a: "Because one clip differs from the first in codec, frame size, rotation or sound format. The line above the Merge button names the clip and what differs.",
        },
        {
          q: "How do I change the order of the clips?",
          a: "Drag a clip by its thumbnail, or use the up and down buttons on each row. With a keyboard, focus the thumbnail and press the up or down arrow.",
        },
        {
          q: "Can I add a transition between clips?",
          a: "Not on this page. Clips are joined with straight cuts, which is also what makes a lossless join possible.",
        },
        {
          q: "Are my videos uploaded to join them?",
          a: "No. The clips are read, joined and written in your browser. Nothing is sent to a server.",
        },
      ],
    },
  },
};
