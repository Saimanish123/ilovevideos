import type { ToolInput } from "../schema";

export const addTimerToVideo: ToolInput = {
  slug: "add-timer-to-video",
  engine: "time-overlay",
  category: "edit",
  phase: "p3",
  backends: ["webcodecs"],
  accepts: ["video"],
  produces: "video",
  presetOptions: { kind: "timer" },
  keywords: [
    "add timer to video",
    "add countdown to video",
    "countdown timer overlay",
    "stopwatch on video",
    "add running clock to video",
    "elapsed time overlay",
  ],
  aliases: ["countdown", "stopwatch", "timer overlay", "count up", "clock", "elapsed time"],
  related: [
    "add-progress-bar-to-video",
    "add-text-to-video",
    "trim-video",
    "change-video-speed",
    "compress-video",
  ],
  updatedAt: "2026-11-18",
  icon: "timer",
  illustration: "timer",
  content: {
    en: {
      title: "Add a timer to a video",
      subtitle: "Burn in a timer that counts up or down, in m:ss, h:mm:ss or seconds and tenths.",
      metaTitle: "Add a timer or countdown to video online, free",
      metaDescription:
        "Put a running timer or a countdown on a video: count up or down from any time, three formats, nine positions or drag. Runs in your browser, no upload.",
      action: "Add timer",
      what: "This tool draws a running clock into the picture. It can count up from zero or from any time you type, or count down to zero on the last frame, for the whole video or a part of it. It suits workouts, cooking steps, speed runs, timed exercises and a countdown before something starts.",
      steps: [
        "Drop the video onto the page; a timer appears at the top right of the preview, counting up.",
        "Choose Up or Down, and type a start time if it should not begin at 0:00.",
        "Pick the size and colour (style and format are under More options), then drag the timer on the picture or pick one of the nine positions.",
        "To run it for only part of the video, drag the handles on the timeline under the preview.",
        "Press Add timer, play the result in the preview, then download it.",
      ],
      goodToKnow: [
        "Each frame shows the time at that frame, taken from the video's own timestamps, so the timer stays right on a phone video whose frame rate wanders. Counting up rounds down and counting down rounds up, as stopwatches and kitchen timers do: a count up shows 0:00 for the whole first second, and a ten second countdown shows 0:10 for its first second and 0:00 on the last frame.",
        "Formats: m:ss for most clips (minutes keep going past 59, so an hour reads 60:00), h:mm:ss for long recordings, and s.t for short timed efforts where tenths matter. A start time can be typed as 1:30, 0:01:30 or 90; left empty, a count up starts at zero and a countdown starts at the length of the range, so it lands on 0:00 at its end.",
        "The digits are drawn in fixed-width cells with the Geist typeface bundled with this site, so a 1 takes the same room as an 8 and the numbers stay still while they change. The block is sized for the widest value the range will show, which keeps it from growing when 9:59 turns into 10:00. Size is measured against the picture's shorter side, so Medium looks the same on a vertical phone video and a landscape one.",
        "Shadow suits calm footage; Outline or Box keeps the digits readable over snow, sky or a busy street. White digits get a dark outline, shadow or box, and dark digits a light one. For a quieter indicator of how far the video has gone, [add a progress bar](/add-progress-bar-to-video) instead.",
        "The timer becomes part of every frame, so the picture is encoded once more to H.264 at a bitrate close to the source's, and the sound is copied unchanged where the container allows. If you speed the video up afterwards, the timer speeds up with it; to show real time in a sped-up clip, [change the speed](/change-video-speed) first and add the timer to the result with a start time and a range that match.",
      ],
      faq: [
        {
          q: "Can I make a countdown that ends at zero?",
          a: "Yes. Choose Down and leave the start empty: it starts at the length of the chosen range and shows 0:00 on its last frame.",
        },
        {
          q: "Can the timer start from a time other than zero?",
          a: "Yes. Type the start, such as 5:00 or 300, next to Up or Down; a count up continues from there, a countdown goes down from there.",
        },
        {
          q: "Can I show tenths of a second?",
          a: "Yes. The s.t format shows seconds and tenths, such as 12.4, which suits short timed efforts.",
        },
        {
          q: "Will the numbers jump around as they change?",
          a: "No. Every digit sits in a cell of the same width, so the timer keeps its place and size the whole time.",
        },
        {
          q: "Is my video uploaded?",
          a: "No. The digits are drawn with a font served from this site onto each frame in your browser, and the new file is written on your device.",
        },
      ],
    },
  },
};
