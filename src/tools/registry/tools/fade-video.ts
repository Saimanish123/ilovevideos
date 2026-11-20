import type { ToolInput } from "../schema";

export const fadeVideo: ToolInput = {
  slug: "fade-video",
  engine: "video-fade",
  category: "edit",
  phase: "p2",
  backends: ["webcodecs", "ffmpeg-wasm"],
  accepts: ["video"],
  produces: "video",
  keywords: [
    "fade in fade out video",
    "add fade to video",
    "fade video to black",
    "video fade in online",
    "fade out end of video",
  ],
  aliases: [
    "fade in",
    "fade out",
    "fade to black",
    "fade from black",
    "dip to black",
    "transition",
  ],
  related: [
    "merge-videos",
    "trim-video",
    "black-and-white-video",
    "adjust-video-brightness",
    "loop-video",
    "add-intro-to-video",
  ],
  updatedAt: "2026-10-01",
  icon: "blend",
  illustration: "fade",
  content: {
    en: {
      title: "Fade a video in and out",
      subtitle: "From black at the start, to black or white at the end.",
      metaTitle: "Fade video in and out, free, no upload",
      metaDescription:
        "Add a fade in and a fade out to a video: drag the lengths on a timeline, choose black or white, and fade the sound with the picture. Free, no upload.",
      action: "Add fade",
      what: "This tool fades the start of a video in from black and the end out to black, or both from and to white, and can fade the sound over the same seconds. The fades are drawn over the filmstrip under the preview: drag the handle at either end to set how long each lasts, or pick a length in the panel. Every frame is re-encoded with the fade applied.",
      steps: [
        "Drop a video; a one-second fade appears at each end of the timeline.",
        "Drag the handles to lengthen or shorten each fade, or choose None, 0.5, 1, 2 or 3 seconds in the panel.",
        "Choose black or white, and whether the sound fades too.",
        "Press Add fade and download the result.",
      ],
      goodToKnow: [
        "A fade is a straight ramp: over the fade in, the picture goes from the fade colour to full brightness at an even rate, and the fade out mirrors it, reaching the colour as the clip ends. It is the same ramp as FFmpeg's fade filter, and the sound ramp matches FFmpeg's afade default.",
        "Fading the sound with the picture avoids the jolt of audio that starts or stops at full volume, and it is on by default. It means the sound is encoded once to AAC; with it off, the sound is copied untouched and only the picture fades, which suits a clip that will be joined to music later. For a colour look across the whole clip rather than at its ends, [add a filter](/add-filter-to-video).",
        "Each fade can be up to ten seconds, and the two never overlap: on a short clip they are held apart so that at least a moment plays at full brightness. For a dip to black between two clips, fade out the first, fade in the second, and join them with [merge videos](/merge-videos); the join is then an invisible cut between two frames that are nearly black.",
        "White suits bright, airy footage and wedding or holiday clips; black is the usual beginning and end of anything that looks like film. The fade colour is flat: to open on a title card or a logo and crossfade into the video instead, [add an intro and outro](/add-intro-to-video).",
        "The whole picture is re-encoded to H.264 because every frame near the ends changes, and it is simpler and safer to write one consistent file than to splice encoded and copied parts. Trim the clip first with [trim video](/trim-video) if the fade should land at a particular moment rather than the file's own start and end.",
      ],
      faq: [
        {
          q: "Can I fade only the start or only the end?",
          a: "Yes. Set the other fade to None, or drag its handle to the edge.",
        },
        {
          q: "Does the sound fade too?",
          a: "By default, yes, over the same seconds. Turn it off to keep the sound exactly as it is.",
        },
        {
          q: "How long can a fade be?",
          a: "Up to ten seconds at each end, and never longer than half the clip.",
        },
        {
          q: "Can I fade to white instead of black?",
          a: "Yes. The colour choice applies to both fades.",
        },
        {
          q: "Can I crossfade two videos?",
          a: "Not on this page. Fade the end of one and the start of the other, then merge them for a dip to black.",
        },
        {
          q: "Is my video uploaded?",
          a: "No. The fades are applied in your browser and the file never leaves your device.",
        },
      ],
    },
  },
};
