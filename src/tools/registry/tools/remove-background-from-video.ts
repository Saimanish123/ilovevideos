import type { ToolInput } from "../schema";

export const removeBackgroundFromVideo: ToolInput = {
  slug: "remove-background-from-video",
  engine: "portrait-matte",
  category: "edit",
  phase: "p3",
  backends: ["webcodecs"],
  accepts: ["video"],
  produces: "video",
  presetOptions: { effect: "color" },
  keywords: [
    "remove background from video",
    "video background remover",
    "change video background",
    "change video background without green screen",
    "replace video background",
    "virtual background for video",
  ],
  aliases: ["background remover", "change background", "replace background"],
  related: [
    "blur-video-background",
    "remove-green-screen-from-video",
    "add-image-to-video",
    "picture-in-picture-video",
    "compress-video",
  ],
  updatedAt: "2026-11-19",
  icon: "square-user",
  illustration: "background-replace",
  content: {
    en: {
      title: "Remove the background from a video",
      subtitle: "Put a new background behind a person in a video.",
      metaTitle: "Remove background from video online, free",
      metaDescription:
        "Cut the person out of a video and put a colour, an image or another video behind them, no green screen. Free, runs on your device, no upload.",
      action: "Remove background",
      what: "This tool cuts the person out of each frame of an ordinary video and puts something else behind them: a plain colour, a still picture or another video. No green screen is needed; a small model finds the person. It can also save the cut-out itself as a black-and-white mask video, for an editor that keys with a matte.",
      steps: [
        "Drop a video with a person in it; the person finder loads once you do.",
        "Choose what goes behind them: a colour, a picture or a video.",
        "Check the edge in the preview, and under More options move or soften it if needed.",
        "Press Remove background (Replace background for a picture or video) and download the result, or choose Mask only under More options to save the cut-out.",
      ],
      goodToKnow: [
        "Removing a background without a screen is a guess about every pixel, made by a small person-finding model of about 330 kB, fetched from this site the first time you choose a video here. It is good enough for a talking head and visibly short of a studio key: loose hair and fingers are where it goes wrong first.",
        "Edge pixels are part person and part old room. Where the outline is soft, the room's share of the colour is estimated from the room just around the person and swapped for the new background, so a white wall behind you leaves less of a pale rim on a dark new backdrop. Edge in or out under More options pulls the outline in or lets it out; Edge softness sets how wide the blend is.",
        "The output always has a solid background, because no video format plays with transparency in both Chrome and Safari. For compositing elsewhere, choose Mask only under More options: it writes a black-and-white video of the same size and length, white where the person is, which video editors take as a luma matte. A bright green colour behind the person is another route, to key out later.",
        "A background picture or video fills the frame and is cut at its edges when its shape differs; Fit inside shows all of it with the colour around it. A background video shorter than yours loops or holds its last frame. The model works best on people within about 2 m of the camera; a whole body seen from afar, motion blur and dim light lose detail. With a real green or blue screen, [remove the green screen](/remove-green-screen-from-video) is sharper, and to keep the room but soften it, [blur the background](/blur-video-background).",
        "The picture is encoded once more to H.264 and the sound is copied unchanged where the container allows, or left out with No sound. The mask is written without sound.",
      ],
      faq: [
        {
          q: "Can I get a video with a transparent background?",
          a: "No. Chrome and Safari cannot both write and play one. Make the mask instead (Mask only under More options) and use it as a matte in your editor, or put a plain green behind the person and key it there.",
        },
        {
          q: "Why does a thin outline of the old room show?",
          a: "The cut is a little loose on those frames. Lower Edge in or out under More options, and keep the person well lit and apart from the wall when you film.",
        },
        {
          q: "Why are parts of my hair or hands missing?",
          a: "The model was unsure there. Raise Edge in or out and Edge softness under More options; very fine strands cannot be kept the way a green screen keeps them.",
        },
        {
          q: "Will it cut out the furniture or a pet too?",
          a: "Usually not. It looks for people, so furniture and pets go with the background, and everyone in the frame counts as a person. Things touching or close to the person can stay with them, such as a cup held near the face.",
        },
        {
          q: "Can I put another video behind the person?",
          a: "Yes. Choose Video and pick the file. If it is shorter than yours it loops, or holds its last frame if you prefer.",
        },
        {
          q: "Is my video uploaded?",
          a: "No. The person finder runs in your browser and the video is written there. Nothing is sent anywhere.",
        },
      ],
    },
  },
};
