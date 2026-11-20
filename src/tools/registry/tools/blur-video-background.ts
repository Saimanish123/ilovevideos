import type { ToolInput } from "../schema";

export const blurVideoBackground: ToolInput = {
  slug: "blur-video-background",
  engine: "portrait-matte",
  category: "edit",
  phase: "p3",
  backends: ["webcodecs"],
  accepts: ["video"],
  produces: "video",
  presetOptions: { effect: "blur" },
  keywords: [
    "blur video background",
    "blur background of video",
    "blur background in video",
    "background blur video",
    "portrait mode video",
    "bokeh video background",
  ],
  aliases: ["background blur", "portrait mode", "bokeh"],
  related: [
    "remove-background-from-video",
    "blur-video",
    "remove-green-screen-from-video",
    "crop-video",
    "compress-video",
  ],
  updatedAt: "2026-11-19",
  icon: "user-round",
  illustration: "background-blur",
  content: {
    en: {
      title: "Blur the background of a video",
      subtitle: "Keep the person sharp, no green screen needed.",
      metaTitle: "Blur video background online, free, no upload",
      metaDescription:
        "Blur the room behind the person in a video, no green screen needed. A small model finds the person on your device. Free, nothing is uploaded.",
      action: "Blur background",
      what: "This tool finds the person in every frame of a video and blurs everything else, the way a video call's background blur does, but on a file you already recorded. The person is found by a small model, so it works on a webcam clip, a phone selfie video or an interview filmed in an untidy room. The preview shows the blurred result as the video plays, before anything is written.",
      steps: [
        "Drop a video with a person in it; the person finder loads once you do.",
        "Watch the preview and set how strong the blur should be.",
        "Under More options, soften or tighten the edge around the person if you need to.",
        "Press Blur background and download the result when it is written.",
      ],
      goodToKnow: [
        "The person is found by a small person-finding model of about 330 kB, downloaded from this site the first time you choose a video here. Wide videos use the model's 256×144 version and vertical or square ones its 256×256 version, so neither is squashed much.",
        "The model was made for people close to the camera, about 2 m or nearer, as on a video call. Head and shoulders come out best. A whole body far away, fast movement, low light and a background close in colour to clothes or hair make the outline less certain, and loose hair and fingers are its weakest parts. Everyone in the frame counts as the person, so two people both stay sharp, and an object held in front of the body may stay sharp or not.",
        "The model works on a small copy of each frame, so its outline is blocky at full size. Each outline is then fitted to the real edges of the frame with a guided filter, and where the model hesitates from one frame to the next (the flicker you see on hair and shoulders) the mask leans on the frames just before and after. Because a recorded file is known in advance, the next frame is used as well as the previous one, which a live call cannot do.",
        "The blur leaves the person out of what it blurs, so their colours do not smear into a halo around them. Blur strength is relative to the frame: 40, the default, is a Gaussian blur of 2% of the frame's shorter side, about 22 px on a 1080p video. To hide one face, a plate or a screen and leave the rest alone, [blur part of a video](/blur-video) is the right tool.",
        "The whole picture is encoded once more to H.264 at about the bitrate of the original, and the sound is copied unchanged where the container allows. A video without a person in it comes out blurred all over. To put a colour, a picture or another video behind the person instead, use [remove the background from a video](/remove-background-from-video).",
      ],
      faq: [
        {
          q: "Do I need a green screen?",
          a: "No. The person is found by a model that looks at the picture itself. With a green screen behind you, [remove the green screen](/remove-green-screen-from-video) gives cleaner edges than any model.",
        },
        {
          q: "Why is part of the person blurred too?",
          a: "The model was unsure there, often at loose hair, hands or a dark jumper against a dark wall. Raise Edge in or out under More options to keep more around the person.",
        },
        {
          q: "Why does a thin rim of the room stay sharp around the person?",
          a: "The outline is slightly loose on that frame. Lower Edge in or out under More options to pull it in.",
        },
        {
          q: "Does it work with several people in the frame?",
          a: "Yes. Everyone the model sees as a person stays sharp. It cannot keep one person sharp and blur another.",
        },
        {
          q: "How long does it take?",
          a: "Each frame is found, refined and encoded using the graphics chip, so on a recent computer a 1080p clip usually takes less time than it plays; phones and older computers are slower.",
        },
        {
          q: "Is my video uploaded?",
          a: "No. The model file is downloaded from this site once, and the video is processed in your browser. Nothing is sent anywhere.",
        },
      ],
    },
  },
};
