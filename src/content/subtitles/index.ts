/**
 * Subtitle format profiles (README.md#seo-strategy §1, ADR-0011), the subtitle counterpart of
 * `src/content/formats/`. Each format is described once; subtitle pair pages compose two profiles
 * with a hand-written pair story. Profile paragraphs are shared by design and exempt from the
 * registry's duplicate-paragraph check; every pair page still needs its own story.
 */
import type { SubtitleFormat } from "@/tools/engines/subtitles/model";

export interface SubtitleProfile {
  id: SubtitleFormat;
  /** As the world writes it. */
  name: string;
  /** Short name for the <title>, where length is tight ("VTT"); defaults to `name`. */
  metaName?: string;
  /** Article + name for prose: "an SRT", "a WebVTT". */
  a: string;
  extension: string;
  /** One paragraph: what the format is and how a file looks inside. Shared across pages. */
  summary: string;
  /** One paragraph: where it is used and what reads it. Shared across pages. */
  support: string;
}

export const subtitleProfiles: Record<SubtitleFormat, SubtitleProfile> = {
  srt: {
    id: "srt",
    name: "SRT",
    a: "an SRT",
    extension: "srt",
    summary:
      "SRT, from the SubRip program that read subtitles off DVDs, is the plainest timed subtitle format: a number, a line such as 00:01:02,500 --> 00:01:05,000 with a comma before the milliseconds, one or two lines of text, and a blank line. There is no header and no official specification, so players agree on the basics and differ on the extras: most honour <i>, <b> and <u> tags, some honour <font color>, and a {\\an8} tag borrowed from ASS moves a line to the top in many desktop players.",
    support:
      "Almost everything that plays video reads SRT: VLC, mpv, media servers, smart TVs, video editors and the upload forms of the large video sites. What does not read it is the web browser itself, whose built-in player only loads WebVTT through the HTML <track> element.",
  },
  vtt: {
    id: "vtt",
    name: "WebVTT",
    metaName: "VTT",
    a: "a WebVTT",
    extension: "vtt",
    summary:
      "WebVTT is the W3C standard for timed text on the web. A file starts with the word WEBVTT, uses a dot before the milliseconds (00:01:02.500), and may give each cue an identifier and settings after its times, such as line:0 to put it at the top or align:start to left-align it. It can also carry voice tags naming the speaker, CSS classes, inline timestamps for word-by-word captions, and STYLE and NOTE blocks.",
    support:
      "WebVTT is the only subtitle format browsers load natively, so every HTML5 player, HLS stream and most web video platforms use it. Desktop players such as VLC and mpv read it too, but many TVs, set-top boxes and older editors expect SRT instead.",
  },
  ass: {
    id: "ass",
    name: "ASS",
    a: "an ASS",
    extension: "ass",
    summary:
      "ASS (Advanced SubStation Alpha, the successor of SSA) is a styled subtitle script. Sections in square brackets hold script information, named styles with a font, size, colours, outline and position, and an events list where each Dialogue line has a layer, times in hundredths of a second, a style and its text. Override tags in braces change any of that for part of a line: {\\i1} for italics, {\\pos(x,y)} for an exact position, {\\k} for karaoke timing, and {\\p1} for vector drawings.",
    support:
      "ASS is the format of fansubbing and of editors such as Aegisub. It is rendered faithfully by the usual ASS renderer, the one mpv, VLC and FFmpeg's subtitles filter use; TVs, phones and browsers mostly cannot render it, and media servers often have to burn it into the picture for them.",
  },
  sbv: {
    id: "sbv",
    name: "SBV",
    a: "an SBV",
    extension: "sbv",
    summary:
      "SBV is the SubViewer caption format YouTube lists among its basic caption files. Each cue is a timing line with the start and end separated by a comma, such as 0:01:02.500,0:01:05.000 with a one-digit hour, then the text, then a blank line. There are no cue numbers, no formatting tags and no header.",
    support:
      "Outside YouTube few players or editors open SBV, which is why files downloaded from a channel's caption tools are usually converted before use elsewhere.",
  },
  txt: {
    id: "txt",
    name: "TXT",
    a: "a TXT",
    extension: "txt",
    summary:
      "A TXT transcript here is the spoken words alone: one line per subtitle cue, with a cue's own line breaks joined by spaces and no times, numbers or tags, unless you ask for each line's start time in brackets.",
    support:
      "Plain text opens in any editor, pastes into a document or a video description, and can be searched, quoted and translated without a subtitle tool.",
  },
};

export const subtitleProfileList = Object.values(subtitleProfiles);

/** Profile paragraphs, shared by design across pair pages (exempt from the duplicate check). */
export const subtitleSharedParagraphs: ReadonlySet<string> = new Set(
  subtitleProfileList.flatMap((p) => [p.summary, p.support]),
);
