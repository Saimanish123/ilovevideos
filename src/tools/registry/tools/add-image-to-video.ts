import type { ToolInput } from "../schema";

export const addImageToVideo: ToolInput = {
  slug: "add-image-to-video",
  engine: "image-overlay",
  category: "edit",
  phase: "p2",
  backends: ["webcodecs"],
  accepts: ["video"],
  produces: "video",
  keywords: [
    "add image to video",
    "overlay image on video",
    "add sticker to video",
    "put picture on video",
    "add gif to video",
    "add png to video",
  ],
  aliases: ["sticker", "overlay", "picture", "gif sticker", "emoji", "image layer"],
  related: [
    "remove-green-screen-from-video",
    "add-text-to-video",
    "add-watermark-to-video",
    "blur-video",
    "crop-video",
    "remove-background-from-video",
  ],
  updatedAt: "2026-11-18",
  icon: "image-plus",
  content: {
    en: {
      title: "Add an image to a video",
      subtitle: "Put pictures or stickers on a video.",
      metaTitle: "Add image or sticker to video online, free",
      metaDescription:
        "Overlay PNG, GIF, WebP or SVG images on a video. Drag, resize and rotate each one, set when it appears, stack them. Animated stickers play. No upload.",
      action: "Add to video",
      what: "This tool places pictures on top of a video: a product shot in a corner, an arrow pointing at something, a sticker that bounces next to a face. Each image is a layer you drag into place, resize from a corner, turn with a handle and show for its own stretch of the video. Animated GIF, WebP and PNG stickers keep playing in the result, and up to eight images can be stacked in the order you choose.",
      steps: [
        "Drop the video onto the page.",
        "Choose one or more images; each one lands in the middle at 30% of the picture's width.",
        "Drag an image to place it, pull a corner to resize it, and drag the round handle above it to turn it.",
        "Select an image and drag the handles on the timeline to set when it appears and goes.",
        "Press Add to video, check the result in the preview, then download it.",
      ],
      goodToKnow: [
        "Transparency is what makes an image look like a sticker rather than a pasted rectangle. PNG, WebP, GIF and SVG can carry a transparent background and sit on the picture as a shape; JPEG cannot, so a JPEG always shows as a box with its own background. An SVG is drawn once, as long as the video's longer side (up to 4096 pixels), before it is used, so it stays sharp at any size up to the full frame.",
        "Animated GIF, WebP and PNG files play frame by frame in the result, at their own timing, starting from the moment the image appears and looping until it goes. A GIF frame marked as lasting 10 milliseconds or less plays at 100 milliseconds, which is what web browsers do with such files, so the sticker moves at the speed you saw when you previewed it. Where the browser cannot read animation frames, the page says so before you start and uses the first frame.",
        "The list shows the images in stack order, the topmost first; the arrows beside each one move it up or down the stack, for example to put a frame shape over a photo. Size is measured against the picture's width rather than in pixels, so a sticker at 30% takes the same share of a phone clip as of a 4K file, and an image can be dragged partly off the edge for a slide-in look.",
        "A single logo that should sit faintly in a corner for the whole video is a different job: the [watermark tool](/add-watermark-to-video) has corner positions, a margin and opacity presets built for it. For words rather than pictures, [add text](/add-text-to-video), which sets the type for you and fades it in and out.",
        "Every frame gets new pixels, so the picture is encoded once more to H.264 at a high bitrate chosen for the video's size and frame rate; the sound is copied unchanged when the container allows. MP4, MOV and MKV keep their container and WebM is written as MP4. Older formats such as AVI or WMV need converting to MP4 first, which the page offers when you drop one.",
      ],
      faq: [
        {
          q: "Can I add a GIF sticker that moves?",
          a: "Yes, in browsers that can read animation frames, which the page checks before you start; elsewhere the first frame is used. The animation loops for as long as the sticker is on screen.",
        },
        {
          q: "Can I add more than one image?",
          a: "Yes, up to eight. Each has its own position, size, turn, opacity and time range, and the list order decides which is on top.",
        },
        {
          q: "How do I show an image only for a few seconds?",
          a: "Select it, then drag the start and end handles on the timeline under the preview. Outside that stretch the image is not drawn.",
        },
        {
          q: "Can I rotate an image?",
          a: "Yes. Drag the round handle above it, use the square bracket keys, or type an angle. It snaps level near 0 and 90 degrees.",
        },
        {
          q: "Why does my picture have a white box around it?",
          a: "The image has no transparency, which is always the case for JPEG. Use a PNG or WebP with a transparent background instead.",
        },
        {
          q: "Is anything uploaded?",
          a: "No. The images are read and the video is encoded in your browser; nothing leaves your device.",
        },
      ],
    },
  },
};
