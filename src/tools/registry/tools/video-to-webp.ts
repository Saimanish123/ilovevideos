import type { ToolInput } from "../schema";

export const videoToWebp: ToolInput = {
  slug: "video-to-webp",
  engine: "animated-image",
  category: "gif",
  phase: "p2",
  backends: ["webcodecs"],
  accepts: ["video"],
  produces: "image",
  presetOptions: { format: "webp" },
  keywords: [
    "video to webp",
    "mp4 to webp",
    "video to animated webp",
    "convert video to webp",
    "animated webp maker",
  ],
  aliases: ["animated webp", "mp4 to webp", "mov to webp", "webp animation"],
  related: [
    "video-to-gif",
    "video-to-avif",
    "video-to-apng",
    "trim-video",
    "extract-frame-from-video",
    "sharpest-frame-from-video",
  ],
  updatedAt: "2026-11-18",
  icon: "image-play",
  content: {
    en: {
      title: "Make an animated WebP from video",
      subtitle:
        "Turn part of a video into a looping WebP, far smaller than a GIF, in your browser.",
      metaTitle: "Video to animated WebP online, free, no upload",
      metaDescription:
        "Make an animated WebP from MP4, MOV or WebM in your browser. Pick the range on a timeline, set width, frame rate and quality. No upload.",
      action: "Make WebP",
      what: "This tool cuts a section of a video into an animated WebP: a looping image with no sound that web pages show like a GIF. Each frame is compressed the way a WebP photo is, in full colour, and after the first frame only the part of the picture that changed is stored. A short clip for a web page or a chat usually comes out at a fraction of the GIF of the same moment.",
      steps: [
        "Drop a video onto the page or choose one from your device.",
        "Drag the handles on the timeline to the part you want, or press I and O at the playhead; the preview plays it muted and on repeat.",
        "Choose a width, a frame rate and Smaller, Balanced or Sharper, and watch the size estimate.",
        "Press Make WebP, then check the animation playing on the page and download it.",
      ],
      goodToKnow: [
        "A GIF can hold only 256 colours per frame and compresses with a method from the 1980s, so skies band, skin turns blotchy and files grow fast. A WebP frame keeps full colour and is compressed like a photo. On six test clips at 480 px and 15 fps, the WebP from this page was between 2 and 20 times smaller than a GIF of the same frames, with the largest savings on camera footage and the smallest on flat screen recordings.",
        "WebP compression works on the brightness of each pixel at full resolution and on colour at half resolution in each direction, the same trade every video codec makes. Fine coloured detail such as small red text on blue can soften. If the clip is a screen recording with crisp coloured lettering, look at the result closely, or use [the APNG maker](/video-to-apng), which keeps every pixel exactly.",
        "Only what changes is written again. When a frame differs from the one on screen by no more than a few levels in any colour, it is not stored at all and the previous frame simply stays longer, and when only a cursor moves, only the rectangle around it is stored. A screen recording with a still background can therefore come out tiny, while handheld camera footage, where every pixel moves, stores whole frames. In Safari every frame is stored whole, so this saving does not apply there.",
        "The quality choice sets how hard each frame is compressed. Balanced kept 40 dB or more of brightness accuracy against the uncompressed frames on five of six test clips, close enough that it is hard to tell apart at normal viewing size. Smaller was 5 to 20% lighter and softens grain and fine texture. Sharper keeps grain and small text and came out 1.5 to 3.5 times the size of Balanced, so use it for short clips or for an image that will be viewed large.",
        "Frame timing is stored in milliseconds, so 24 and 25 fps play at their real speed, which a GIF cannot do, and the animation lasts exactly as long as the range you picked; it carries no sound.",
        "Where the browser can write WebP images, as Chrome and Edge do, the frames are compressed by its own WebP encoder. Safari's engine cannot, so there each frame is encoded whole with the browser's VP8 video encoder, the codec inside a lossy WebP, at a fixed bitrate. In WebKit, the engine Safari is built on, those files were valid and played the same; on our camera-like test clip they were about 1.1 times the size Chrome gave at the same accuracy, and larger where Chrome stores only the changed parts.",
      ],
      faq: [
        {
          q: "Where can I use an animated WebP?",
          a: "Current Chrome, Edge, Firefox and Safari show it in a web page like a GIF. Some older image viewers, editors and chat apps show only the first frame or nothing, so check where it will be posted; a GIF is still the safest choice for those.",
        },
        {
          q: "Why is my WebP so much smaller than the GIF?",
          a: "Each WebP frame is compressed like a photo instead of being cut down to 256 colours, and frames or regions that did not change are not stored again.",
        },
        {
          q: "Which frame rate suits an animated WebP?",
          a: "15 fps is smooth for most clips and is the default. Use 10 or 12 for a screen recording, and 24 or 30 for fast motion; every step up adds frames and size in proportion.",
        },
        {
          q: "Does it keep the sound?",
          a: "No. Animated WebP has no audio track. Trim the video to the same range and keep it as MP4 if sound matters.",
        },
        {
          q: "Is my video uploaded?",
          a: "No. Decoding, resizing and WebP encoding all run in your browser, and the file never leaves your device.",
        },
        {
          q: "Why does the size estimate differ from the result?",
          a: "The estimate measures one frame of your video and multiplies it by the number of frames. Footage where little moves comes out smaller, because unchanged parts are not stored again.",
        },
      ],
    },
  },
};
