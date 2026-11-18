import type { ToolInput } from "../schema";

export const addIntroToVideo: ToolInput = {
  slug: "add-intro-to-video",
  engine: "intro-outro",
  category: "edit",
  phase: "p3",
  backends: ["webcodecs"],
  accepts: ["video"],
  produces: "video",
  keywords: [
    "add intro to video",
    "add outro to video",
    "add title card to video",
    "add end card to video",
    "add logo intro to video",
    "put a title at the start of a video",
  ],
  aliases: ["intro", "outro", "title card", "end card", "end screen", "opening title", "bumper"],
  related: [
    "merge-videos",
    "add-text-to-video",
    "fade-video",
    "add-watermark-to-video",
    "add-timer-to-video",
    "compress-video",
  ],
  updatedAt: "2026-11-18",
  icon: "clapperboard",
  content: {
    en: {
      title: "Add an intro and outro to a video",
      subtitle:
        "Open with a title card, a logo or a clip, and close with an end card, fitted to your video.",
      metaTitle: "Add an intro and outro to a video online, free",
      metaDescription:
        "Put a title card, picture or clip before and after a video, fitted to its size and frame rate, with crossfades. Runs in your browser; nothing is uploaded.",
      action: "Add intro and outro",
      what: "This tool puts something before your video, after it, or both: a title card made here from your text and a colour, a still picture such as a logo for a few seconds, or a short clip. Whatever goes in is fitted to the video's own frame and frame rate, and the parts can crossfade into each other, picture and sound together, so the result plays as one finished video.",
      steps: [
        "Drop the main video onto the page; a title card is ready as its intro.",
        "Type the title and pick the card's colour, or switch the intro to a picture or a clip.",
        "Choose an outro the same way, or leave it at None.",
        "Pick Crossfade or Cut between the parts.",
        "Press Add intro and outro, play the result in the preview, then download it.",
      ],
      goodToKnow: [
        "The main video sets the shape of the result. A square logo on a widescreen video is shown whole with bars in the colour you choose, or made to fill the frame with its edges cut, under More options. A clip shot at another frame rate is drawn on the main video's frame grid, and each of the main video's own frames takes the nearest slot on that grid, so the result plays at one constant rate, the main video's, from start to finish.",
        "A crossfade overlaps the parts by its length, half a second by default, so the result is shorter than the parts added up by one fade at each join. The sound fades with the picture using equal-power curves, which keep the loudness steady through the join. Title cards and pictures are silent; a clip's own sound is kept and resampled to the main video's rate.",
        "The title card is drawn in the Geist typeface bundled with this site, bold and centred, sized down until it fits. Dark colours get white text and light colours near-black text. For a title over the video itself rather than on a card of its own, [add text to the video](/add-text-to-video) instead.",
        "Everything is encoded once to H.264 at a bitrate close to the main video's, with the sound in AAC, because a title card or a clip cannot be slotted into an existing file without making one consistent stream. To join several finished clips end to end, as they are and losslessly where they match, [merge videos](/merge-videos) is the tool. An intro or outro clip can be up to 5 minutes long.",
        "The same intro and outro can go on several videos in one go: drop them all, set the cards once, and each video gets its own copy fitted to it. A file that only the fallback engine can read, such as an AVI, needs converting to MP4 first.",
      ],
      faq: [
        {
          q: "Can I use my logo as an intro?",
          a: "Yes. Switch the intro to Picture and choose a PNG, JPEG or WebP file; it shows for 3 seconds by default, fitted inside the frame on the bar colour.",
        },
        {
          q: "What happens if my intro clip is a different size from my video?",
          a: "It is fitted to the main video's frame, whole with bars or filling the frame with the edges cut, and drawn at the main video's frame rate.",
        },
        {
          q: "Will the result be longer than my video?",
          a: "Yes, by the intro and outro lengths, less one crossfade at each join when Crossfade is chosen. The summary under the options gives the total before you start.",
        },
        {
          q: "Does adding an intro lower the video's quality?",
          a: "The whole video is encoded once more at a bitrate close to the original's, which costs very little. Merge videos keeps clips untouched when they already match.",
        },
        {
          q: "Is my video uploaded?",
          a: "No. The title card is drawn, a logo or clip is read, and the whole result is encoded in your browser; none of the files leaves your device.",
        },
      ],
    },
  },
};
