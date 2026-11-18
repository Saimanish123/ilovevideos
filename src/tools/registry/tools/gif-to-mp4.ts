import { ffmpegDownloadSize } from "@/tools/engines/ffmpeg/size";
import type { ToolInput } from "../schema";

/** GIF → MP4 (feature B5). The gif-to-video engine; WebM output exists in the engine but has no page yet. */
export const gifToMp4: ToolInput = {
  slug: "gif-to-mp4",
  engine: "gif-to-video",
  category: "gif",
  phase: "p1",
  backends: ["webcodecs", "ffmpeg-wasm"],
  accepts: ["gif"],
  produces: "video",
  presetOptions: { to: "mp4" },
  keywords: [
    "gif to mp4",
    "convert gif to mp4",
    "gif to video",
    "gif to mp4 converter",
    "animated gif to mp4",
  ],
  aliases: ["gif to video", "animated gif"],
  related: [
    "video-to-gif",
    "images-to-video",
    "add-audio-to-video",
    "compress-video",
    "trim-video",
    "video-converter",
    "change-video-speed",
  ],
  updatedAt: "2026-09-30",
  icon: "film",
  content: {
    en: {
      title: "Convert GIF to MP4",
      subtitle:
        "Turn an animated GIF into a small MP4 that plays everywhere. Runs in your browser.",
      metaTitle: "GIF to MP4 converter online, free, no upload",
      metaDescription:
        "Convert an animated GIF to MP4 in your browser. Every frame keeps its timing, and the file is usually far smaller. Nothing is uploaded. Free.",
      what: "This tool turns an animated GIF into an MP4 video. Your browser decodes every frame with its own delay, draws it onto a frame with even edges and encodes it as H.264, so the MP4 plays at the speed the GIF did and works anywhere a video works: chat apps, social posts, slides and editors. It runs on your device and the GIF is never uploaded.",
      steps: [
        "Drop an animated .gif onto the page or choose one from your device.",
        "Check the frame count and length, and choose how many times the animation should play.",
        "Press Convert and watch the frames being encoded.",
        "Play the MP4 in the preview, then download it. The GIF is untouched.",
      ],
      goodToKnow: [
        "A GIF stores every frame as a picture of at most 256 colours, compressed with LZW, a lossless scheme from the 1980s that knows almost nothing about motion. H.264 predicts each frame from the ones before it and stores only what changed. That is why a GIF of real footage is usually several times the size of the same frames as an MP4, and why sites that accept both load the video faster. The result card shows the real before and after sizes for your file.",
        "GIF delays are counted in hundredths of a second, and browsers play a declared delay of 0 or 1 as 10 hundredths, a rule that dates from early encoders writing 0 to mean as fast as possible. The MP4 keeps each delay as your browser played it, frame by frame, so a GIF that pauses on its last frame still pauses. The video's frame rate is therefore variable, which every current player handles.",
        "A GIF carries its own loop count, usually forever. An MP4 has no such flag: whether it repeats is up to the player or the page that shows it, and a web page's video tag loops only when told to. If the video has to last longer on its own, for a slide, a story or an app that plays a video once and stops, choose 2, 3 or 5 plays and the frames are written that many times in a row.",
        "MP4 video has no transparency, so transparent areas become white. The colours stay those of the GIF's palette; H.264 cannot bring back colours the GIF threw away, and its colour sampling can soften sharp coloured edges in pixel art and text slightly. H.264 also needs even width and height, so a GIF 301 pixels wide comes out 300 wide.",
        "A GIF has no sound, so the MP4 has no sound track either. If the result is still too big to send, [compress video](/compress-video) makes it smaller at a size you choose; going the other way, [video to GIF](/video-to-gif) makes a GIF from a clip.",
      ],
      faq: [
        {
          q: "Why is the MP4 so much smaller than the GIF?",
          a: "GIF compresses each frame on its own with a limited palette, while H.264 stores only the changes between frames. For anything with motion or photographic colour the difference is large.",
        },
        {
          q: "Will the MP4 loop like the GIF did?",
          a: "Only if the app or page playing it loops videos. MP4 has no loop setting, so choose several plays when the video has to repeat by itself.",
        },
        {
          q: "Does the MP4 keep the GIF's speed?",
          a: "Yes. Every frame keeps the delay your browser gave it, including long pauses, so the video runs exactly as long as one pass of the GIF.",
        },
        {
          q: "What happens to a transparent background?",
          a: "It becomes white, because MP4 video cannot store transparency. Stickers and logos cut out on transparency look as they would on a white page.",
        },
        {
          q: "Which browsers can do this?",
          a: `Browsers with the WebCodecs image decoder, such as Chrome and Edge, do it natively. Others use the ffmpeg engine instead, a one-time download of about ${ffmpegDownloadSize()}; the line under the controls says which one will run.`,
        },
        {
          q: "Is my GIF uploaded anywhere?",
          a: "No. It is decoded and encoded inside this browser tab, and the MP4 is written on your device.",
        },
      ],
    },
  },
};
