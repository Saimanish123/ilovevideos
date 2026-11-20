import type { ToolInput } from "../schema";

export const videoToAvif: ToolInput = {
  slug: "video-to-avif",
  engine: "animated-image",
  category: "gif",
  phase: "p2",
  backends: ["webcodecs"],
  accepts: ["video"],
  produces: "image",
  presetOptions: { format: "avif" },
  keywords: [
    "video to avif",
    "mp4 to avif",
    "video to animated avif",
    "convert video to avif",
    "animated avif maker",
  ],
  aliases: ["animated avif", "avif animation", "mp4 to avif", "mov to avif"],
  related: [
    "video-to-webp",
    "video-to-gif",
    "video-to-apng",
    "trim-video",
    "compress-video",
    "video-converter",
  ],
  updatedAt: "2026-11-18",
  icon: "image-play",
  illustration: "avif",
  content: {
    en: {
      title: "Make an animated AVIF from video",
      subtitle: "Turn a clip into an animated AVIF, the smallest kind.",
      metaTitle: "Video to animated AVIF online, free, no upload",
      metaDescription:
        "Make an animated AVIF from MP4, MOV or WebM in your browser with AV1 compression. Pick the range on a timeline; see the size first. No upload.",
      action: "Make AVIF",
      what: "This tool turns a section of a video into an animated AVIF: a looping image, with no sound, compressed with the AV1 video codec. Because AV1 stores the motion between frames instead of every frame in full, an animated AVIF is usually the smallest way to put a moving picture in an image slot.",
      steps: [
        "Drop a video onto the page or choose one from your device.",
        "Drag the timeline handles to the part you want, or press I and O at the playhead.",
        "Keep the 24 fps default or pick another rate, choose a width and a quality, and check the estimate.",
        "Press Make AVIF, watch it play on the page and download it.",
      ],
      goodToKnow: [
        "An animated AVIF is an AV1 video stream wrapped as an image sequence, with the first frame also named as the still image for software that does not animate it. At the Balanced setting an AVIF is smaller than a GIF of the same frames, often many times smaller; the gap is widest for camera footage, where a GIF spends most of its bytes on grain. Pure noise, such as static on an old TV, is the exception: at these bitrates AV1 smooths it into a grey haze, and a WebP keeps it far better.",
        "Display support is narrower than for GIF or WebP. Current Chrome and Safari play the files this page writes, loop them when Loop is on and stop on the last frame when it is off. Older browsers, many image viewers and editors, and some chat apps do not show animated AVIF, so keep [an animated WebP](/video-to-webp) or a GIF for places you cannot control.",
        "Encoding needs an AV1 encoder in the browser. Desktop Chrome and Edge have one; Safari and Firefox may not, and the page says so before you press the button. AV1 is demanding to encode, so long or wide animations take noticeably longer than a WebP; the progress line counts the frames.",
        "The browser's AV1 encoder is built for real-time video calls, not for squeezing every byte, so a file made here is larger than one from a slow desktop encoder, such as FFmpeg with SVT-AV1, at the same picture quality. The size is set by a bitrate per pixel: Balanced is 0.12 bits per pixel per frame, Smaller half that and Sharper double. Still content uses less than its budget.",
        "Because motion costs little, the frame rate starts at 24 fps here, not 12 or 15 as for GIF, and smooth motion is affordable. The frames are converted to the colour format AV1 stores and tagged, so colours read the same in every player. There is no sound track.",
      ],
      faq: [
        {
          q: "Is AVIF smaller than WebP and GIF?",
          a: "For moving pictures, usually yes, by a wide margin, because AV1 stores motion between frames. For a still screen recording the three are closer, since there is little to store anyway.",
        },
        {
          q: "Why does the button say this browser cannot make AVIF?",
          a: "The browser has no AV1 encoder at this size. Try current Chrome or Edge on a computer, or make an animated WebP instead.",
        },
        {
          q: "Will it play in every app?",
          a: "No. Chrome and Edge play it, and recent Firefox and Safari support animated AVIF, but check it in the browser your viewers use. Many image viewers, editors and messaging apps do not yet animate AVIF, so fall back to WebP or GIF where it does not play.",
        },
        {
          q: "Does it keep the sound?",
          a: "No. An animated AVIF is an image and has no audio.",
        },
        {
          q: "Is my video uploaded?",
          a: "No. Decoding and AV1 encoding run in your browser, and the file never leaves your device.",
        },
      ],
    },
  },
};
