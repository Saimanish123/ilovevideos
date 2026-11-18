import type { ToolInput } from "../schema";

export const extractSubtitlesFromVideo: ToolInput = {
  slug: "extract-subtitles-from-video",
  engine: "subtitles-extract",
  category: "captions",
  phase: "p2",
  backends: ["canvas"],
  accepts: ["video"],
  produces: "subtitle",
  keywords: [
    "extract subtitles from video",
    "extract subtitles from mkv",
    "mkv to srt",
    "mp4 to srt",
    "get subtitles out of a video",
    "save embedded subtitles",
  ],
  aliases: ["subtitles", "srt", "captions", "rip subtitles", "demux subtitles"],
  related: [
    "subtitle-converter",
    "shift-subtitle-timing",
    "add-subtitles-to-video",
    "srt-to-vtt",
    "video-info",
  ],
  updatedAt: "2026-10-01",
  icon: "captions",
  content: {
    en: {
      title: "Extract subtitles from video",
      subtitle:
        "Save the subtitle tracks inside an MKV, MP4, MOV or WebM as SRT, WebVTT or ASS files.",
      metaTitle: "Extract subtitles from video, free, no upload",
      metaDescription:
        "Save the subtitle tracks inside MKV, MP4, MOV and WebM files as SRT, WebVTT or ASS. Lists each track with its language. Runs in your browser.",
      action: "Extract subtitles",
      what: "This tool takes the subtitle tracks a video carries as separate streams, the kind a player lets you switch on and off, and saves each one as its own subtitle file. It lists every track with its language, its stored format and whether it is marked default or forced, and writes the ones you tick as SRT, WebVTT or, for styled ASS tracks, as the original ASS script. The video and sound are not decoded or changed; only the text is read out of the file.",
      steps: [
        "Drop an MKV, MP4, MOV or WebM video onto the page, or choose one from your device.",
        "Read the track list: each subtitle track with its language and format, picture tracks shown but greyed out.",
        "Tick the tracks you want and choose SRT, WebVTT or Original.",
        "Press Extract subtitles, then download the file, or all of them as a ZIP when there are several.",
      ],
      goodToKnow: [
        "A soft subtitle track is text with timings stored next to the picture, and it can be taken out exactly. Subtitles that are part of the picture, burned in when the video was made, are pixels like everything else in the frame; there is no track to extract, and the page says so when a file has none.",
        "Each container stores the text in its own way. MKV files usually carry SRT or ASS tracks and sometimes WebVTT; WebM carries WebVTT; MP4 and MOV carry 3GPP timed text, the format ffmpeg calls mov_text and iTunes and HandBrake write, whose italic and bold runs are kept as tags in the SRT. Blu-ray (PGS) and DVD (VobSub) subtitles are pictures of text; they are listed so you can see they are there, but turning them into text needs character recognition, which this tool does not do.",
        "SRT is the safe choice for players, editors and video sites. ASS scripts from anime and fan subtitles carry fonts, colours, positions and karaoke timing that SRT and WebVTT cannot hold; choose Original to keep the script as it was, styles included, or pick SRT knowing the text survives and the look does not. Italic, bold and underline survive in both SRT and WebVTT.",
        "Files are named after the video with the track's language, such as film.en.srt or film.fr.forced.ass, the pattern media servers and many players, VLC among them, use to pick up a subtitle file placed beside its video. A forced track holds only the lines for foreign-language dialogue or signs, which is why it is often much shorter than the full track.",
        "Listing the tracks reads only the file's header, so it is quick even for a large film. Writing them reads through an MKV once, because its subtitle blocks sit between the video frames; an MP4 is read only where its text samples are. To retime the result use [shift subtitle timing](/shift-subtitle-timing), and to turn it into another format the [subtitle converter](/subtitle-converter).",
      ],
      faq: [
        {
          q: "Why is the track list empty for my video?",
          a: "The subtitles are probably burned into the picture, or the file has no subtitle track at all. Broadcast recordings in MPEG-TS carry subtitles as pictures or teletext, which this tool does not read.",
        },
        {
          q: "Can I extract subtitles from an MP4?",
          a: "Yes, when the MP4 has a subtitle track in timed text (mov_text) or WebVTT. Fragmented MP4 files, as browsers and some cameras record them, keep their samples elsewhere and are not read.",
        },
        {
          q: "Why can PGS or VobSub subtitles not be extracted as SRT?",
          a: "They are stored as images, one picture per line of dialogue, not as letters. Converting them to text needs character recognition software, which this tool does not include.",
        },
        {
          q: "Does extracting subtitles change or re-encode the video?",
          a: "No. The video file is only read; the subtitle files are new, small text files. The original stays as it was, with its subtitle tracks still inside.",
        },
        {
          q: "Which format should I choose?",
          a: "SRT for almost any player, editor or upload form. WebVTT for web pages and HTML5 players. Original when a track is ASS and you want to keep its styling.",
        },
        {
          q: "Is the video uploaded?",
          a: "No. The tracks are read from the file in your browser, and the subtitle files are written on your device.",
        },
      ],
    },
  },
};
