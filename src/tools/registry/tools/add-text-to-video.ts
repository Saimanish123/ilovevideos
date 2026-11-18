import type { ToolInput } from "../schema";

export const addTextToVideo: ToolInput = {
  slug: "add-text-to-video",
  engine: "text-overlay",
  category: "edit",
  phase: "p2",
  backends: ["webcodecs", "ffmpeg-wasm"],
  accepts: ["video"],
  produces: "video",
  keywords: [
    "add text to video",
    "put text on video",
    "add title to video",
    "add caption to video",
    "write on video",
    "text overlay video",
  ],
  aliases: ["text", "title", "caption", "lower third", "overlay", "label"],
  related: [
    "add-image-to-video",
    "add-watermark-to-video",
    "add-subtitles-to-video",
    "add-intro-to-video",
    "add-progress-bar-to-video",
    "trim-video",
    "compress-video",
  ],
  updatedAt: "2026-10-01",
  icon: "type",
  content: {
    en: {
      title: "Add text to video",
      subtitle: "Put a title or caption on a video where you place it, for as long as you choose.",
      metaTitle: "Add text to video online, free, no upload",
      metaDescription:
        "Put a title, caption or label on a video: drag it into place, choose when it shows on the timeline, fade it in and out. Runs in your browser, no upload.",
      action: "Add text",
      what: "This tool writes text onto a video: a title at the start, a name under a speaker, a caption over a clip. You type it, drag it on the preview to where it should sit, and mark on the timeline when it appears and goes, with a short fade in and out or a straight cut. The text becomes part of the picture, so it shows in every player and on every site exactly as it looked here.",
      steps: [
        "Drop a video onto the page, or choose one from your device.",
        "Type the text; press Enter for a second line.",
        "Drag it on the preview, or pick one of the nine positions; drag its corner handle to resize it.",
        "Drag the timeline handles to choose when it shows, and pick a fade or an instant cut.",
        "Press Add text; the result plays in the preview, then download it.",
      ],
      goodToKnow: [
        "Text drawn into the picture is permanent: it cannot be turned off later, and the whole picture is encoded again to H.264 at a high bitrate to carry it. The sound is copied as it is whenever the container can hold it. If you want words viewers can switch on and off, such as dialogue in several languages, [add subtitles](/add-subtitles-to-video) as a separate track instead.",
        "Titles, captions and watermarks are different jobs. A watermark is a small, often faint mark that stays on for the whole video to say who made it; the [watermark tool](/add-watermark-to-video) is built for that, with a logo image and an opacity setting. Text here is meant to be read: it is solid, larger by default, can span several lines and shows only when you want it to.",
        "The size is the height of a line as a share of the picture, so Medium is the same proportion on a 720p clip and a 4K file: 8% of the height, which on a 1080p video is a 69-pixel font. Shadow keeps text clean on calm footage; Outline and Box keep it readable over snow, sky or busy scenes, where a shadow alone is lost.",
        "The text is drawn with Geist, the typeface of this site, at 600 weight. Letters outside the Latin alphabet fall back to the device's own font. The page draws the text once as an image at the video's own resolution, and that same image is placed over every frame, so what the preview shows is what the file will hold.",
        "A fade of half a second at each end is the default; set it to At once for a hard cut, or up to 3 seconds under More options. Files that only the ffmpeg engine reads, such as AVI, WMV or MPEG-TS, are handled the same way and come out as MP4.",
      ],
      faq: [
        {
          q: "Can I add text to only part of a video?",
          a: "Yes. Drag the handles on the timeline under the preview; the text shows only between them, fading in and out at each end unless you choose At once.",
        },
        {
          q: "Can I move the text anywhere, not only to a corner?",
          a: "Yes. Drag it on the preview to any spot, or focus it and use the arrow keys, with Shift for bigger steps. The nine positions snap it to an edge or corner with an even margin.",
        },
        {
          q: "Will adding text lower the quality?",
          a: "The picture is encoded again, which any tool that draws on video must do, at a high bitrate chosen for the video's size and frame rate. The sound is copied without change when the container allows.",
        },
        {
          q: "What is the difference between text and subtitles?",
          a: "Text here is drawn into the picture and always shows. A subtitle track is stored beside the picture, can be switched off, and holds many timed lines, which suits dialogue.",
        },
        {
          q: "Can I use more than one line?",
          a: "Yes. Press Enter in the text box for a new line. Long lines also wrap on their own before they reach the edges of the picture.",
        },
        {
          q: "Is the video uploaded?",
          a: "No. The text is drawn and the video is encoded in your browser; nothing leaves your device.",
        },
      ],
    },
  },
};
