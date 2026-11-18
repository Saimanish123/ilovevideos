import type { ToolInput } from "../schema";

export const changeVideoFrameRate: ToolInput = {
  slug: "change-video-frame-rate",
  engine: "framerate",
  category: "edit",
  phase: "p2",
  backends: ["webcodecs", "ffmpeg-wasm"],
  accepts: ["video"],
  produces: "video",
  keywords: [
    "change video frame rate",
    "convert 60fps to 30fps",
    "change fps of video",
    "30fps to 24fps",
    "reduce video frame rate",
  ],
  aliases: ["fps", "frames per second", "frame rate converter", "60 to 30", "24 fps", "film look"],
  related: [
    "change-video-speed",
    "compress-video",
    "change-video-codec",
    "video-info",
    "hevc-to-h264",
    "change-video-bitrate",
  ],
  updatedAt: "2026-10-01",
  icon: "clapperboard",
  illustration: "framerate",
  content: {
    en: {
      title: "Change video frame rate",
      subtitle:
        "Lower a video's frame rate to 30, 25, 24 or 15 fps by dropping frames. Runs in your browser.",
      metaTitle: "Change video frame rate, free, no upload",
      metaDescription:
        "Convert 60 fps to 30, 30 to 24 or any rate below the source. Frames are dropped, never blended; the sound is copied. Free, runs on your device.",
      what: "This tool writes a new copy of a video at a lower, constant frame rate. It keeps the frames that land on the new rate's ticks and drops the rest, so the length, the picture size and the sound stay as they were. The panel shows the frame count before and after and says whether the drop is even (every second frame) or uneven (one frame in five), which decides how smooth the result looks.",
      steps: [
        "Drop a video onto the page; the panel reads its current frame rate.",
        "Pick a new rate from the rates below the source, or type an exact one such as 23.976.",
        "Read the line under the numbers: an even drop keeps motion smooth, an uneven one steps a little on pans.",
        "Press Change frame rate and download the result; the preview plays it first.",
      ],
      goodToKnow: [
        "Halving is the clean case. 60 fps to 30 keeps every second frame, 50 to 25 the same, so motion stays exactly as even as it was, only coarser. Rates that do not divide the source are uneven: 30 fps to 24 drops one frame in every five, and a slow pan or scrolling text then advances in a repeating short-short-short-long rhythm. For footage that has to look like film, shooting at 24 in the first place avoids that.",
        "Frames are dropped, never blended or invented. Some tools offer frame blending (ffmpeg's framerate filter) or motion interpolation (its minterpolate filter); both smear or warp moving edges and are very slow in a browser, so this page does neither. For the same reason it only lowers the rate: raising 30 fps to 60 without interpolation would repeat every frame, doubling the work for nothing visible.",
        "The result is always constant frame rate at the lower rate you choose. Many phones and screen recorders write variable frame rate, where the gap between frames changes with the light or the load, and some editors handle that poorly; lowering such a clip also evens it out. A constant-rate copy at the same rate the file already averages is not offered here, because the page only lowers the rate; [video info](/video-info) shows the average this tool reads.",
        "The picture is re-encoded to H.264 at a bitrate matched to the new rate, so fewer frames also means a smaller file; the panel's estimate shows how much. The sound is copied as it is whenever the container holds it, so it does not lose any quality. To make the file smaller still, [compress video](/compress-video) works on the result.",
        "25 and 50 fps are the rates of television in countries with 50 Hz mains, 30 and 60 the rates of phones and most of the web, 24 the rate of cinema. Changing the rate does not change the speed: to slow a 60 fps clip down to half speed with every frame kept, use [change video speed](/change-video-speed) instead.",
      ],
      faq: [
        {
          q: "Does lowering the frame rate change the length or the speed?",
          a: "No. The video keeps its length and plays at the same speed; each second simply holds fewer pictures.",
        },
        {
          q: "Why is 30 fps to 24 fps less smooth than 60 to 30?",
          a: "Because 24 does not divide 30. One frame in five is dropped, so motion advances unevenly, which shows on slow pans and scrolling text.",
        },
        {
          q: "Can I increase the frame rate?",
          a: "Not here. Without motion interpolation a higher rate only repeats frames, so the page offers rates below the source's only.",
        },
        {
          q: "Is the sound affected?",
          a: "No. It is copied unchanged when the container holds it, and encoded once to AAC only when it does not, which the panel says before you start.",
        },
        {
          q: "Will a lower frame rate make the file smaller?",
          a: "Usually yes: the bitrate is set for the new rate, so there is less picture to store. The panel estimates the size and the result shows the real one.",
        },
        {
          q: "Is my video uploaded?",
          a: "No. It is decoded and re-encoded in your browser; nothing leaves your device.",
        },
      ],
    },
  },
};
