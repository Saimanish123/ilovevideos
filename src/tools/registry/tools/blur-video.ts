import type { ToolInput } from "../schema";

export const blurVideo: ToolInput = {
  slug: "blur-video",
  engine: "blur-region",
  category: "edit",
  phase: "p2",
  backends: ["webcodecs"],
  accepts: ["video"],
  produces: "video",
  keywords: [
    "blur video",
    "blur part of a video",
    "blur face in video",
    "blur license plate in video",
    "pixelate video",
    "censor video",
    "hide text in video",
  ],
  aliases: ["blur face", "pixelate", "censor", "redact", "hide", "number plate", "mosaic"],
  related: [
    "crop-video",
    "remove-metadata-from-video",
    "add-watermark-to-video",
    "trim-video",
    "compress-video",
  ],
  updatedAt: "2026-11-18",
  icon: "scan-face",
  content: {
    en: {
      title: "Blur part of a video",
      subtitle:
        "Hide a face, a number plate, a screen or a name: draw over it and blur, pixelate or cover it.",
      metaTitle: "Blur part of a video online, free, no upload",
      metaDescription:
        "Draw boxes or ovals on a video and blur, pixelate or black them out; set key frames to follow a moving subject. Runs in your browser, no upload.",
      action: "Blur",
      what: "This tool hides parts of a video. You draw a rectangle or an oval over what should not be seen, such as a face, a car's number plate, a phone screen or a name badge, and choose to blur it, pixelate it or cover it with black. A region can stay put, follow a subject that moves by way of key frames, and show for the whole video or only part of it.",
      steps: [
        "Drop the video onto the page; a first region appears in the middle of the picture.",
        "Drag the region over what you want hidden and pull its corners to fit, or drag on the picture to draw more.",
        "For a subject that moves, tick Follows a moving subject, scrub to each moment and move the region there.",
        "Pick Blur, Pixelate or Box and a strength; the preview shows the result as it plays.",
        "Press Blur, check the result in the preview, then download it.",
      ],
      goodToKnow: [
        "Strength is measured against the size of the region, not the picture, so a small number plate and a large face are hidden alike. At Medium the blur's spread is a fifth of the region's shorter side and pixel blocks are a quarter of it. Draw the region close around what it hides: a region much larger than the text in it spreads the same blur over more space, and the text inside gets less of it.",
        "Blur and pixelation scramble detail, but they leave the colours and rough shapes. Box covers the region in solid black and leaves nothing to recover, which is the right choice for passwords, card numbers, addresses and anything where a guess would already do harm. Pixelation with small blocks is the weakest: pixelated text in screenshots has been read back by matching block patterns, so keep pixel blocks large over text.",
        "A moving subject needs key frames. With Follows a moving subject ticked, every time you move or resize the region the tool stores where it is at that moment, and between two key frames it moves in a straight line at an even pace. Add a key frame wherever the subject turns or changes speed, then play the preview through: if an eye or a letter peeks out at any moment, it will be in the file too.",
        "Each region has its own time range, set on the timeline under the preview, so a name badge can be hidden only while it is in shot. Under More options, a soft edge fades the effect out just outside the region, and the inverted mode keeps the regions clear and blurs everything else, which suits hiding a busy background behind one person.",
        "Blurring rewrites every frame, so the picture is encoded once more to H.264 at a high bitrate; the sound is copied unchanged when the container allows. Blurring also does nothing for what the file says about itself: phone videos often carry the place they were filmed in their metadata, which you can strip with [remove metadata](/remove-metadata-from-video) after this step.",
        "This tool will not take a watermark off a video. Blurring a logo such as your own old one is the honest way to hide it, and the result shows that something was hidden. To lose an edge with a mark on it altogether, [crop the video](/crop-video) instead.",
      ],
      faq: [
        {
          q: "How do I blur a face that moves?",
          a: "Tick Follows a moving subject, then scrub to each point where the face is somewhere new and drag the region onto it. The region glides between those key frames; add more where it drifts off.",
        },
        {
          q: "Does it find faces on its own?",
          a: "No. You draw a region over each face, and for a face that moves you set key frames. Automatic face detection is not offered.",
        },
        {
          q: "Can I blur more than one thing?",
          a: "Yes, up to 16 regions, each with its own shape, position and time range. Drag on the picture to draw another, or press Add region.",
        },
        {
          q: "Is a blur safe enough to hide text?",
          a: "At Medium or Strong, over a region drawn close around the text, the letters can no longer be made out; Light can leave large text legible. For a password or a card number use Box, which replaces it with solid black.",
        },
        {
          q: "Can I blur everything except one person?",
          a: "Yes. Draw a region around the person, open More options and tick the option to blur everything except the regions.",
        },
        {
          q: "Does blurring lower the video's quality?",
          a: "Only the regions change visibly. The rest goes through one more H.264 encode at a high bitrate, which is hard to see; start from the original file, not a copy that is already compressed.",
        },
        {
          q: "Is my video uploaded?",
          a: "No. The regions are drawn and the video is encoded in your browser. Nothing is sent anywhere.",
        },
      ],
    },
  },
};
