import { type SubtitlePairSpec, subtitlePairTool } from "../subtitle-pairs";

/**
 * Shipped subtitle pairs. Add a pair only with a real story; every other combination is handled by
 * /subtitle-converter without a dedicated page.
 */
const specs: SubtitlePairSpec[] = [
  {
    from: "srt",
    to: "vtt",
    keywords: ["srt to webvtt", "subtitles for html5 video", "srt for html track"],
    aliases: ["webvtt", "html5 subtitles"],
    related: ["vtt-to-srt"],
    updatedAt: "2026-09-30",
    what: "Rewrites an SRT file as WebVTT so a web page's video player can load it: the WEBVTT header is added, the comma before each millisecond value becomes a dot, and the cue numbers are dropped because WebVTT does not need them. Italic, bold and underline tags carry over as they are, and a cue marked {\\an8} gets the line:0 setting so it still sits at the top.",
    story: [
      "The usual reason for this conversion is the HTML <track> element. Browsers load WebVTT there and nothing else, so an SRT that plays fine in VLC shows nothing on a web page until it is converted. The converted file still has to come from the same site as the page, or be served with CORS headers and the crossorigin attribute on the video element, or the browser will not load it.",
      "<font color> tags have no WebVTT equivalent and are removed; the page counts how many cues had them before you convert. In WebVTT, colour belongs in the page's CSS through the ::cue selector instead. Coordinates that some SRT editors write after the times (X1, X2, Y1, Y2) are removed as well, because WebVTT positions cues with its own settings.",
      "Times keep their millisecond precision and nothing is re-timed. If two cues in the SRT overlap, a browser shows both at once, stacked one above the other; when the page finds overlaps it offers to close them as part of the conversion.",
    ],
    faq: [
      {
        q: "Why does my SRT file not show in an HTML5 video?",
        a: "Browsers only load WebVTT in the <track> element. Convert the file to WebVTT and point the track's src at the .vtt file.",
      },
      {
        q: "Is anything lost converting SRT to WebVTT?",
        a: "The words, the times and the italic, bold and underline tags come through. Font colour tags and screen coordinates are removed, and the page says how many cues had them before you convert.",
      },
      {
        q: "Does it work with subtitles in other languages?",
        a: "Yes. The file is read as UTF-8, or as Windows-1252 when it is not valid UTF-8, and written as UTF-8, the only encoding WebVTT allows.",
      },
      {
        q: "Is my subtitle file uploaded?",
        a: "No. It is read and rewritten by this page in your browser; the text never leaves your device.",
      },
    ],
  },
  {
    from: "vtt",
    to: "srt",
    keywords: ["webvtt to srt", "convert vtt subtitles to srt", "vtt to srt converter online"],
    aliases: ["vtt converter"],
    related: ["srt-to-vtt", "srt-to-txt"],
    updatedAt: "2026-09-30",
    what: "Rewrites a WebVTT file as SRT for the players, TVs and editors that do not read WebVTT: cues are numbered from 1, the dot before the milliseconds becomes a comma, and the WEBVTT header, STYLE blocks and NOTE comments are left out. Italic, bold and underline survive, and a cue placed at the top keeps its place through an {\\an8} tag.",
    story: [
      "WebVTT files saved from streaming sites and web players often carry more than SRT can hold: position settings after the times, <v> voice tags with the speaker's name, CSS classes, and inline timestamps that light up one word at a time. SRT has none of these, so they are removed and the words stay. The page counts each kind before you convert, so you can see whether anything that matters is in the file.",
      "Automatic captions in WebVTT often roll: each line appears twice, first at the bottom and then one row higher while the next line arrives. SRT plays the same cues the same way, so the rolling is kept. For a clean text version with each line once, [convert the SRT to TXT](/srt-to-txt) afterwards.",
      "WebVTT may leave out the hour in a time (01:02.500); SRT always writes it, so that cue becomes 00:01:02,500. No time is rounded or moved.",
    ],
    faq: [
      {
        q: "Why convert VTT to SRT?",
        a: "Many TVs, media players, video editors and upload forms accept SRT but not WebVTT. The words and times are the same in both, so nothing about the timing changes.",
      },
      {
        q: "What happens to cue positions and speaker names?",
        a: "They are removed, because SRT has no position settings or voice tags. A cue at the top of the picture stays at the top through {\\an8}, which most desktop players honour.",
      },
      {
        q: "Can it read a WebVTT file with a missing header?",
        a: "Yes. A .vtt file without the WEBVTT line is still read, and a file named .srt that is WebVTT inside is recognised from its header and converted all the same.",
      },
      {
        q: "Is anything uploaded?",
        a: "No. Reading and writing both happen in this browser tab, and the file stays on your device.",
      },
    ],
  },
  {
    from: "ass",
    to: "srt",
    keywords: ["ssa to srt", "convert ass subtitles to srt", "anime subtitles to srt"],
    aliases: ["ssa converter", "aegisub to srt"],
    related: ["srt-to-ass"],
    updatedAt: "2026-09-30",
    what: "Turns an ASS or SSA script into plain SRT: every Dialogue line becomes a numbered cue with its times, \\N breaks become real line breaks, and italic, bold and underline, whether set by an override tag or by the line's style, become SRT tags. Everything else a script can do, from fonts and colours to positions, karaoke and vector drawings, has no SRT form and is removed; the page counts each kind before you convert.",
    story: [
      "The reason is usually playback. Styled ASS subtitles look right in mpv or VLC, but TVs, phones, browsers and many streaming boxes cannot render them, and a media server may then have to burn them into the picture, which means re-encoding the video while it plays. A plain SRT track needs none of that.",
      "Signs are the part to check. Fansub scripts put translated signs on a higher layer with an exact position, often at the same moment as the dialogue. In SRT they become ordinary cues shown together with the dialogue, at the top when the script aligns them there and at the bottom otherwise, which is why the page counts the lines on upper layers. Vector drawings ({\\p1}) are shapes rather than words and are left out, as are Comment lines.",
      "ASS stores time in hundredths of a second, so every SRT time here ends in a zero: 0:01:02.35 becomes 00:01:02,350. Legacy SSA v4 files, with their Marked field and older alignment numbers, are read the same way.",
    ],
    faq: [
      {
        q: "Will my ASS styling survive in SRT?",
        a: "No. SRT has no styles, so fonts, sizes, colours, outlines and positions are dropped. Italic, bold and underline are kept as tags, and lines aligned to the top stay at the top.",
      },
      {
        q: "What happens to karaoke lines?",
        a: "The words become one cue for the whole line. The per-syllable \\k timing is removed, because SRT cannot time parts of a line.",
      },
      {
        q: "Does it read SSA files too?",
        a: "Yes. SubStation Alpha v4 files (.ssa) are read with their own field order and alignment numbering.",
      },
      {
        q: "Why are some lines missing from the SRT?",
        a: "Lines that hold only a vector drawing are shapes with no text, and Comment lines are notes for the editor. Neither has an SRT form; the page counts both before you convert.",
      },
      {
        q: "Is the script uploaded?",
        a: "No. It is parsed and rewritten in your browser, and nothing is sent anywhere.",
      },
    ],
  },
  {
    from: "srt",
    to: "ass",
    keywords: ["srt to ssa", "style srt subtitles", "convert srt for aegisub"],
    aliases: ["srt to aegisub"],
    related: ["ass-to-srt", "add-subtitles-to-video", "fix-subtitle-overlaps"],
    updatedAt: "2026-09-30",
    what: "Turns an SRT file into an ASS script you can style: the result has a [Script Info] section, one Default style (Arial, 16 points on a 384×288 script, white text with a thin black outline, bottom centre) and one Dialogue line per cue. Italic, bold and underline tags become ASS override tags, line breaks become \\N, and a cue marked {\\an8} keeps its place at the top.",
    story: [
      "Convert to ASS when the subtitles need a look SRT cannot give them: a font of your choice, a box behind the text, a colour per speaker, or signs placed where they belong. Open the result in an editor such as Aegisub, change the Default style once, and every line follows.",
      "ASS is also what libass draws when subtitles are burned into the picture, with the style's font, size and outline applied, so styling the file first decides exactly how burned text looks. [Add subtitles to a video](/add-subtitles-to-video) can burn it in or keep it as a track viewers switch on.",
      "ASS keeps time in hundredths of a second, so SRT times are rounded to the nearest hundredth: 00:00:01,235 becomes 0:00:01.24. A cue that would round to no length at all keeps one hundredth, so no line disappears. Colour tags such as <font color> are not carried over; set colours in the style instead.",
    ],
    faq: [
      {
        q: "What font does the converted ASS file use?",
        a: "Arial at 16 points on a 384×288 script resolution, white with a black outline, bottom centre. Players scale that to the video, and any ASS editor can change the style.",
      },
      {
        q: "Are italics kept?",
        a: "Yes. <i>, <b> and <u> become {\\i1}, {\\b1} and {\\u1} override tags around the same words.",
      },
      {
        q: "Why do the times change by a few milliseconds?",
        a: "ASS stores hundredths of a second, so each time is rounded to the nearest 10 ms. No cue loses its length.",
      },
      {
        q: "Is the file uploaded?",
        a: "No. The conversion runs in this browser tab and the file stays on your device.",
      },
    ],
  },
  {
    from: "sbv",
    to: "srt",
    keywords: ["youtube sbv to srt", "convert sbv subtitles", "sbv file converter"],
    aliases: ["youtube captions to srt"],
    related: ["srt-to-vtt", "shift-subtitle-timing", "change-subtitle-frame-rate"],
    updatedAt: "2026-09-30",
    what: "Rewrites an SBV caption file as SRT: each cue gets a number, the comma between its start and end becomes an arrow, and the one-digit hour becomes two digits with a comma before the milliseconds. SBV has no formatting to lose, so the words and the times come through exactly as they were.",
    story: [
      "SBV works well for moving captions around YouTube, but most editors, players and other video sites do not open it and ask for SRT instead. The conversion is mechanical: the same cues, in the same order, with the same millisecond times.",
      "Captions typed by hand often mark a change of speaker with >> or with a name and a colon, and sound effects in square brackets. Those are ordinary text in SBV and stay ordinary text in SRT, exactly as typed.",
      "If the file has cues that overlap or run out of order, which happens when captions are edited in several passes, the page lists them with their line numbers and offers to fix them as part of the conversion.",
      "Character by character, one SBV cue becomes three SRT lines. 0:01:02.500,0:01:05.000 turns into a cue number, then 00:01:02,500 --> 00:01:05,000 with a two-digit hour and a comma before the milliseconds, then the text. Both formats separate cues with a blank line, so a caption written on two lines stays on two lines, and the numbering starts at 1 in file order.",
      "Captions saved from YouTube are UTF-8. A file that went through an older editor and was saved as Windows-1252 is read in that encoding instead, the page says so, and the SRT is written as UTF-8, which current players and upload forms expect.",
    ],
    faq: [
      {
        q: "What is an SBV file?",
        a: "A plain caption file: a start and an end time separated by a comma, the text, and a blank line. It has no cue numbers or formatting.",
      },
      {
        q: "Is anything lost converting SBV to SRT?",
        a: "No. SBV holds only times and text, and SRT holds both exactly.",
      },
      {
        q: "Does the timing stay exact?",
        a: "Yes, to the millisecond. SBV and SRT both store milliseconds, so 0:00:00.599 becomes 00:00:00,599 and no cue moves.",
      },
      {
        q: "Can I upload the SRT back to YouTube?",
        a: "Yes. YouTube accepts SRT caption files as well as SBV.",
      },
      {
        q: "Is the file uploaded to convert it?",
        a: "No. The conversion happens on this page, in your browser, and nothing is sent over the network.",
      },
    ],
  },
  {
    from: "srt",
    to: "txt",
    keywords: ["srt to text", "subtitles to transcript", "extract text from srt"],
    aliases: ["transcript", "subtitle text"],
    related: ["vtt-to-srt"],
    updatedAt: "2026-09-30",
    what: "Turns an SRT file into a plain transcript: the numbers, times and tags are removed and each cue becomes one line of text, with the cue's own line breaks joined by spaces. Tick the option to keep each line's start time in brackets, which makes it easy to find a quote in the video later.",
    story: [
      "A transcript is for reading rather than playing: show notes, a blog post, quotes for an article, a script to translate, or text to search. Subtitles are split for the screen, two short lines at a time, so a sentence often runs over several cues; here each cue stays on its own line, which keeps every line traceable to its moment in the video.",
      "Automatic captions repeat themselves: each line appears once at the bottom and again one row higher while the next line is spoken. A line that repeats the end of the cue before it is written only once, so a rolling caption file does not become a transcript with every sentence twice. Formatting tags and the {\\an8} placement tag are removed.",
      "Without the start-time option no timing is kept, so a TXT file cannot be turned back into subtitles. Keep the SRT as well if you may need it again.",
    ],
    faq: [
      {
        q: "How do I get a transcript from subtitles?",
        a: "Drop the SRT here and press Convert. The download is a .txt file with one line per subtitle cue.",
      },
      {
        q: "Can I keep the timestamps?",
        a: "Yes. Tick Start time before each line and every line begins with its time, such as [1:02.50].",
      },
      {
        q: "Why is a line from my SRT not repeated in the text?",
        a: "When a cue begins with the same line the previous cue ended with, as rolling automatic captions do, that line is written once.",
      },
      {
        q: "Can I turn WebVTT or ASS into text?",
        a: "Yes. The [subtitle converter](/subtitle-converter) reads both; choose TXT as the output format.",
      },
      {
        q: "Is the file uploaded?",
        a: "No. The transcript is written in your browser from the file on your device.",
      },
    ],
  },
];

export const subtitlePairTools = specs.map(subtitlePairTool);
