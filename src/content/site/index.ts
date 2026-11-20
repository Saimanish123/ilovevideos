/**
 * Hand-written copy for the site shell: the home page, the category hub intros and the legal pages.
 * Tool copy lives in the registry; this file is the only other place page prose is written, and
 * `pnpm lint:copy` checks it (README.md#content-guidelines). Every claim here must stay true of the
 * code: privacy statements are checked against README.md#privacy-and-processing and the workers.
 * Brand text never appears here (ADR-0001); pages insert `site.name` where they need it.
 */
import type { CategoryId } from "@/tools/registry/schema";

export const home = {
  title: "Free online video tools, one job per page.",
  lead: "Compress, convert, trim and fix videos. Choose a tool, drop a file and download the result.",
  /** The hero's search field (ADR-0154): the count is the registry's, rounded down to tens. */
  search: (count: number) => `Search ${count}+ tools, like “make a video smaller”`,
  searchShort: (count: number) => `Search ${count}+ tools`,
  chooseFile: "Or choose a file",
  promises: [
    {
      title: "Nothing is uploaded",
      text: "Files are read and written right here.",
    },
    {
      title: "No account, no watermark",
      text: "Every tool is free, with no limits.",
    },
    {
      title: "Nothing to install",
      text: "Works on your phone and computer.",
    },
  ],
  toolsHeading: "All tools",
} as const;

/**
 * Two short paragraphs per hub, shown under the hub's H1. Specific to the category, never shared
 * with a tool page. Only categories with tools get a hub (registry.getActiveCategories).
 */
export const hubIntros: Partial<Record<CategoryId, readonly string[]>> = {
  compress: [
    "Compressing re-encodes the picture at a lower bitrate, and can lower the resolution too, so the file takes less space. The general compressor offers three presets. The size pages aim for a fixed ceiling such as 8 or 25 MB and plan the bitrate from the clip's length. The bitrate page skips the presets and writes the exact video and audio rate a spec asks for, in kb/s.",
    "Sizes here are decimal megabytes, 1 MB = 1,000,000 bytes, the way platforms and phones count them. On the size pages, a clip that is already under the target is left as it is instead of being encoded again.",
  ],
  convert: [
    "Converting changes the container and, only when the new container needs it, the codec. When the streams already fit the target, such as H.264 from a MOV into an MP4, they are copied packet for packet and the picture and sound stay bit-identical.",
    "The codec pages are the exception: they re-encode the picture on purpose, to H.264 so it opens everywhere or to HEVC, VP9 or AV1 to save space, and offer only the codecs this browser can write. Optimizing an MP4 for the web changes no frame at all; it moves the file's index to the front, so playback can start before the download ends.",
    "The general converters take any pair. The pair pages below lock one source and one target and explain what that particular conversion does. Older formats such as AVI, WMV and FLV need a one-time download the first time you use one.",
  ],
  edit: [
    "Cutting and joining copy the encoded packets between key frames when they can, so a trimmed or split file keeps the original quality. Merging copies only when every clip shares the same codec, size and audio layout; otherwise the clips are encoded to match the first one. Clips for Shorts are always re-encoded, cut at their exact frames and reframed to 9:16 unless you keep their shape.",
    "Crop, aspect ratio, borders, flip, speed, frame rate, colour, fades, blurred regions, image layers, green screen keying, drawn text or watermarks, progress bars and timers change the picture itself, so they encode it again. Blur, image layers, green screen, freeze frame, zoom, picture in picture, side by side, Shorts clips, progress bars, timers and intros take only formats the browser reads itself, so AVI, WMV, FLV and MPEG-TS files are converted to MP4 first. An intro or outro encodes the whole video once so the cards fit its frame and rate; merging copies clips that already match. Rotating an MP4 or MOV only rewrites the rotation flag in the file header. Each page states which of the two happens before you start. Steadying, sharpening and grain removal redraw every frame on the graphics chip and encode it once to H.264, from formats the browser reads itself; the sharpen and denoise pages show the result beside the original on the picture before you start. Removing black bars reads 24 frames when the file is chosen and sets the crop frame on the bars it finds.",
    "A loop repeats the encoded packets, so a looped clip keeps its quality and takes about as long as copying the file; a boomerang encodes one bounce and repeats that. Reversing decodes the clip a section at a time from the end, which keeps memory in check on long recordings. Frame rate only goes down, by dropping frames, and colour looks and fades are previewed with the same numbers the encoder uses.",
  ],
  audio: [
    "These tools work on audio files and on the sound of a video: take the sound out as an audio file, remove it, or add and replace it. Extracting copies the audio stream as it is when the target format can hold it, so an AAC track saved as M4A loses nothing.",
    "Adding or replacing audio copies the picture untouched and encodes the new sound once, to AAC for MP4 and MOV and to Opus for WebM. The audio converters for files without a picture are listed under Convert.",
    "Volume, loudness and fades are worked out from the decoded sound: loudness is measured in LUFS with the EBU R128 method, and each page shows the level before it runs and the level it measured on the file it wrote. Moving the sound against the picture and choosing between language tracks change no samples at all; they copy the streams and only rewrite their timing or their order.",
    "Merging MP3 files that share a sample rate and layout copies their frames end to end; any other join decodes the files and encodes the result once. Changing the pitch keeps the length to the sample, a ringtone is a chosen part saved as an iPhone .m4r or an Android MP3 or OGG, and the key and BPM finder reads tempo and key without writing a file.",
  ],
  captions: [
    "Subtitle files are plain text with timecodes. The converter reads SRT, WebVTT, ASS, SSA and SBV, works out the format from the contents rather than the file name, and lists anything the target format cannot hold, such as ASS styles, before you convert.",
    "Adding subtitles to a video either writes a separate track that players can switch on and off, or draws the text into the picture. Burned-in text is drawn in Geist, a font served from this site, for Latin and Cyrillic letters, and in this device's own fonts for other scripts. Burned-in subtitles come in three looks, can be moved up or down the picture, and can show a long cue a few words at a time.",
  ],
  gif: [
    "A GIF stores at most 256 colours per frame and no sound, which is why a few seconds of video can become a large file. The GIF maker shows an estimated size as you change the width, frame rate and range.",
    "Going the other way, a GIF becomes an H.264 MP4 that keeps each frame's delay, so it plays at the GIF's speed anywhere a video plays: chat apps, slides and editors.",
    "For a single picture rather than a moving one, a still is taken from the decoded video at its own size and saved as PNG, JPG or WebP; nothing is scaled to the preview.",
    "For many pictures, a contact sheet lays frames from even steps across the video on one image, and an image sequence saves them as numbered files in one ZIP. In the other direction, a set of photos becomes an H.264 slideshow, each picture held for the time you set.",
    "Animated WebP and AVIF keep full colour and store only what changes between frames, so where browsers show them they weigh a fraction of a GIF; APNG keeps every pixel exactly, at a larger size. For one clear still of a moment, the sharpest-frame finder scores a short range and keeps the least blurred, and the thumbnail maker suggests well-lit frames from different scenes and saves one at a set shape and size.",
  ],
  info: [
    "See what a file really contains, including container, codecs, resolution, frame rate, bitrate and the tags cameras and phones write, without opening an editor.",
    "Removing metadata writes a copy without location, creation date, device and software tags. Editing metadata rewrites the title, artist, date, comment and cover picture that players show. Both copy the streams as they are, so the picture and sound do not change.",
    "Phones store location in different places: iPhone recordings carry it as a QuickTime key in the MOV, and many Android phones write it as a short tag in the MP4. The inspector lists each one it finds by name and value before anything is removed, and the clean copy is read back afterwards so you can see what is left.",
    "Changing the creation date sets or shifts the recording time in the movie and track headers, with its time zone, across a batch, and changing a file's thumbnail stores a chosen frame as its cover. Repair reads a file that will not play, says what is missing, and copies every complete frame of a cut-off recording into a working file; a recording whose index was never written is diagnosed, not rebuilt.",
  ],
  record: [
    "The recorders encode as they record, in this browser, and write the file to the device's own storage while it grows, or to memory where the browser refuses that storage: when you stop, the file is finished, with no conversion step.",
    "Screen and camera recordings are MP4 with H.264 picture and AAC sound, or WebM where the browser has no AAC encoder; voice recordings are M4A, WAV or Opus. No phone browser lets a page capture the screen; the camera and voice recorders work where the browser lets a page use them, and say so where they do not.",
  ],
  platform: [
    "Each platform page starts from that platform's own published limits, with the source linked on the page.",
    "Compression pages aim for the upload size every account can send. Resize pages fit the frame to the platform's shape and never scale a video up.",
  ],
};

/**
 * Headings for groups of generated pages that listings collapse into one compact row (home) or one
 * link list (hubs): a registry `family`, or `pairs:<engine>` for locked-target format pairs.
 */
export const groupLabels: Record<string, string> = {
  "compress-size": "Compress to a size",
  "compress-platform": "Compress for a platform",
  "resize-platform": "Resize for a platform",
  "pairs:convert-video": "Video formats",
  "pairs:convert-audio": "Audio formats",
  "pairs:video-to-audio": "Video to audio",
  "pairs:subtitles-convert": "Subtitle formats",
  "pairs:codec": "H.264 and HEVC",
};

export const privacy = {
  title: "Privacy",
  metaTitle: "Privacy: what runs where",
  metaDescription:
    "Every tool runs in your browser. Files are never uploaded. No cookies, no accounts, no third-party scripts. What the site loads, and why.",
  lead: "Every tool on this site runs inside your browser. Your files are never uploaded, and this page lists everything the site does load.",
  sections: [
    {
      heading: "Your files stay on your device",
      paragraphs: [
        "When you choose or drop a file, the page reads it from your device and hands it to a background worker in the same browser tab. The worker decodes, edits and encodes it there, and the result is handed back to the page for you to download. At no point is the file, a part of it, or anything read from it, such as its name, its length or its metadata, sent to us or to anyone else.",
        "This holds for every tool on the site. There is no server that processes files, and there is no option to send one to a server.",
      ],
    },
    {
      heading: "What the site downloads",
      paragraphs: [
        "Pages, scripts, styles and the Geist font come from this site. Nothing is requested from any other website: there are no third-party scripts, no advertising, no embedded content and no externally hosted fonts.",
        "Some tools need FFmpeg, compiled to WebAssembly, for formats the browser cannot handle itself. It is downloaded from this site the first time such a tool needs it, never before you choose a file, and your browser keeps it for later visits. Tools that draw subtitles into the picture also download the Geist font files from this site. These downloads carry nothing about you or your file.",
        "Find faces on the blur tool downloads a small face detection model (122 kB) from this site when you press it, and runs it on your device; the frames it looks at never leave the browser.",
        "Remove background noise downloads the RNNoise speech model (1.4 MB), and remove silence and cut into Shorts download the Silero VAD speech model (620 kB), from this site after you choose a file. Both run on your device, and your browser keeps them for later visits.",
        "Blur the background of a video and remove the background from a video download a person segmentation model (about 330 kB, one of two chosen by the video's shape) and its runtime from this site after you choose a video, and run them on your device; the frames never leave the browser, and your browser keeps the model for later visits.",
      ],
    },
    {
      heading: "No cookies, no accounts",
      paragraphs: [
        "The site sets no cookies and has no accounts, sign-in or identifiers of any kind. There is no cookie banner because there is nothing to consent to.",
        "Recent tools are kept in this browser for the home page's Continue row and for search: the names of up to eight tools you opened, in its local storage. They never leave your device, no request carries them, and Clear on the home page removes them; so does clearing this site's data in your browser. Where a browser blocks local storage, there is simply no Continue row.",
        "Words typed into search that don't lead to a tool are counted by this site, per day and without anything that identifies you, so search can learn them. There is no other analytics.",
      ],
    },
    {
      heading: "What this browser keeps",
      paragraphs: [
        "A few things are kept in this browser so the tools are quicker to use the next time. They stay on your device: no request carries them, and nothing is kept on a server.",
        "Settings: on each tool page, the settings you last changed that do not depend on the file, such as a quality preset, an output format or a blur strength, and any settings you saved there by name, up to 12 per page. They sit in local storage, a few hundred bytes per page, until you clear them.",
        "Your last result: when a tool finishes, a copy of the result is kept in the browser's private file storage for this site, so a reload or an accidental Back still lets you download it. One result per tool page, shown under the drop zone for 24 hours, until a newer result replaces it, or until you press Start over or remove it. A result over 1 GB, or over a quarter of the space the browser still allows this site, is not kept, and when the kept results together pass 2 GB the oldest is removed first.",
        "Recordings: the screen, camera and voice recorders write the recording to the same private storage while it runs, so if the tab closes or crashes, the next visit to that recorder offers it back. An interrupted recording stays until you recover or discard it, for at most 7 days. Large results are written there too while a tool page is open, and removed by the next tool page you open after closing it.",
        "Pages and tool code you have opened are kept for use offline, and files shared to the installed app wait in the browser's cache until a tool opens them.",
        "Clear what this site stored, just below, removes all of it from this browser; so does clearing this site's data in your browser's settings.",
      ],
    },
    {
      heading: "What any web host sees",
      paragraphs: [
        "Like every website, the hosting provider that serves these pages receives the standard details of each page request: your IP address, your browser's user agent and the address of the page. These requests never contain your files.",
      ],
    },
    {
      heading: "How this is enforced",
      paragraphs: [
        "The processing code is checked automatically on every change: network calls are not allowed in the engines or the workers, with exceptions that only fetch this site's own files: the FFmpeg WebAssembly build, the subtitle font files and the small models some tools run on your device. The site sends a Content Security Policy that only permits connections to this site, so the page itself cannot send data elsewhere.",
      ],
    },
  ],
} as const;

export const about = {
  title: "About",
  metaTitle: "About: video tools that run on your device",
  metaDescription:
    "Free video tools that run in your browser: no upload, no account, no watermark, no paid tier. How the site works and what it will not do.",
  lead: "A set of video tools that run in your browser. Each page does one job, such as compressing, converting or trimming, on the file you give it.",
  sections: [
    {
      heading: "Free, with no paid tier",
      paragraphs: [
        "Every tool, every setting and every file size your device can handle is free. There is no paid plan, no locked feature, no daily limit, no watermark and no advertising. Nothing on the site asks you to upgrade, because there is nothing to upgrade to.",
      ],
    },
    {
      heading: "How it works",
      paragraphs: [
        "Modern browsers can decode and encode video themselves. Where they can, the tools use WebCodecs, which can use the device's hardware video encoder. For older formats and effects the browser does not offer, the tools fall back to FFmpeg compiled to WebAssembly. Either way the work happens on your device, so a large file does not need to be uploaded first, and the result is ready as soon as your device finishes it.",
        "When a file can be changed without encoding it again, such as a trim at a keyframe or a MOV to MP4 conversion with compatible streams, the tools copy it packet for packet so nothing is lost.",
      ],
    },
    {
      heading: "What it will not do",
      paragraphs: [
        "It will not upload your files, ask for an account or add anything to your video. When a browser cannot do something well, such as encoding HEVC on some systems, the page says so and offers the nearest option that works.",
      ],
    },
  ],
} as const;

export const licences = {
  title: "Open-source licences",
  metaTitle: "Open-source licences",
  metaDescription:
    "The open-source software and fonts this site runs in your browser, their licences, and where to get the source code of the FFmpeg build it ships.",
  lead: "This site runs open-source software in your browser. This page lists what is shipped to you, under which licence, and where the source code is.",
  ffmpeg: [
    "Formats the browser cannot handle are processed with FFmpeg, compiled to WebAssembly by the ffmpeg.wasm project and shipped unmodified. The build is licensed under the GNU General Public License, version 2 or later, because it includes x264 and x265.",
    "You are entitled to the complete corresponding source code of this build, including the build scripts, and may copy, change and redistribute it under the GPL.",
  ],
  /** Fonts and libraries shipped to the browser, other than FFmpeg (which has its own section). */
  packages: [
    {
      name: "mediabunny",
      purpose: "Reads and writes video and audio files through WebCodecs.",
      licence: "Mozilla Public License 2.0",
      url: "https://github.com/Vanilagy/mediabunny",
    },
    {
      name: "@ffmpeg/ffmpeg and @ffmpeg/util",
      purpose: "Loads the FFmpeg WebAssembly build in a worker.",
      licence: "MIT",
      url: "https://github.com/ffmpegwasm/ffmpeg.wasm",
    },
    {
      name: "Geist and Geist Mono",
      purpose:
        "The interface typeface, and the font drawn into burned-in subtitles. The subtitle font files are served with the licence text next to them.",
      licence: "SIL Open Font License 1.1",
      url: "https://github.com/vercel/geist-font",
    },
    {
      name: "YuNet face detection model 2026may (OpenCV Zoo)",
      purpose:
        "Finds faces for the blur tool. Its weights, converted to half floats, are served from /models/yunet/ with the licence text next to them and loaded only when Find faces is pressed.",
      licence: "MIT",
      url: "https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet",
    },
    {
      name: "MediaPipe Selfie Segmentation models (general and landscape)",
      purpose:
        "Find the person for the background blur and background removal tools. The TensorFlow.js files are served unchanged from /models/selfie-segmenter/, with the licence text next to them, and loaded only after a video is chosen on those pages.",
      licence: "Apache License 2.0",
      url: "https://www.kaggle.com/models/mediapipe/selfie-segmentation",
    },
    {
      name: "TensorFlow.js 4.22.0 (tfjs-core, tfjs-backend-webgl, tfjs-converter)",
      purpose:
        "Runs the person model on the graphics chip, in a background worker. Part of this site's scripts, loaded only after a video is chosen on the background blur and background removal pages.",
      licence: "Apache License 2.0",
      url: "https://github.com/tensorflow/tfjs",
    },
    {
      name: "RNNoise 0.2",
      purpose:
        "Removes background noise from speech. Its WebAssembly build comes from @jitsi/rnnoise-wasm 0.2.1 (Apache License 2.0); it is served from /models/rnnoise/ with both licence texts next to it and loaded only after a file is chosen on that page.",
      licence: "BSD 3-Clause",
      url: "https://github.com/xiph/rnnoise",
    },
    {
      name: "Silero VAD 6.2.3",
      purpose:
        "Finds where someone is speaking, to cut pauses and place clip boundaries. Its weights, stored as half floats, are served from /models/silero-vad/ with the licence text next to them and loaded only after a file is chosen on those pages.",
      licence: "MIT",
      url: "https://github.com/snakers4/silero-vad",
    },
    {
      name: "gifenc",
      purpose: "Encodes animated GIFs.",
      licence: "MIT",
      url: "https://github.com/mattdesl/gifenc",
    },
    {
      name: "Lucide",
      purpose: "Interface icons.",
      licence: "ISC",
      url: "https://github.com/lucide-icons/lucide",
    },
    {
      name: "Next.js, React and React DOM",
      purpose: "Page framework and rendering.",
      licence: "MIT",
      url: "https://github.com/vercel/next.js",
    },
    {
      name: "Base UI",
      purpose: "Accessible menus, dialogs and form controls.",
      licence: "MIT",
      url: "https://github.com/mui/base-ui",
    },
    {
      name: "Motion",
      purpose: "Interface animation.",
      licence: "MIT",
      url: "https://github.com/motiondivision/motion",
    },
    {
      name: "next-intl, next-themes, zod, zustand and clsx",
      purpose: "Routing by language, theme handling, validation, state and class names.",
      licence: "MIT",
    },
    {
      name: "cva",
      purpose: "Component style variants.",
      licence: "Apache License 2.0",
      url: "https://github.com/joe-bell/cva",
    },
  ],
} as const;

export const footer = {
  legal: [
    { href: "/privacy", label: "Privacy" },
    { href: "/about", label: "About" },
    { href: "/licences", label: "Licences" },
  ],
} as const;
