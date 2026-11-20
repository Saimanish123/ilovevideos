import type { ToolInput } from "../schema";

export const sharpenVideo: ToolInput = {
  slug: "sharpen-video",
  engine: "clarity",
  category: "edit",
  phase: "p3",
  backends: ["webcodecs"],
  accepts: ["video"],
  produces: "video",
  presetOptions: { job: "sharpen" },
  keywords: [
    "sharpen video",
    "make blurry video sharper",
    "sharpen video online",
    "fix soft video",
    "increase video sharpness",
  ],
  aliases: ["sharper", "blurry", "soft", "crisp", "unsharp mask", "clarity"],
  related: [
    "denoise-video",
    "stabilize-video",
    "adjust-video-brightness",
    "add-filter-to-video",
    "compress-video",
  ],
  updatedAt: "2026-11-18",
  icon: "focus",
  illustration: "sharpen",
  content: {
    en: {
      title: "Sharpen video",
      subtitle: "Make soft footage look sharper.",
      metaTitle: "Sharpen video online, free, no upload",
      metaDescription:
        "Sharpen a soft or slightly blurry video with a live before and after split. Light, Medium or Strong, plus a fine slider. Runs in your browser. Free.",
      action: "Sharpen",
      what: "This tool makes edges and fine detail in a video stand out more. It works on brightness only, so colours do not fringe, it leaves tiny changes such as grain alone, and it limits how far each pixel can overshoot its neighbours, which keeps the bright and dark outlines of a plain sharpen filter away from edges. Drag the divider on the picture to compare the result with the original as it plays.",
      steps: [
        "Drop a video onto the page.",
        "Drag the divider on the picture to compare before and after, and play or scrub to a detailed scene.",
        "Pick Light, Medium or Strong, or fine-tune with the slider.",
        "Press Sharpen, then download the result.",
      ],
      goodToKnow: [
        "Sharpening cannot recover detail that was never recorded. It raises the contrast of edges that are already there, which reads as crisper on footage that is a little soft from focus, a cheap lens, upscaling or heavy compression. A shot that is badly out of focus stays out of focus; it only gains harder outlines.",
        "Every sharpen filter also lifts noise, because grain is fine detail too. This one scales down changes smaller than a couple of brightness levels, which spares faint grain, but grainy low-light footage will still look grainier. For those clips, [denoise the video](/denoise-video) first and sharpen the cleaned result afterwards, at Light or Medium.",
        "Detail size, under More options, sets how wide an edge the tool looks at. Fine lifts texture such as hair, fabric and text; Medium, the default, suits most footage; Coarse gives larger shapes more punch but shows halos sooner. The strength slider scales the effect, with Medium as 100%, from barely there to strong.",
        "The before and after view uses the same shader and numbers as the file, at up to 1920 pixels on its long side, so what you see right of the divider is what you will get. The picture is encoded once to H.264 near the source's bitrate, and the sound is copied as it is where the container allows. Sharpening adds detail for the encoder to keep, so the file can come out a little larger than the source at the same quality.",
        "FFmpeg's nearest filter is `unsharp` on brightness; it has no overshoot limit or grain threshold, so at the same amount it draws stronger halos. If the video is also shaky, run [stabilize](/stabilize-video) first: steadying redraws and slightly softens every frame, which a sharpen afterwards puts right.",
      ],
      faq: [
        {
          q: "Can it fix a video that is out of focus?",
          a: "Only a slightly soft one. Sharpening strengthens edges that exist; it cannot rebuild detail a blurred lens never captured.",
        },
        {
          q: "Why does my video look grainier after sharpening?",
          a: "Grain is fine detail, so sharpening lifts it too. Reduce the grain first with the denoise tool, then sharpen at a lower strength.",
        },
        {
          q: "What strength should I use?",
          a: "Medium suits most soft phone and webcam footage. Use Light for video that is already decent and Strong for clearly soft footage; check faces and text against the divider.",
        },
        {
          q: "Does sharpening change the colours?",
          a: "No. Only brightness is sharpened, and the same change is added to red, green and blue, so colours keep their hue.",
        },
        {
          q: "Is my video uploaded?",
          a: "No. The preview and the final file are both made in your browser, and nothing leaves your device.",
        },
      ],
    },
  },
};
