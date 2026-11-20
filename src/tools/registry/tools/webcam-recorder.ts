import type { ToolInput } from "../schema";

export const webcamRecorder: ToolInput = {
  slug: "webcam-recorder",
  engine: "webcam-record",
  category: "record",
  phase: "p2",
  backends: ["webcodecs"],
  accepts: ["video"],
  produces: "video",
  keywords: [
    "webcam recorder",
    "record video from webcam",
    "online camera recorder",
    "record webcam video online",
    "webcam video to mp4",
  ],
  aliases: ["camera recorder", "record myself", "selfie video", "record camera"],
  related: [
    "screen-recorder",
    "voice-recorder",
    "trim-video",
    "flip-video",
    "compress-video",
    "remove-audio-from-video",
  ],
  updatedAt: "2026-11-18",
  icon: "camera",
  content: {
    en: {
      title: "Record webcam video",
      subtitle: "Record yourself with your camera and microphone.",
      metaTitle: "Webcam recorder online, free, no upload",
      metaDescription:
        "Record video from your webcam and microphone in the browser. Pick the camera and size, count down, pause and resume. MP4 on your device. Free, no account.",
      action: "Record",
      what: "This page records video from a camera on your computer or phone, with sound from a microphone. You see yourself before you start, choose the camera, microphone and size, and get an MP4 file written as you record.",
      steps: [
        "Press Turn on camera and allow the camera and microphone when the browser asks.",
        "Pick the camera, the microphone and 720p or 1080p, and check the level as you speak.",
        "Press Start recording; after a 3, 2, 1 count, unless you turned it off, the recording begins.",
        "Pause and resume as you need, press Stop, then watch the recording and download it.",
      ],
      goodToKnow: [
        "The preview is mirrored, as a mirror is, because that is how people expect to see themselves when framing a shot. The recording is not: text on a shirt or a sign reads the right way, and you look as others see you. Under More options you can turn the preview's mirror off, or write the recording mirrored instead.",
        "The camera decides the size. Asking for 1080p gets 1920×1080 from a webcam that offers it; one that cannot gives its nearest size, and the line under the controls shows the size and frame rate the camera actually sends. The file keeps that size, at up to 30 fps. If the picture's shape changes during a recording, as when a phone is turned on its side, the rest is fitted into the first shape with bars.",
        "The file is MP4 with H.264 picture and AAC sound, encoded while you record and written to this device's storage as it grows rather than held in memory; where the browser refuses that storage, it is held in memory and stops at about 1.8 GB. A browser that cannot encode AAC sound records WebM with VP9 or VP8 and Opus instead, and says so while recording. A camera picture is never still, so it costs close to its full rate: about 2.8 Mb/s at 720p and 6.2 Mb/s at 1080p and 30 fps, roughly 21 and 46 MB a minute.",
        "Every camera the browser reports appears in the camera list once the camera is allowed, so on a phone you can pick the front or back camera where the browser lists both. A camera already in use by a video call or another app may refuse to open; the page then says it is in use and what to do.",
        "For a recording of your screen with your face in a corner, use the [screen recorder](/screen-recorder) with its camera bubble. To keep only the sound of a recording, [remove the picture by extracting the audio](/extract-audio-from-video); to cut the start and end, [trim the video](/trim-video).",
      ],
      faq: [
        {
          q: "Why does my recording look flipped compared with the preview?",
          a: "The preview is mirrored to make framing natural; the recording keeps the true orientation. Turn on Mirror the recording under More options if you want the file to match the preview.",
        },
        {
          q: "Can I record in 4K?",
          a: "Not here. The choices are 720p and 1080p, and a 4K picture is far harder to encode while it is being recorded.",
        },
        {
          q: "Does it work on a phone?",
          a: "Where the phone's browser lets a page use the camera, yes; where it does not, the page says so. Allow the camera and microphone when asked, and pick the camera from the list.",
        },
        {
          q: "The browser never asked for the camera. What now?",
          a: "It was blocked earlier for this site. Allow the camera from the icon in the address bar or the site settings, then press Turn on camera again.",
        },
        {
          q: "Is anything uploaded?",
          a: "No. The camera's picture and the microphone's sound never leave the browser while you record; the finished MP4 sits on this device until you download it.",
        },
      ],
    },
  },
};
