import { ffmpegDownloadSize } from "@/tools/engines/ffmpeg/size";
import type { ToolInput } from "../schema";

export const videoToGif: ToolInput = {
  slug: "video-to-gif",
  engine: "video-to-gif",
  category: "gif",
  phase: "p1",
  backends: ["webcodecs", "ffmpeg-wasm"],
  accepts: ["video"],
  produces: "gif",
  keywords: [
    "video to gif",
    "mp4 to gif",
    "convert video to gif",
    "gif maker",
    "make a gif from a video",
  ],
  aliases: ["gif", "animated gif", "mp4 to gif", "mov to gif", "gif converter"],
  related: ["gif-to-mp4", "screen-recorder", "trim-video", "video-to-webp", "video-to-avif"],
  updatedAt: "2026-09-30",
  icon: "image-play",
  content: {
    en: {
      title: "Make a GIF from video",
      subtitle: "From any part of a clip, with the file size shown first.",
      metaTitle: "Video to GIF online, free, no upload",
      metaDescription:
        "Make an animated GIF from MP4, MOV or WebM in your browser. Pick the range on a timeline, set width and frame rate, see the size first. No upload.",
      action: "Make GIF",
      what: "This tool takes a section of a video and writes it as an animated GIF: a series of still frames with a colour palette of at most 256 colours each and no sound. You choose the section on a filmstrip timeline, pick a width and a frame rate, and the estimated file size updates as you change them. The GIF is decoded, resized and encoded, then shown playing on the page at its real size before you download it.",
      steps: [
        "Drop a video onto the page or choose one from your device.",
        "Drag the two handles on the timeline to the moment you want, press I and O at the playhead, or type the start and end times as seconds. The preview plays the range muted and on repeat, as the GIF will.",
        "Choose a width and a frame rate and watch the estimated size, shown large above the button, change.",
        "Pick Fast for a quick result or Best for smoother colour, then press Make GIF.",
        "Check the preview and download the file.",
      ],
      goodToKnow: [
        "A GIF is a very inefficient video format. Every frame is stored as a full picture with its own 256-colour palette, compressed with a method from 1987 that knows nothing about motion. A GIF is very often larger than the video it was cut from; the result card shows both sizes side by side. Keep GIFs short, keep them small and keep the frame rate modest; that is why the range on this page opens at the first 15 s of the clip and the width defaults to 480 px. A clip that plays forwards and then backwards ends where it starts, so it loops without a jump: [make a boomerang](/boomerang-video) first and turn the result into a GIF.",
        "Frame rate is the biggest lever after length. Video is usually 30 or 60 frames per second; GIFs are almost never played that fast. 10 to 15 fps looks smooth for talking heads and screen recordings, 20 to 24 fps for fast action. Doubling the frame rate doubles the number of frames and roughly doubles the file. Frame delays in a GIF are stored in hundredths of a second, so the real playback rate is rounded: 12 fps becomes an 80 ms delay, which plays at 12.5 fps.",
        `Fast and Best differ in how the 256 colours are chosen. Fast quantises a fresh palette for every frame, which is quick and looks right for most footage. Best builds one palette from the whole clip and then dithers each frame against it with an error-diffusion pattern. Dithering hides banding in skies, gradients and skin, at the cost of a slightly larger file and a longer wait; Best needs a one-time download of about ${ffmpegDownloadSize()}. Where 256 colours are not enough, [an animated PNG](/video-to-apng) keeps every pixel exactly, at a larger size.`,
        "Width matters more than it seems because the file grows with the area of the picture. Going from 480 px to 720 px wide more than doubles the pixels per frame. Chat apps and web pages display GIFs small, so 360 or 480 px wide is enough for most uses; keep the original size only for a GIF that will be viewed on its own. The height follows the aspect ratio of the video and rotation metadata from phones is applied, so a portrait clip stays portrait.",
        "GIF has no audio track, so any sound in the range is dropped. If you want a short, silent, looping clip with sound left out but far smaller, a trimmed MP4 or WebM, or [an animated WebP](/video-to-webp), is usually the better choice: [trim the video](/trim-video) first and then [compress it](/compress-video). Most social platforms play a muted looping MP4 in place of a GIF anyway. A GIF is still the right pick when the destination only accepts images, such as a README, an email signature or a chat sticker. Going the other way, [GIF to MP4](/gif-to-mp4) turns a GIF into an H.264 video that keeps its frame timing.",
        "The loop option decides what happens after the last frame. Looping is the default and what most people expect; turn it off for a one-shot animation such as a demonstration that should end on its final state. Some places that host GIFs re-encode uploads and may ignore the loop setting or resize the picture, so check the result where it will actually be shown.",
      ],
      faq: [
        {
          q: "Why is my GIF larger than the video it came from?",
          a: "Because GIF stores every frame as a full palette image and cannot reuse the previous frame the way video codecs do. Shorten the range, lower the frame rate or reduce the width; each of these cuts the size roughly in proportion.",
        },
        {
          q: "How long can the GIF be?",
          a: "There is no hard limit on this page, but the range opens at the first 15 s and the estimate updates as you change the range, width and frame rate. Long GIFs grow quickly, and the site you send them to may have its own size limit.",
        },
        {
          q: "Which frame rate should I use?",
          a: "Start at 12 fps. Drop to 8 or 10 for a screen recording or a clip with little motion; raise to 20 or 24 only for fast action where stutter would show.",
        },
        {
          q: "Does the GIF keep the sound?",
          a: "No. The GIF format has no audio. If sound matters, [trim the video](/trim-video) instead and share it as MP4.",
        },
        {
          q: "What is the difference between Fast and Best?",
          a: `Fast picks a palette per frame. Best builds one palette for the whole clip and dithers, which smooths gradients and reduces banding, takes longer and needs a one-time download (about ${ffmpegDownloadSize()}).`,
        },
        {
          q: "Is the video uploaded to a server?",
          a: "No. Decoding, resizing and GIF encoding run in your browser. The file never leaves your device.",
        },
        {
          q: "Why does the estimate differ from the final size?",
          a: "The estimate is a rule of thumb based on frames and pixels. Flat graphics and screen recordings compress far better than camera footage with noise or grain, so the real file can land below or above it. The exact size is shown as soon as the GIF is made.",
        },
      ],
    },
  },
};
