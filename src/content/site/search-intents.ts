/**
 * What people type when they describe a problem instead of naming a tool (ADR-0123): symptoms ("too
 * big", "won't play"), places a file is going ("whatsapp", "email") and devices ("iphone"). Each row
 * points at the pages that do that job, the best answer first. Search reads it from the static index
 * (`app/tool-index.json`), so none of it ships with a page.
 *
 * Rules for a row: it must be true for the page it points to (no platform without a page, no fix the
 * page cannot make), and a word that already appears in a page's title or aliases needs no row.
 * Phrases are matched after normalising (lowercase, apostrophes dropped, plural "s" ignored), in
 * order, with up to two words between them. Weight below 1 is for context that only leans.
 *
 * Generated pages (format pairs, sizes, platform presets; ADR-0154) are results only when the query
 * names them: both formats, the size, one of their own keywords, or a row marked `names` (a platform).
 * A row may list one first and its standalone tool next: the standalone tool answers otherwise.
 */
import type { SearchIntent } from "@/lib/tool-search";

export const searchIntents: readonly SearchIntent[] = [
  // Size
  {
    phrases: [
      "too big",
      "too large",
      "too heavy",
      "smaller",
      "reduce size",
      "lower size",
      "file size",
      "make smaller",
      "less space",
      "lower file size",
      "size down",
      "under the limit",
      "over the limit",
      "upload limit",
    ],
    slugs: [
      "compress-video",
      "compress-video-for-whatsapp",
      "compress-video-for-email",
      "compress-video-for-discord",
    ],
  },
  {
    phrases: ["email", "e mail", "gmail", "outlook", "attachment", "attach", "send by mail"],
    slugs: ["compress-video-for-email"],
    weight: 2,
    names: true,
  },
  {
    phrases: ["whatsapp", "whats app"],
    slugs: ["compress-video-for-whatsapp"],
    weight: 2,
    names: true,
  },
  { phrases: ["discord", "nitro"], slugs: ["compress-video-for-discord"], weight: 2, names: true },

  // Plays somewhere else
  {
    phrases: [
      "wont play",
      "doesnt play",
      "not playing",
      "cant play",
      "cannot play",
      "will not play",
      "does not play",
      "unsupported",
      "not supported",
      "cant open",
      "wont open",
      "cannot open",
      "doesnt open",
    ],
    slugs: ["video-converter", "hevc-to-h264", "repair-video", "mov-to-mp4"],
  },
  {
    phrases: [
      "black screen",
      "no picture",
      "only sound",
      "only audio play",
      "sound but no picture",
      "audio but no video",
    ],
    // HEVC to H.264 when the query names it; otherwise the codec changer, which defaults to H.264.
    slugs: ["hevc-to-h264", "change-video-codec", "video-converter"],
  },
  {
    phrases: ["iphone", "ios", "ipad", "apple"],
    slugs: ["mov-to-mp4", "hevc-to-h264", "change-video-codec", "video-converter"],
    weight: 0.6,
  },
  {
    phrases: ["windows", "pc", "smart tv", "tv", "older phone", "premiere", "edit everywhere"],
    slugs: ["hevc-to-h264", "change-video-codec"],
    weight: 0.6,
  },
  // Won't play on Windows: often HEVC, which Windows usually plays only with a Store extension
  // (the HEVC page says so); H.264 plays without one.
  {
    phrases: ["wont play windows", "doesnt play windows", "not playing windows", "wont play pc"],
    slugs: ["change-video-codec", "hevc-to-h264"],
  },
  // One format named, no pair: the general converter, which takes any of them (ADR-0154).
  {
    phrases: [
      "mov",
      "mkv",
      "avi",
      "wmv",
      "flv",
      "webm",
      "m4v",
      "3gp",
      "mts",
      "m2ts",
      "vob",
      "ogv",
      "mpeg",
      "mpg",
    ],
    slugs: ["video-converter"],
    weight: 0.6,
  },
  {
    phrases: ["wav", "flac", "m4a", "ogg", "aac", "wma", "opus", "aiff"],
    slugs: ["audio-converter"],
    weight: 0.6,
  },
  {
    phrases: ["to text", "as text", "txt", "plain text"],
    slugs: ["subtitle-converter"],
    weight: 0.6,
  },
  {
    phrases: [
      "plays everywhere",
      "play everywhere",
      "compatible",
      "compatibility",
      "most compatible",
    ],
    slugs: ["hevc-to-h264", "change-video-codec", "video-converter"],
  },
  {
    phrases: ["convert", "change format", "converter", "format"],
    slugs: ["video-converter"],
    weight: 0.5,
  },

  // Broken files
  {
    phrases: [
      "corrupt",
      "corrupted",
      "broken",
      "damaged",
      "truncated",
      "unplayable",
      "moov atom",
      "recording stopped",
      "phone died",
      "battery died",
    ],
    slugs: ["repair-video", "video-info"],
  },

  // Picture problems
  {
    phrases: ["shaky", "shake", "shaking", "wobbly", "jittery", "jitter", "unsteady", "handheld"],
    slugs: ["stabilize-video"],
  },
  {
    phrases: ["grainy", "grain", "noisy picture", "noisy footage", "speckle", "low light"],
    slugs: ["denoise-video"],
  },
  // "Noisy video" can mean the picture or the sound: grain first, the sound page second.
  { phrases: ["noisy video"], slugs: ["denoise-video", "remove-background-noise"] },
  // Noise in the sound (round 4, builder A's page). Picture grain is denoise-video above.
  {
    phrases: ["noisy audio", "noisy recording", "background noise", "hiss", "hum", "fan noise"],
    slugs: ["remove-background-noise"],
  },
  {
    phrases: ["blurry", "out of focus", "not sharp", "fuzzy", "unclear", "clearer", "crisper"],
    slugs: ["sharpen-video"],
  },
  {
    phrases: [
      "too dark",
      "dark video",
      "dim",
      "brighter",
      "brighten",
      "underexposed",
      "too bright",
      "darker",
      "washed out",
      "colour correction",
      "color correction",
    ],
    slugs: ["adjust-video-brightness"],
  },
  {
    phrases: ["black and white", "grayscale", "greyscale", "b w", "monochrome"],
    slugs: ["black-and-white-video"],
  },
  {
    phrases: [
      "black bar",
      "black border",
      "letterbox",
      "letterboxed",
      "pillarbox",
      "bars on the side",
      "bars top and bottom",
    ],
    slugs: ["remove-black-bars-from-video", "change-video-aspect-ratio"],
  },
  { phrases: ["add black bar", "add bar"], slugs: ["change-video-aspect-ratio"] },
  {
    phrases: [
      "sideways",
      "upside down",
      "wrong way",
      "rotated",
      "on its side",
      "90 degrees",
      "turned",
    ],
    slugs: ["rotate-video"],
  },
  {
    phrases: ["mirror", "mirrored", "flipped", "backwards text", "text backwards", "selfie camera"],
    slugs: ["flip-video"],
  },

  // Sound problems
  {
    phrases: [
      "too quiet",
      "quiet",
      "cant hear",
      "hard to hear",
      "louder",
      "turn up",
      "boost volume",
      "volume up",
      "increase volume",
      "too loud",
      "quieter",
      "turn down",
      "too low",
      "low volume",
      "volume is low",
      "barely hear",
    ],
    slugs: ["change-video-volume", "change-audio-volume", "normalize-audio"],
  },
  {
    phrases: [
      "mp3 too quiet",
      "audio too quiet",
      "song too quiet",
      "podcast too quiet",
      "mp3 louder",
      "song louder",
      "audio louder",
      "mp3 volume",
      "audio volume",
      "song volume",
    ],
    slugs: ["change-audio-volume", "normalize-audio"],
  },
  {
    phrases: [
      "even out",
      "uneven volume",
      "same volume",
      "same loudness",
      "normalise",
      "normalize volume",
      "level the volume",
      "volume jumps",
    ],
    slugs: ["normalize-audio"],
  },
  {
    phrases: [
      "out of sync",
      "lip sync",
      "audio delay",
      "audio late",
      "audio early",
      "sound late",
      "sound delay",
      "audio ahead",
      "audio behind",
      "audio lag",
      "sound lag",
    ],
    slugs: ["fix-audio-sync"],
  },
  {
    phrases: [
      "subtitle out of sync",
      "caption out of sync",
      "subtitle late",
      "subtitle early",
      "subtitle delay",
      "subtitle too early",
      "subtitle too late",
      "subtitle behind",
      "subtitle ahead",
    ],
    slugs: ["shift-subtitle-timing", "change-subtitle-frame-rate"],
  },
  {
    phrases: [
      "no sound",
      "without sound",
      "without audio",
      "remove sound",
      "remove audio",
      "silent video",
      "take out the sound",
      "get rid of the sound",
      "delete audio",
    ],
    slugs: ["remove-audio-from-video"],
  },
  {
    phrases: [
      "one ear",
      "one side only",
      "left channel only",
      "right channel only",
      "only left",
      "only right",
    ],
    slugs: ["stereo-to-mono"],
  },
  {
    phrases: ["pause", "dead air", "silence", "silent part", "jump cut", "umm"],
    slugs: ["remove-silence-from-video", "remove-silence-from-audio"],
  },

  // Length and order
  {
    phrases: [
      "cut the start",
      "cut the beginning",
      "cut the end",
      "cut the ending",
      "remove the start",
      "remove the beginning",
      "remove the end",
      "remove the first",
      "remove the last",
      "shorten",
      "shorter",
      "too long",
      "cut out a part",
      "keep only",
    ],
    slugs: ["trim-video", "trim-audio", "split-video"],
  },
  {
    phrases: [
      "mp3 too long",
      "song too long",
      "audio too long",
      "cut song",
      "cut mp3",
      "shorten song",
    ],
    slugs: ["trim-audio"],
  },
  {
    phrases: [
      "into parts",
      "in half",
      "chunk",
      "piece",
      "equal parts",
      "every 30 seconds",
      "every minute",
    ],
    slugs: ["split-video"],
  },
  {
    phrases: [
      "combine",
      "stitch",
      "put together",
      "join together",
      "one video",
      "glue",
      "join two",
      "merge two",
      "combine two",
      "several clips",
    ],
    slugs: ["merge-videos", "merge-audio"],
  },
  {
    phrases: [
      "shorts from",
      "reels from",
      "tiktok clips",
      "reels clips",
      "short clips",
      "long video into",
      "long video",
      "into clips",
      "clips from",
      "clip a podcast",
      "highlights",
    ],
    slugs: ["cut-video-into-shorts"],
  },
  {
    phrases: [
      "speed up",
      "faster",
      "slow down",
      "slower",
      "slow motion",
      "slowmo",
      "slow mo",
      "timelapse",
      "2x",
      "double speed",
    ],
    slugs: ["change-video-speed", "change-audio-speed"],
  },
  {
    phrases: ["repeat", "on repeat", "loop", "longer by repeating"],
    slugs: ["loop-video", "boomerang-video"],
  },
  {
    phrases: ["backwards", "play backwards", "rewind", "in reverse"],
    slugs: ["reverse-video", "boomerang-video"],
  },
  {
    phrases: ["fps", "framerate", "60 to 30", "60fps", "30fps", "24fps"],
    slugs: ["change-video-frame-rate"],
  },

  // Shape and platforms
  {
    phrases: ["tiktok", "tik tok"],
    slugs: ["resize-video-for-tiktok", "cut-video-into-shorts"],
    names: true,
  },
  {
    phrases: ["instagram", "insta", "ig", "reels", "reel"],
    slugs: ["resize-video-for-instagram-reels", "cut-video-into-shorts"],
    names: true,
  },
  {
    phrases: ["youtube shorts", "yt shorts"],
    slugs: ["resize-video-for-youtube-shorts", "cut-video-into-shorts"],
    names: true,
  },
  { phrases: ["youtube", "yt"], slugs: ["resize-video-for-youtube"], weight: 0.8, names: true },
  { phrases: ["facebook", "fb"], slugs: ["resize-video-for-facebook"], names: true },
  {
    phrases: ["square", "9 16", "16 9", "4 5", "1 1", "aspect", "vertical", "portrait"],
    slugs: ["change-video-aspect-ratio"],
    weight: 0.8,
  },
  {
    phrases: [
      "vertical to horizontal",
      "portrait to landscape",
      "horizontal",
      "landscape",
      "vertical to 16 9",
    ],
    slugs: ["vertical-video-to-horizontal"],
  },
  { phrases: ["zoom", "ken burn", "punch in", "push in"], slugs: ["zoom-video"] },
  {
    phrases: ["cut the edge", "remove the edge", "cut out part of the picture"],
    slugs: ["crop-video"],
  },

  // Adding things
  {
    phrases: [
      "add music",
      "add song",
      "background music",
      "add sound",
      "put music",
      "voiceover",
      "voice over",
      "narration",
    ],
    slugs: ["add-audio-to-video", "replace-audio-in-video"],
  },
  {
    phrases: ["replace sound", "change music", "swap audio", "new soundtrack", "change the song"],
    slugs: ["replace-audio-in-video"],
  },
  { phrases: ["logo", "branding", "copyright"], slugs: ["add-watermark-to-video"] },
  {
    phrases: [
      "hide face",
      "blur face",
      "censor",
      "license plate",
      "number plate",
      "redact",
      "anonymise",
      "anonymize",
      "hide name",
    ],
    slugs: ["blur-video"],
  },
  {
    phrases: ["reaction", "facecam", "webcam corner", "video on top"],
    slugs: ["picture-in-picture-video"],
  },
  {
    phrases: [
      "split screen",
      "two videos at once",
      "two videos in one frame",
      "compare",
      "next to each other",
      "stack",
    ],
    slugs: ["side-by-side-video"],
  },
  {
    phrases: ["countdown", "count down", "stopwatch", "count up", "clock"],
    slugs: ["add-timer-to-video"],
  },
  { phrases: ["loading bar", "time bar"], slugs: ["add-progress-bar-to-video"] },
  {
    phrases: ["intro", "outro", "title card", "end card", "end screen"],
    slugs: ["add-intro-to-video"],
  },
  {
    phrases: ["fade to black", "fade out", "fade in", "fade from black"],
    slugs: ["fade-video", "fade-audio-in-video", "fade-audio"],
  },
  {
    phrases: ["sticker", "emoji", "overlay image", "add picture", "add image", "add png"],
    slugs: ["add-image-to-video"],
  },
  { phrases: ["write on", "words on", "add text", "lower third"], slugs: ["add-text-to-video"] },
  { phrases: ["subtitle", "caption"], slugs: ["add-subtitles-to-video"], weight: 0.5 },
  { phrases: ["freeze", "hold frame", "pause on a frame"], slugs: ["freeze-frame-video"] },

  // Backgrounds (round 4, builder C): a blur, a new background without a screen, or a keyed screen.
  {
    phrases: [
      "blur background",
      "blur the background",
      "background blur",
      "portrait mode",
      "bokeh",
    ],
    slugs: ["blur-video-background"],
  },
  {
    phrases: [
      "remove background",
      "change background",
      "replace background",
      "new background",
      "virtual background",
      "no green screen",
      "without green screen",
      "without a green screen",
    ],
    slugs: ["remove-background-from-video"],
  },
  {
    phrases: ["green screen", "chroma key", "chroma", "blue screen"],
    slugs: ["remove-green-screen-from-video"],
  },

  // Taking things out
  {
    phrases: [
      "audio from video",
      "sound from video",
      "mp3 from video",
      "music from video",
      "song from video",
      "rip audio",
      "get the audio",
      "save the sound",
      "only the audio",
      "just the audio",
      "video to audio",
      "video to mp3",
      "video into mp3",
      "video into audio",
    ],
    slugs: ["extract-audio-from-video", "mp4-to-mp3"],
  },
  {
    phrases: [
      "screenshot",
      "still",
      "photo from",
      "picture from",
      "image from",
      "grab a frame",
      "save a frame",
    ],
    slugs: ["extract-frame-from-video", "sharpest-frame-from-video"],
  },
  {
    phrases: ["thumbnail", "cover image"],
    slugs: ["video-thumbnail-maker", "change-video-thumbnail"],
  },
  {
    phrases: ["slideshow", "photo to video", "picture to video", "image to video", "photo montage"],
    slugs: ["images-to-video"],
  },
  {
    phrases: ["subtitle from video", "subtitle out of", "embedded subtitle", "subtitle from mkv"],
    slugs: ["extract-subtitles-from-video"],
  },

  // About the file
  {
    phrases: ["location", "gps", "where it was filmed", "privacy", "personal data", "exif"],
    slugs: ["remove-metadata-from-video"],
  },
  {
    phrases: [
      "what codec",
      "which codec",
      "what format",
      "resolution of",
      "how long is",
      "bitrate of",
      "detail",
      "properties",
      "spec",
      "fps of",
      "what fps",
    ],
    slugs: ["video-info"],
  },
  {
    phrases: ["wrong date", "date taken", "creation date", "timestamp", "date"],
    slugs: ["change-video-creation-date"],
  },
  { phrases: ["fast start", "starts slowly", "web"], slugs: ["optimize-video-for-web"] },

  // Recording and music
  {
    phrases: [
      "record screen",
      "screen recording",
      "record my screen",
      "capture screen",
      "record a tab",
    ],
    slugs: ["screen-recorder"],
  },
  { phrases: ["record myself", "webcam", "record camera"], slugs: ["webcam-recorder"] },
  {
    phrases: ["record voice", "record a voice memo", "microphone", "record audio"],
    slugs: ["voice-recorder"],
  },
  { phrases: ["ringtone", "ring tone", "m4r", "notification sound"], slugs: ["ringtone-maker"] },
  {
    phrases: ["bpm", "tempo of", "what key", "key of", "beats per minute"],
    slugs: ["key-bpm-finder"],
  },
  {
    phrases: ["pitch", "higher voice", "deeper voice", "chipmunk", "transpose"],
    slugs: ["change-audio-pitch"],
  },
];
