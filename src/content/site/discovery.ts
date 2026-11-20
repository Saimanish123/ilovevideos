/**
 * Copy for finding a tool (ADR-0123 to ADR-0127, ADR-0154): the task names search and hubs show, how hubs group
 * their pages, the "Then" steps under a result and the search strings. Copy only; the rules that use it live in `tools/registry/index.ts`,
 * `lib/file-suggestions.ts` and `components/layout/*`. Nothing here claims popularity: there is no
 * usage data, and every reason is a fact about the page or the file.
 */
import type { CategoryId } from "@/tools/registry/schema";

/** Each category as the job people come with, for the search's empty state and the hub chips. */
export const taskLabels: Record<CategoryId, string> = {
  compress: "Make a video smaller",
  convert: "Change the format",
  edit: "Cut, crop and edit",
  audio: "Work on the sound",
  captions: "Subtitles and captions",
  gif: "GIFs and stills",
  image: "Save a frame",
  info: "Inspect, clean or repair",
  record: "Record screen, camera or voice",
  platform: "Ready a video for a platform",
};

/** The one plain line under a hub's H1 (the hub's longer text sits in "About these tools"). */
export const hubLines: Record<CategoryId, string> = {
  compress: "Make a video file smaller.",
  convert: "Change a video or audio file to another format.",
  edit: "Cut, crop, join and change how a video looks.",
  audio: "Change, add or remove the sound.",
  captions: "Add, convert and fix subtitles.",
  gif: "Turn video into GIFs and pictures, and back.",
  image: "Save a frame from a video.",
  info: "See what is in a file, then clean or repair it.",
  record: "Record your screen, camera or voice.",
  platform: "Get a video ready for a platform.",
};

/**
 * Hubs with many standalone pages list them under task headings. A page missing from every group
 * here (a new one) is listed under the last heading, "More", so a hub never drops a page.
 */
export const hubGroups: Partial<Record<CategoryId, { label: string; slugs: string[] }[]>> = {
  edit: [
    {
      label: "Cut and join",
      slugs: [
        "trim-video",
        "split-video",
        "merge-videos",
        "cut-video-into-shorts",
        "remove-silence-from-video",
        "freeze-frame-video",
      ],
    },
    {
      label: "Frame and shape",
      slugs: [
        "crop-video",
        "change-video-aspect-ratio",
        "vertical-video-to-horizontal",
        "remove-black-bars-from-video",
        "rotate-video",
        "flip-video",
        "add-border-to-video",
        "zoom-video",
      ],
    },
    {
      label: "Fix the picture",
      slugs: ["stabilize-video", "sharpen-video", "denoise-video", "adjust-video-brightness"],
    },
    {
      label: "Look and timing",
      slugs: [
        "add-filter-to-video",
        "black-and-white-video",
        "fade-video",
        "change-video-speed",
        "change-video-frame-rate",
        "loop-video",
        "boomerang-video",
        "reverse-video",
      ],
    },
    {
      label: "Add to the picture",
      slugs: [
        "add-text-to-video",
        "add-watermark-to-video",
        "add-image-to-video",
        "add-progress-bar-to-video",
        "add-timer-to-video",
        "add-intro-to-video",
      ],
    },
    {
      label: "Hide, key or combine",
      slugs: [
        "blur-video",
        "blur-video-background",
        "remove-background-from-video",
        "remove-green-screen-from-video",
        "picture-in-picture-video",
        "side-by-side-video",
      ],
    },
  ],
  audio: [
    {
      label: "The sound of a video",
      slugs: [
        "remove-audio-from-video",
        "extract-audio-from-video",
        "add-audio-to-video",
        "replace-audio-in-video",
        "change-video-volume",
        "fade-audio-in-video",
        "fix-audio-sync",
        "select-audio-tracks",
      ],
    },
    {
      label: "Loudness and noise",
      slugs: [
        "change-audio-volume",
        "normalize-audio",
        "remove-background-noise",
        "fade-audio",
        "remove-silence-from-audio",
        "stereo-to-mono",
      ],
    },
    {
      label: "Edit audio files",
      slugs: [
        "trim-audio",
        "merge-audio",
        "change-audio-speed",
        "change-audio-pitch",
        "change-audio-sample-rate",
      ],
    },
    { label: "Music", slugs: ["ringtone-maker", "key-bpm-finder"] },
  ],
  gif: [
    {
      label: "Video to animation",
      slugs: ["video-to-gif", "video-to-webp", "video-to-apng", "video-to-avif"],
    },
    {
      label: "Stills from a video",
      slugs: [
        "extract-frame-from-video",
        "sharpest-frame-from-video",
        "video-thumbnail-maker",
        "video-contact-sheet",
        "video-to-image-sequence",
      ],
    },
    { label: "Pictures into video", slugs: ["gif-to-mp4", "images-to-video"] },
  ],
};

/**
 * The first cards of each home row (ADR-0154): what a new visitor most likely came for, chosen by
 * hand from what each tool does (not from usage: there is no usage data). The rest of the category
 * follows in registry order. A slug that is not a standalone tool of that category is skipped.
 */
export const homeLead: Partial<Record<CategoryId, string[]>> = {
  compress: ["compress-video", "change-video-bitrate"],
  convert: ["video-converter", "audio-converter", "change-video-codec"],
  edit: ["trim-video", "merge-videos", "crop-video", "split-video", "rotate-video"],
  audio: ["extract-audio-from-video", "remove-audio-from-video", "add-audio-to-video"],
  captions: ["add-subtitles-to-video", "subtitle-converter"],
  gif: ["video-to-gif", "extract-frame-from-video", "video-thumbnail-maker"],
  info: ["video-info", "remove-metadata-from-video", "repair-video"],
  record: ["screen-recorder", "webcam-recorder", "voice-recorder"],
};

/** The heading for pages no group lists yet. */
export const hubMore = "More";

/**
 * "Then" under a result (ADR-0126): what people do next with the file a page made, by its kind. A
 * page's own `nextStep` comes first; these fill up to three, skipping the page itself, pages on the
 * same engine and pages that do not take the file.
 */
export const thenSteps: Partial<Record<string, { slug: string; label: string }[]>> = {
  video: [
    { slug: "compress-video", label: "Make it smaller" },
    { slug: "trim-video", label: "Trim it" },
    { slug: "video-to-gif", label: "Make a GIF of it" },
    { slug: "extract-audio-from-video", label: "Save its sound" },
    { slug: "video-info", label: "Check the result" },
  ],
  audio: [
    { slug: "trim-audio", label: "Trim it" },
    { slug: "normalize-audio", label: "Even out its loudness" },
    { slug: "audio-converter", label: "Convert it" },
    { slug: "ringtone-maker", label: "Make a ringtone of it" },
  ],
  subtitle: [
    { slug: "shift-subtitle-timing", label: "Shift its timing" },
    { slug: "subtitle-converter", label: "Convert it" },
    { slug: "add-subtitles-to-video", label: "Add subtitles to a video" },
  ],
};

/** Copy for search, recents and file-first suggestions. */
export const discovery = {
  searchLabel: "Search tools",
  placeholder: "Search tools, formats or problems",
  /** Phones: the sheet's Cancel leaves too little room for the long hint (it clipped at 390). */
  placeholderShort: "Search tools",
  recent: "Recent",
  recentTools: "Recent tools",
  clearRecent: "Clear",
  browse: "Browse by task",
  allTools: "All tools",
  noMatch: (q: string) => `No tool matches “${q}”.`,
  noMatchHint: "Try a format, such as MOV, or what is wrong, such as too big or shaky.",
  fileTitle: "Not sure which tool?",
  fileLead: "Drop a file here to see what fits it.",
  fileLeadTouch: "Choose a file to see what fits it.",
  fileChoose: "Choose a file",
  fileReading: "Reading the file",
  fileNone: "Nothing stands out about this file. Browse the tasks below.",
  fileUnreadable: "This file could not be read as video or audio.",
  fileAgain: "Choose another file",
  backToSearch: "Back to search",
  aboutHub: "About these tools",
  continueRow: "Continue",
  becauseRow: "Because you used",
} as const;
