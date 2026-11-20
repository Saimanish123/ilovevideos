import type { ToolInput } from "../schema";

export const removeGreenScreenFromVideo: ToolInput = {
  slug: "remove-green-screen-from-video",
  engine: "chroma-key",
  category: "edit",
  phase: "p3",
  backends: ["webcodecs"],
  accepts: ["video"],
  produces: "video",
  keywords: [
    "remove green screen from video",
    "remove green screen",
    "green screen video",
    "chroma key video",
    "replace green screen background",
    "blue screen video",
    "green screen background",
  ],
  aliases: ["chroma key", "keying", "blue screen"],
  related: [
    "remove-background-from-video",
    "add-image-to-video",
    "blur-video",
    "trim-video",
    "change-video-aspect-ratio",
    "compress-video",
  ],
  updatedAt: "2026-11-19",
  icon: "layers",
  content: {
    en: {
      title: "Remove the green screen from a video",
      subtitle: "Put a colour, a picture or another video behind you.",
      metaTitle: "Remove green screen from video online, free",
      metaDescription:
        "Key out a green or blue screen and put a colour, an image or a video behind the subject. Live preview, soft edges, spill removal. Nothing is uploaded.",
      action: "Remove green screen",
      what: "This tool takes a video shot in front of a green or blue screen and puts something else behind the person or object in it: a plain colour, a still picture or another video. The screen's colour is found on its own from the edges of the picture, and you can tap the screen on the preview to pick it yourself. The preview shows the finished result as it plays, so you can judge the edges before anything is written.",
      steps: [
        "Drop the green screen video onto the page; the screen colour is read from the edges of the picture.",
        "If the preview still shows patches of screen, tap the screen on the picture to pick its colour.",
        "Choose the background: a colour, a picture, or a video that loops or holds its last frame.",
        "Under More options, adjust tolerance, softness and spill if the edges need it.",
        "Press Remove green screen, check the result in the preview, then download it.",
      ],
      goodToKnow: [
        "Real screens are never evenly lit: the middle is brighter than the corners and the subject casts shadows on it. Instead of comparing every pixel with one green, the keyer estimates the screen's own colour around each pixel from the clear screen nearby, so a screen that fades from bright to dim is removed alike from corner to corner.",
        "Hair, motion blur and the soft edge of a shoulder are partly screen and partly subject. For those pixels the screen's share of the colour is taken out and the new background put in its place, so a strand of hair keeps its own colour instead of a green or black outline. Softness sets how wide that blend is; lower it for crisp, solid edges such as a product on a turntable.",
        "Light bouncing off the screen tints the subject's edges green, which is called spill. Spill removal holds the screen's colour channel down to the brighter of the other two, which leaves skin, wood and yellow alone but turns green clothing grey, so lower it if the subject wears the screen's colour. A blue screen works the same way with blue in place of green.",
        "A background picture or video fills the frame by default and is cut at its edges when its shape differs; Fit inside shows all of it with the colour around it. A background video shorter than the foreground loops, or holds its last frame if you choose. The sound is the foreground video's own, copied unchanged where the container allows, or left out with No sound; to put music under it, use [add audio](/add-audio-to-video) on the result.",
        "The whole picture is encoded once more to H.264. The output always has a solid background: no video format was found that both Chrome and Safari can write and play back with transparency. To place the keyed subject over other footage, choose that footage as the background video here.",
      ],
      faq: [
        {
          q: "Does it work with a blue screen?",
          a: "Yes. The colour is read from the edges of the picture, green or blue, and you can tap the screen on the preview to pick it.",
        },
        {
          q: "Why do parts of the screen stay?",
          a: "Those parts are darker or more washed out than the rest. Tap one of them to pick its colour, or raise Tolerance under More options.",
        },
        {
          q: "Why is there a green edge around the person?",
          a: "Light from the screen has tinted the edges. Raise Spill under More options, and keep some distance between the person and the screen when you film next time.",
        },
        {
          q: "Can I put another video behind the subject?",
          a: "Yes. Choose Video as the background. If it is shorter than the foreground it loops, or holds its last frame if you prefer.",
        },
        {
          q: "Can I get a transparent video out?",
          a: "No. The result always has a solid background: a colour, a picture or a video of your choice.",
        },
        {
          q: "Can it remove the background from a video without a green screen?",
          a: "This keyer needs an evenly coloured green or blue screen behind the subject. For ordinary footage of a person, [remove the background from a video](/remove-background-from-video) finds the person with a small model instead; its edges are softer than a good key.",
        },
        {
          q: "Is my video uploaded?",
          a: "No. The keying and the encoding run in your browser, and nothing is sent anywhere.",
        },
      ],
    },
  },
};
