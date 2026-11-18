import type { ToolInput } from "../schema";

export const screenRecorder: ToolInput = {
  slug: "screen-recorder",
  engine: "screen-record",
  category: "record",
  phase: "p2",
  backends: ["webcodecs"],
  accepts: ["video"],
  produces: "video",
  keywords: [
    "screen recorder",
    "record screen online",
    "screen recorder with audio",
    "record my screen",
    "screen recording to mp4",
  ],
  aliases: ["screen capture", "record tab", "record window", "screencast", "record desktop"],
  related: [
    "webcam-recorder",
    "voice-recorder",
    "trim-video",
    "compress-video",
    "video-to-gif",
    "optimize-video-for-web",
  ],
  updatedAt: "2026-11-18",
  icon: "monitor",
  content: {
    en: {
      title: "Record your screen",
      subtitle:
        "Record a tab, a window or your whole screen to MP4, with your voice, in your browser.",
      metaTitle: "Screen recorder online, free, no upload",
      metaDescription:
        "Record a browser tab, a window or the whole screen with your microphone and a camera bubble. Saved as MP4 on your device. Free, no account, no watermark.",
      action: "Record",
      what: "This page records what you share from your screen: one browser tab, one window or a whole display. It can add your microphone, the tab's own sound and a round camera bubble in a corner, and it writes an MP4 file while you record, so there is nothing to convert when you stop.",
      steps: [
        "Choose whether to record your microphone, the shared sound and a camera bubble.",
        "Press Start recording and pick a tab, a window or a screen in the browser's dialog.",
        "Pause and resume as often as you need; the paused stretches are left out of the file.",
        "Press Stop, or Stop sharing in the browser's bar, then watch the recording and download it.",
      ],
      goodToKnow: [
        "The recording is encoded as it happens, H.264 picture and AAC sound in an MP4, which plays on phones, in QuickTime, in Windows' own player and in common editors. There is no conversion step: the file is already an MP4 when you press Stop. A browser that cannot encode AAC sound records WebM with VP9 or VP8 and Opus instead, and the recording line says so.",
        "The file is written to the browser's own storage on this device as it grows, so an hour-long recording needs free disk space rather than memory. Where the browser refuses that storage, the recording is held in memory instead and stops on its own at about 1.8 GB, keeping everything up to that point. Closing or reloading the tab ends the recording without saving it, and the page asks the browser to warn you before that happens.",
        "The picture is kept at the size you share, with an odd edge trimmed by one pixel because H.264 needs even sizes. A still screen costs far less; motion such as scrolling uses up to about 5 Mb/s at 1080p and 30 fps. Under More options, 60 fps suits games and fast scrolling, and 1080p or 720p makes a large display's recording smaller. A window that changes size while recording keeps the first size, with bars around the new shape.",
        "The microphone and the shared sound are mixed into one track. Whether a tab, a window or the whole screen can share its sound depends on the browser and the operating system: the browser's dialog shows the option where it exists, and if a recording starts without that sound, the recording line says so. The camera bubble is drawn into the picture, so it cannot be moved or removed afterwards.",
        "Phone and tablet browsers do not let a web page capture the screen; use the phone's own screen recorder and bring the file here. Afterwards, [trim the recording](/trim-video) to cut the start and end, [compress it](/compress-video) for email or chat, or [make a GIF](/video-to-gif) of a short part. The index of the MP4 sits at its end; [optimise it for the web](/optimize-video-for-web) before putting it on a site where it should start playing while it loads.",
      ],
      faq: [
        {
          q: "Is there a time limit?",
          a: "No limit is set here. A recording runs until the device's free storage runs out, or to about 1.8 GB where the browser keeps it in memory instead. The time and size show while you record.",
        },
        {
          q: "Is a watermark added?",
          a: "No. The file contains exactly what you shared, plus the camera bubble if you turned it on.",
        },
        {
          q: "Can I record my screen on an iPhone or Android phone?",
          a: "Not from a web page: phone browsers offer no screen capture to pages. The phone's built-in screen recorder makes a file you can trim, compress or convert here.",
        },
        {
          q: "Why is there no sound from my screen?",
          a: "Sound comes only when the browser's dialog offers it and the box is ticked there. If a recording starts without it, the recording line says that only the microphone is recorded.",
        },
        {
          q: "Is the recording uploaded anywhere?",
          a: "No. The screen is encoded by your browser as you record and the file is kept on this device; it goes nowhere unless you download it and send it on yourself.",
        },
        {
          q: "What happens if I press Stop sharing in the browser's bar?",
          a: "The recording finishes as if you had pressed Stop, and the file is ready to watch and download.",
        },
      ],
    },
  },
};
