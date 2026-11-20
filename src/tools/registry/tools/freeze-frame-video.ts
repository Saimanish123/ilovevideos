import type { ToolInput } from "../schema";

export const freezeFrameVideo: ToolInput = {
  slug: "freeze-frame-video",
  engine: "freeze-frame",
  category: "edit",
  phase: "p3",
  backends: ["webcodecs"],
  accepts: ["video"],
  produces: "video",
  keywords: [
    "freeze frame video",
    "freeze a frame in a video",
    "pause video at a frame",
    "hold last frame of video",
    "freeze frame effect online",
  ],
  aliases: ["freeze frame", "hold frame", "still frame", "pause frame", "extend last frame"],
  related: [
    "trim-video",
    "extract-frame-from-video",
    "change-video-speed",
    "merge-videos",
    "fade-video",
  ],
  updatedAt: "2026-11-18",
  icon: "snowflake",
  illustration: "freeze-frame",
  content: {
    en: {
      title: "Freeze a frame in a video",
      subtitle: "Hold the picture on one frame for as long as you like.",
      metaTitle: "Freeze frame video online, free, no upload",
      metaDescription:
        "Hold any frame of a video for a few seconds: pick it on the timeline, set the length, keep the sound or pause it. Free, no upload, runs on your device.",
      action: "Freeze",
      what: "This tool stops a video on a frame you choose and holds it, then lets the video carry on. You can hold several frames, each for its own length, and hold the last frame to give a clip a still ending. Either the whole video pauses on the frame in silence, or only the picture stops while the sound plays on underneath.",
      steps: [
        "Drop a video; a two-second hold is placed on the middle frame.",
        "Drag the hold's marker along the filmstrip, or step through frames with the comma and full stop keys and press Add hold.",
        "Set how long each hold lasts: one of the presets or any length up to 30 seconds.",
        "Choose whether the video pauses or the sound plays on, then press Freeze and download the result.",
      ],
      goodToKnow: [
        "A hold is placed on a real frame of the file. The marker snaps to frame boundaries, and the frame shown in the preview above it is the one held, so a hold set on a face mid-blink stays mid-blink. The comma and full stop keys step one frame back or forward in the preview, which is the quickest way to land on the right moment.",
        "With Video pauses, everything stops: the frame is shown for the length you set, the sound goes quiet for that time, and then picture and sound pick up again together from the next frame. The video gets longer by the total of the holds. The cut into and out of the silence is softened over five milliseconds, so it does not click.",
        "With Sound plays on, the picture stops on the frame while speech or music continues, which is the classic freeze frame of a film ending or a sports replay. The frames under the hold are replaced by the held one, the length stays the same, and the sound is copied from the original untouched when the file allows; WebM's Opus sound is encoded once to AAC.",
        "The picture is re-encoded to H.264 in an MP4 file (MOV and MKV keep their container when the sound plays on), at a bitrate close to the source's, because an extra frame cannot be put into a compressed stream without re-encoding what follows it. The held frames cost almost nothing: an encoder sees the same picture repeated and stores only the fact that nothing changed, so a five-second hold adds very little to the file size.",
        "To hold a frame without keeping the video around it, save it as a picture with [extract frame](/extract-frame-from-video). To slow a moment down instead of stopping it, use [change video speed](/change-video-speed) on a trimmed part, and join the parts back with [merge videos](/merge-videos).",
      ],
      faq: [
        {
          q: "Can I freeze the last frame of a video?",
          a: "Yes. Choose Video pauses, press Hold the last frame and set the length; the video ends on a still of that frame.",
        },
        {
          q: "Can I freeze more than one frame?",
          a: "Yes, up to 20 holds, each with its own length. Move to the next frame you want and press Add hold.",
        },
        {
          q: "What happens to the sound during the freeze?",
          a: "With Video pauses it is silent for the hold. With Sound plays on it carries on as recorded and is copied unchanged.",
        },
        {
          q: "How long can a freeze last?",
          a: "From a tenth of a second up to 30 seconds per hold.",
        },
        {
          q: "Will the video lose quality?",
          a: "The picture is encoded once more, near the original's bitrate, so the loss is small; the held frames are stored almost for free. With Video pauses the sound is encoded once too, to put the silence in.",
        },
        {
          q: "Is my video uploaded?",
          a: "No. The frames are read and written in your browser, and the file never leaves your device.",
        },
      ],
    },
  },
};
