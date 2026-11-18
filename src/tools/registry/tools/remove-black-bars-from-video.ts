import type { ToolInput } from "../schema";

export const removeBlackBarsFromVideo: ToolInput = {
  slug: "remove-black-bars-from-video",
  engine: "crop",
  category: "edit",
  phase: "p2",
  backends: ["webcodecs"],
  accepts: ["video"],
  produces: "video",
  presetOptions: { bars: true },
  keywords: [
    "remove black bars from video",
    "remove letterbox from video",
    "crop black bars",
    "remove pillarbox bars",
    "auto crop video black borders",
  ],
  aliases: ["letterbox", "pillarbox", "black borders", "auto crop", "cropdetect"],
  related: [
    "crop-video",
    "change-video-aspect-ratio",
    "resize-video-for-tiktok",
    "compress-video",
    "add-border-to-video",
  ],
  updatedAt: "2026-11-18",
  icon: "rectangle-horizontal",
  illustration: "black-bars",
  content: {
    en: {
      title: "Remove black bars from video",
      subtitle: "Find the black bars around a video and crop them off. Runs in your browser.",
      metaTitle: "Remove black bars from video online, free",
      metaDescription:
        "Detect letterbox and pillarbox bars across a whole video and crop them off. Adjust the frame if needed. Runs in your browser, no upload. Free.",
      action: "Remove bars",
      what: "This tool finds black bars at the top and bottom (letterbox), at the sides (pillarbox) or all round, and crops them off. It looks at 24 frames spread through the video, so a dark scene or a fade does not fool it, places the crop frame on what it found, and lets you adjust the frame before the video is written.",
      steps: [
        "Drop a video with black bars onto the page.",
        "Wait a moment while 24 frames are read; the crop frame then sits on the picture inside the bars.",
        "Scrub through the video to check, and drag the frame's edges if something needs adjusting.",
        "If subtitles show inside a bar, choose whether to keep that strip.",
        "Press Remove bars, then download the result.",
      ],
      goodToKnow: [
        "Bars come from fitting one shape of picture into another: a widescreen film in a 16:9 frame gets bars above and below, an old 4:3 programme in a 16:9 frame gets bars at the sides, and a phone video posted in a landscape frame gets wide ones. Removing them gives a file whose frame is the picture itself, which players and editors then fit to any screen without double bars.",
        "A row or column counts as bar when almost all of its pixels are near black. Each of the 24 frames gives its own answer, and the bar is the size most frames agree on: a night scene makes the bars look bigger in a few frames and a subtitle smaller in others, but a real bar is the same in all of them. A video that is mostly very dark may not show enough to tell; then the frame starts on the whole picture and you set it by hand.",
        "Burned-in subtitles and channel logos often sit inside the bars. When some frames show content there, the tool names the edge and the moments, and a tick box keeps that strip; left unticked, the crop removes the bars fully and the subtitles with them. If you need the subtitles and a clean frame at once, keep the strip and crop by hand afterwards.",
        "Cropping changes every frame, so the picture is encoded once to H.264 near the source's bitrate for the area kept, with even edges as H.264 requires; the sound is copied as it is where the container allows. If no bars are found, the page says so and nothing needs to be done. To reshape a picture to a different frame on purpose, with bars or a fill, use [change aspect ratio](/change-video-aspect-ratio) instead, and use [crop video](/crop-video) to choose any other region.",
      ],
      faq: [
        {
          q: "Why did it leave a thin dark line?",
          a: "Some videos fade the bar's edge into the picture over a row or two, and those rows are not dark enough to count as bar. Drag the frame's edge in by a couple of pixels.",
        },
        {
          q: "Can it remove blurred or coloured bars?",
          a: "No. It looks for near-black bars only. For other borders, drag the crop frame by hand on the crop video page.",
        },
        {
          q: "What if the bars change during the video?",
          a: "The crop is one frame for the whole video, set where most sampled frames agree. Scrub through and widen the frame if a later part has a larger picture.",
        },
        {
          q: "Does it make the video smaller?",
          a: "Fewer pixels are encoded, so the file is usually a little smaller than the source, though the main aim is the shape.",
        },
        {
          q: "Is my video uploaded?",
          a: "No. Reading the frames, cropping and encoding all happen in your browser.",
        },
      ],
    },
  },
};
