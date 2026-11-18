import type { ToolInput } from "../schema";

export const extractFrameFromVideo: ToolInput = {
  slug: "extract-frame-from-video",
  engine: "frame-extract",
  category: "gif",
  phase: "p1",
  backends: ["webcodecs"],
  accepts: ["video"],
  produces: "image",
  keywords: [
    "extract frame from video",
    "video to image",
    "video to png",
    "video to jpg",
    "screenshot from video",
    "save a frame from a video",
  ],
  aliases: ["frame", "still", "screenshot", "snapshot", "video to image", "video to png"],
  related: [
    "video-to-image-sequence",
    "video-contact-sheet",
    "video-thumbnail-maker",
    "trim-video",
    "sharpest-frame-from-video",
    "freeze-frame-video",
  ],
  updatedAt: "2026-09-30",
  icon: "image",
  content: {
    en: {
      title: "Extract a frame from video",
      subtitle:
        "Save any single frame of a video as a full-resolution PNG, JPG or WebP, in your browser.",
      metaTitle: "Extract a frame from video, free, no upload",
      metaDescription:
        "Save one frame of a video as a PNG, JPG or WebP at the source resolution. Scrub to the exact frame in your browser. Files never leave your device. Free.",
      action: "Extract frame",
      what: "This tool saves one frame of a video as an image. You scrub a filmstrip under the preview to the moment you want, and the picture above updates so you always see the frame that will be saved. The frame is decoded at the source resolution, so a 1920×1080 video gives a 1920×1080 image with no screen scaling, no player overlay and no compression from a screenshot tool. The output is PNG by default, which keeps every pixel, or JPG or WebP if you need a smaller file.",
      steps: [
        "Drop a video onto the page or choose one from your device.",
        "Drag the playhead on the filmstrip until the preview shows the frame you want; the arrow keys step one frame, and one second with Shift.",
        "Or play the preview and press Take this frame (or T) at the moment you want.",
        "Choose PNG for a lossless image, or JPG or WebP with a quality level for a smaller one.",
        "Press Extract frame, then download the image or copy it straight to the clipboard. The file name carries the timestamp.",
      ],
      goodToKnow: [
        "A video frame and a screenshot are not the same thing. A screenshot captures whatever the player drew on your screen: scaled to the window, sometimes with the controls, sometimes with a compressed copy of the picture. This tool decodes the frame itself, so the image has the video's own pixel dimensions and colours. If the file is 4K, the image is 4K, even on a small laptop screen.",
        "The playhead snaps to frame boundaries, using the frame rate read from the file, so the time you pick is always a real frame rather than a point between two. Arrow keys move by one frame, Shift with an arrow moves by one second, and the readout shows the time to hundredths of a second. The saved file is named with that time, for example clip-0m12s34.png, so a set of stills from one video sorts in order. If the frame you want is blurred by motion, [the sharpest frame](/sharpest-frame-from-video) finds the clearest one nearby.",
        "PNG is lossless and is the right choice when the image will be edited, zoomed or used as a thumbnail source. JPG and WebP throw away detail to save space; WebP is smaller than JPG at the same quality and is supported by every current browser. A frame from a compressed video already contains compression artefacts, so saving it as a high-quality JPG usually looks identical to the PNG at a fraction of the size.",
        "Phone footage is often stored sideways with a rotation flag that players honour. The frame is rotated the same way, so a portrait clip gives a portrait image. Variable frame rate footage works too, because the decoder is asked for the frame at a time, not by counting frames.",
        "If you want a short moving clip rather than a still, the [GIF maker](/video-to-gif) works from the same kind of filmstrip, and [trim video](/trim-video) cuts a range without re-encoding. To pull many frames at once, for example one per second, that is a separate job and this page stays focused on one exact frame.",
        "Decoding happens in your browser with the same decoder that plays the video, and nothing is uploaded. Copy image puts the still on the clipboard as a PNG, ready to paste into a message or a document; it appears where the browser allows pages to write images to the clipboard.",
      ],
      faq: [
        {
          q: "What resolution is the image?",
          a: "The video's own display resolution, after any rotation stored in the file. A 1920×1080 video gives a 1920×1080 image; a 3840×2160 video gives a 3840×2160 image. There is no upscaling and no downscaling.",
        },
        {
          q: "Why does the frame look soft compared with the paused video?",
          a: "It should look the same. The image is the decoded frame at full size, while the preview is scaled to fit the page, which can hide softness that was always in the video. Compressed video, especially at low bitrates, has less detail than its resolution suggests.",
        },
        {
          q: "PNG, JPG or WebP: which should I pick?",
          a: "PNG if you will edit the image or need it exact. JPG if you need the widest compatibility with older software. WebP if you want the smallest file for the web and the tools you use accept it.",
        },
        {
          q: "Can I extract a frame from a MOV, MKV or WebM file?",
          a: "Yes, as long as your browser can decode the video codec inside it. H.264, VP8, VP9 and AV1 work in current Chrome, Edge, Firefox and Safari. HEVC and ProRes depend on the browser and the device; if a file cannot be decoded, the page says so and suggests converting it first.",
        },
        {
          q: "Does the image include subtitles or the player controls?",
          a: "No. Only the video track is decoded, so burnt-in text that is part of the picture appears, but subtitle tracks, controls and overlays do not.",
        },
        {
          q: "Is the video uploaded?",
          a: "No. The file is read and the frame is decoded on your device. You can check the network panel in your browser while using the tool: no request carries the file.",
        },
      ],
    },
  },
};
