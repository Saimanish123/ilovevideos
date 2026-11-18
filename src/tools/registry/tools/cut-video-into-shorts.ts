import { framePlatforms } from "@/content/platforms/frames";
import type { ToolInput } from "../schema";

const shorts = framePlatforms["youtube-shorts"];
// The length and its date come from the dated profile only; without them the build fails.
const maxSec = shorts.maxSec;
const firstSource = shorts.sources[0];
if (maxSec === undefined || firstSource === undefined)
  throw new Error("cut-video-into-shorts: the youtube-shorts profile needs maxSec and a source");
const checked = firstSource.checked.slice(0, 7);
const maxWords =
  maxSec % 60 === 0
    ? `${maxSec / 60} ${maxSec === 60 ? "minute" : "minutes"}`
    : `${maxSec} seconds`;

export const cutVideoIntoShorts: ToolInput = {
  slug: "cut-video-into-shorts",
  engine: "clips",
  category: "edit",
  phase: "p3",
  backends: ["webcodecs"],
  accepts: ["video"],
  produces: "video",
  keywords: [
    "cut video into shorts",
    "split long video into clips for tiktok",
    "turn a long video into reels",
    "video to shorts",
    "make shorts from a long video",
  ],
  aliases: ["shorts maker", "reels clips", "tiktok clips", "clips for shorts", "clip a podcast"],
  related: [
    "split-video",
    "resize-video-for-youtube-shorts",
    "change-video-aspect-ratio",
    "remove-silence-from-video",
    "compress-video",
  ],
  sources: shorts.sources.map((x) => ({ title: x.title, url: x.url, checked: x.checked })),
  updatedAt: "2026-11-18",
  icon: "smartphone",
  illustration: "shorts-clips",
  content: {
    en: {
      title: "Cut a video into clips for Shorts, Reels and TikTok",
      subtitle:
        "Split a long video into short vertical clips, cut at pauses and scene changes. In your browser.",
      metaTitle: "Cut a video into Shorts and Reels, free",
      metaDescription:
        "Turn a long video into short clips: boundaries at pauses and scene changes, a 9:16 frame you place per clip, all clips in one ZIP. Free, no upload.",
      action: "Cut clips",
      what: "This tool turns one long video, a podcast, a stream recording, a talk, into a set of short clips for vertical feeds. It listens for pauses and looks for scene changes, and proposes clip boundaries at those moments so no clip starts mid-word. You can move any boundary, skip clips you do not want, and give each clip its own vertical framing before everything is written as separate MP4 files in one ZIP.",
      steps: [
        "Drop a long video; one-minute clips are proposed straight away, then moved to pauses and scene changes as they are found.",
        `Pick the longest clip you want, from 15 seconds to ${maxWords}; the boundaries are proposed again.`,
        "Drag a boundary on the timeline to move it, split a clip at the playhead, and untick the clips to leave out.",
        "For each clip, drag the 9:16 frame on the picture over the part that matters, then press Cut clips and download the ZIP.",
      ],
      goodToKnow: [
        `${shorts.name} accepts uploads of up to ${maxWords} (checked ${checked}), which is the longest choice here. This page has no checked length limit for TikTok or Instagram Reels, so it states none; check the app before posting a long clip. A clip that ends up longer than the length you chose, because you moved a boundary, is marked on the timeline and in the list.`,
        "A boundary is proposed at the best pause or scene cut in the second half of the length, with scene cuts and later moments preferred, so clips use most of their length and start cleanly. Pauses are found the way [remove silence](/remove-silence-from-video) finds them, from the recording's own noise floor. Scene changes are found by comparing key frames, the frames an encoder stores whole, which most encoders place at a cut; a recording with a fixed key frame interval can put a scene boundary up to one interval late, and in a single continuous shot there are none, so the pauses carry the proposal alone.",
        "Crop cuts a 9:16 window out of the full height of a landscape picture, at most 1080×1920 and never enlarged, so a 1080p source gives 606×1080 clips; the window can be placed differently in every clip. Blurred bars keep the whole picture across the middle of a 9:16 frame over a blurred, darkened copy of itself. Keep shape on a landscape source gives a landscape clip, which the platforms do not show as a Short. A video that is already vertical keeps its shape.",
        "Each clip is cut at its exact times, frame for frame, and re-encoded to H.264 with AAC sound (Opus where the browser has no AAC encoder), with a five-millisecond fade at each cut so the sound does not click. That is different from [split video](/split-video), which cuts a file into parts at times you set and can copy them losslessly at key frames, but neither listens for pauses nor reframes. To reframe a single clip without cutting it, use [resize for YouTube Shorts](/resize-video-for-youtube-shorts).",
      ],
      faq: [
        {
          q: "How long can each clip be?",
          a: `Choose 15 seconds, 30 seconds, 1 minute, 90 seconds or ${maxWords}. Boundaries are proposed so no clip is longer, and you can move them.`,
        },
        {
          q: "Will clips cut people off mid-sentence?",
          a: "Boundaries are placed in pauses where there are any. Play the preview at a boundary and drag it if a cut still lands badly.",
        },
        {
          q: "Can I choose which part of a wide video each clip shows?",
          a: "Yes. With Crop, drag the frame on the picture while the playhead is in a clip; each clip keeps its own position.",
        },
        {
          q: "Can I skip some clips?",
          a: "Yes. Untick them in the list; only ticked clips are written.",
        },
        {
          q: "How are the clips delivered?",
          a: "As separate MP4 files, numbered in order, which you can download one by one or together as a ZIP.",
        },
        {
          q: "Is my video uploaded?",
          a: "No. It is analysed and cut in your browser, and nothing leaves your device.",
        },
      ],
    },
  },
};
