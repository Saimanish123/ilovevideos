import type { ToolInput } from "../schema";

export const addSubtitlesToVideo: ToolInput = {
  slug: "add-subtitles-to-video",
  engine: "subtitles-add",
  category: "captions",
  phase: "p1",
  backends: ["webcodecs", "ffmpeg-wasm"],
  accepts: ["video"],
  produces: "video",
  keywords: [
    "add subtitles to video",
    "add srt to mp4",
    "burn subtitles into video",
    "hardcode subtitles",
    "embed subtitles in video",
    "merge srt with video",
    "burn captions into video",
    "add captions to video for reels",
  ],
  aliases: [
    "hardsub",
    "softsub",
    "embed captions",
    "put subtitles on video",
    "styled captions",
    "burn in subtitles",
  ],
  related: [
    "srt-to-vtt",
    "shift-subtitle-timing",
    "subtitle-converter",
    "extract-subtitles-from-video",
    "add-text-to-video",
    "trim-video",
  ],
  updatedAt: "2026-11-18",
  icon: "captions",
  content: {
    en: {
      title: "Add subtitles to a video",
      subtitle:
        "Put an SRT, WebVTT or ASS file into a video as a track, or burn it in. Runs in your browser.",
      metaTitle: "Add subtitles to video online, free, no upload",
      metaDescription:
        "Add SRT, WebVTT, ASS or SBV subtitles to MP4, MOV, MKV or WebM as a switchable track, or burn them in. Preview the cues on the video. Nothing uploaded.",
      action: "Add subtitles",
      what: "Puts a subtitle file into a video in one of two ways. A soft track is copied into the file next to the picture and sound, which are not re-encoded, so viewers can turn it on and off. Burning in draws the words into every frame, so they show in any player or app, at the cost of re-encoding the picture once. Either way the cues play over the preview before you commit.",
      steps: [
        "Drop the video onto the page.",
        "Add the subtitle file with the button or by dropping it on the panel.",
        "Play the preview to check the timing; the cues are drawn over the picture.",
        "Choose Soft track or Burn in; to burn in, pick a look and drag the subtitles where they belong on the picture.",
        "Press Add subtitles and download the new video.",
      ],
      goodToKnow: [
        "A soft track is the lossless choice. In an MP4 or MOV the subtitles are written as mov_text, MP4's own timed-text format (3GPP timed text), which ffmpeg reads back as a subtitle stream with its language and default flag; in MKV as SRT, or as the ASS script unchanged when that is what you added, so its styling survives in players that render ASS; in WebM as WebVTT, the only subtitle format WebM allows. The picture and the sound are copied bit for bit, so the file is as good as the original and only slightly larger.",
        "Burn in when the viewer will not have a choice of track: a clip for a social app, a video that plays muted in a feed, a presentation, or a player that ignores subtitle tracks. Social apps usually drop the tracks inside an uploaded file, and burned-in text cannot be dropped. The picture is re-encoded once to H.264 at a bitrate close to the source's and the sound is copied when the container allows. In the three looks the preview draws the cues with the same code that draws them into an MP4, MOV, MKV or WebM, so what you see at any moment is what the file will show. With Keep the ASS styling on, the preview shows the words and their timing, and the script's styling appears only in the file; formats only the fallback engine writes get the same look from libass, with one box around a whole cue rather than one per line.",
        "Three looks cover most jobs. Classic is white with a black outline, as players draw subtitles. Boxed sets each line on a see-through dark box, which stays readable over snow, sky and busy streets. Bold social is large and bold and, on a vertical video, sits above the bottom 35% of the picture, the part Meta's ads guide for Reels asks to keep free because the app's caption and buttons cover it (checked 2026-09). Size, colour, the box's strength, the line width and the height on the picture can all be changed; cues an ASS or WebVTT file marks for the top stay at the top.",
        "Short phrases shows a long cue a few words at a time, the way captions in short videos often appear. A subtitle file says when each cue starts and ends but not when each word is spoken, so the cue's time is shared between its phrases by their length. That is close for steady speech and drifts where someone pauses mid-sentence; play the preview through, and if a phrase runs early, split that cue in the file instead.",
        "ASS files keep their look when burned in. With Keep the ASS styling on, the script is drawn by libass, the renderer mpv and VLC use, with its colours, positions, sizes and outlines, in the Geist typeface bundled with this site because the browser cannot hand its own fonts to the renderer. Geist covers Latin, including Vietnamese, and Cyrillic; for Greek, Arabic, Hebrew, Indic scripts, Thai, Chinese, Japanese or Korean the page turns Keep the ASS styling off and draws the text in the chosen look with the fonts on your device, so a script draws only where your device has a font for it; the preview, drawn on the same device, shows whether it does. Lines in Hebrew or Arabic are laid out right to left.",
        "A video that already carries text subtitles, such as an MKV with an SRT or ASS track or an MP4 with timed text, can have one of them burned in without a separate file: the page lists them under the file button and reads the one you pick. Picture-based tracks (PGS and VobSub, from Blu-ray and DVD rips) are images of text and are not offered. To keep a track as a separate file instead, [extract the subtitles](/extract-subtitles-from-video).",
        "Check the timing on the preview first: play it, and the cues appear over the picture the way they will in the file. If every line is early or late, [shift the subtitle timing](/shift-subtitle-timing) and add the corrected file; if they drift further off as the video goes on, the file was made for another frame rate. A WebVTT or ASS file that a player will not open as a separate file can also become SRT with the [subtitle converter](/subtitle-converter).",
        "For YouTube and most video platforms you do not need to put the subtitles inside the video at all: upload the SRT or WebVTT file itself in the platform's caption settings, where it stays editable. On a web page of your own, serve a WebVTT file next to the video with a <track> element. Inside-the-file tracks are for files people download and play in VLC, on a TV or in a media server.",
      ],
      faq: [
        {
          q: "What is the difference between soft and burned-in subtitles?",
          a: "A soft track is stored next to the picture and can be turned off; nothing is re-encoded. Burned-in subtitles are part of the picture, show everywhere, and cannot be turned off.",
        },
        {
          q: "Does adding subtitles reduce video quality?",
          a: "Not as a soft track: the picture and sound are copied unchanged. Burning in re-encodes the picture once at a high bitrate, which costs a little quality.",
        },
        {
          q: "Why don't I see the subtitles when I play the MP4?",
          a: "Players only show a soft track when it is switched on or marked as default; this page marks it default unless you untick Show by default, and in VLC you can choose it from the Subtitle menu. On a web page, do not rely on a track inside the file: serve a WebVTT file with a <track> element instead, which [SRT to WebVTT](/srt-to-vtt) prepares.",
        },
        {
          q: "Can I change how burned-in subtitles look?",
          a: "Yes. Pick Classic, Boxed or Bold social, then change the size, colour, box and line width, and drag the subtitles up or down on the picture; the preview shows the result at each moment.",
        },
        {
          q: "Can I burn in a subtitle track that is already in my MKV?",
          a: "Yes, if it is text (SRT, ASS, WebVTT or MP4 timed text): pick it under the file button and choose Burn in. Picture-based tracks such as PGS cannot be read as text.",
        },
        {
          q: "Can I burn in ASS subtitles with their styling?",
          a: "Yes, for Latin and Cyrillic text: libass draws the script with its colours, positions and sizes in the bundled Geist typeface. Other scripts are burned in the look you choose, with your device's fonts.",
        },
        {
          q: "Which subtitle files can I add?",
          a: "SRT, WebVTT, ASS, SSA and SBV. The file is recognised from its content, and its timing problems are listed if it has any.",
        },
        {
          q: "Is my video uploaded?",
          a: "No. The video and the subtitle file are both processed in your browser; the ffmpeg engine, when it is needed, is downloaded once from this site and runs on your device.",
        },
      ],
    },
  },
};
