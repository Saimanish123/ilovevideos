/**
 * The search quality bar (ADR-0123): real-sounding queries with the page that should come first and,
 * where a second answer is just as right, the pages that must also be in the top three. Written from
 * the navigation research (symptom, platform and device queries) and the vocabulary table, before the
 * ranking was tuned against them. Target: every expected page in the top three, the first one first
 * in at least 90 % of rows.
 */
export interface QueryCase {
  q: string;
  top1: string;
  /** Other pages that must also be in the top three. */
  top3?: string[];
}

export const queryCases: QueryCase[] = [
  // From the navigation research: these returned nothing under "every word must match".
  { q: "make video smaller for whatsapp", top1: "compress-video-for-whatsapp" },
  { q: "video too big for email", top1: "compress-video-for-email" },
  { q: "cut the start off", top1: "trim-video" },
  { q: "iphone video wont play on windows", top1: "change-video-codec", top3: ["video-converter"] },
  { q: "iphone video won't play on windows", top1: "change-video-codec" },
  // From the research: these worked before and must keep working.
  { q: "shrink video", top1: "compress-video" },
  { q: "make video smaller", top1: "compress-video" },
  { q: "convrt mov", top1: "video-converter" },
  { q: "louder", top1: "change-video-volume" },
  // Size and sending
  { q: "video too big for discord", top1: "compress-video-for-discord" },
  { q: "discord 10mb", top1: "compress-video-for-discord", top3: ["compress-video-under-10mb"] },
  { q: "send video by email", top1: "compress-video-for-email" },
  { q: "whatsapp", top1: "compress-video-for-whatsapp" },
  { q: "whatsap video too large", top1: "compress-video-for-whatsapp" },
  { q: "discrod", top1: "compress-video-for-discord" },
  { q: "compress video without losing quality", top1: "compress-video" },
  { q: "free video compressor no watermark", top1: "compress-video" },
  { q: "lower file size of mp4", top1: "compress-video" },
  { q: "comprss vdeo", top1: "compress-video" },
  { q: "8mb", top1: "compress-video-under-8mb" },
  // Playback and formats
  { q: "video wont play", top1: "video-converter", top3: ["repair-video"] },
  { q: "iphone video to mp4", top1: "mov-to-mp4" },
  { q: "mov to mp4", top1: "mov-to-mp4" },
  { q: "convert mkv", top1: "video-converter" },
  { q: "webm to mp4", top1: "webm-to-mp4" },
  { q: "hevc to h264", top1: "hevc-to-h264" },
  { q: "video plays sound but black screen", top1: "change-video-codec" },
  { q: "gif to mp4", top1: "gif-to-mp4" },
  { q: "wav to mp3", top1: "wav-to-mp3" },
  { q: "mp4 to mp3", top1: "mp4-to-mp3" },
  { q: "srt to vtt", top1: "srt-to-vtt" },
  { q: "subtitle file to text", top1: "subtitle-converter" },
  // Picture problems
  { q: "shaky video", top1: "stabilize-video" },
  { q: "stabilise footage", top1: "stabilize-video" },
  { q: "grainy footage", top1: "denoise-video" },
  { q: "blurry video", top1: "sharpen-video" },
  { q: "video too dark", top1: "adjust-video-brightness" },
  { q: "remove black bars", top1: "remove-black-bars-from-video" },
  { q: "add black bars to make it 16:9", top1: "change-video-aspect-ratio" },
  { q: "video sideways", top1: "rotate-video" },
  { q: "upside down video", top1: "rotate-video" },
  { q: "mirror selfie video", top1: "flip-video" },
  { q: "black and white", top1: "black-and-white-video" },
  // Sound problems
  { q: "video is too quiet", top1: "change-video-volume" },
  { q: "mp3 too quiet", top1: "change-audio-volume" },
  { q: "make mp3 louder", top1: "change-audio-volume" },
  { q: "normalize volume podcast", top1: "normalize-audio" },
  { q: "audio out of sync", top1: "fix-audio-sync" },
  { q: "subtitles out of sync", top1: "shift-subtitle-timing" },
  { q: "remove sound", top1: "remove-audio-from-video" },
  { q: "video without sound", top1: "remove-audio-from-video" },
  { q: "audio only in one ear", top1: "stereo-to-mono" },
  { q: "remove pauses", top1: "remove-silence-from-video" },
  { q: "add music to video", top1: "add-audio-to-video" },
  { q: "extract mp3 from video", top1: "extract-audio-from-video" },
  // Length, order, speed
  { q: "speed up video", top1: "change-video-speed" },
  { q: "slow motion", top1: "change-video-speed" },
  { q: "combine clips", top1: "merge-videos" },
  { q: "join mp3", top1: "merge-audio" },
  { q: "cut video into parts", top1: "split-video" },
  { q: "trim mp3", top1: "trim-audio" },
  { q: "cut song", top1: "trim-audio" },
  { q: "repeat video 3 times", top1: "loop-video" },
  { q: "play video backwards", top1: "reverse-video" },
  { q: "change frame rate 60 to 30", top1: "change-video-frame-rate" },
  // Shape and platforms
  { q: "tiktok clips from long video", top1: "cut-video-into-shorts" },
  { q: "resize for instagram", top1: "resize-video-for-instagram-reels" },
  { q: "tiktok size", top1: "resize-video-for-tiktok" },
  { q: "video for youtube shorts", top1: "resize-video-for-youtube-shorts" },
  { q: "vertical to horizontal", top1: "vertical-video-to-horizontal" },
  { q: "make video square", top1: "change-video-aspect-ratio" },
  { q: "zoom in on video", top1: "zoom-video" },
  { q: "crop", top1: "crop-video" },
  // Adding and hiding
  { q: "blur face", top1: "blur-video" },
  { q: "hide license plate", top1: "blur-video" },
  { q: "add logo", top1: "add-watermark-to-video" },
  { q: "add text", top1: "add-text-to-video" },
  { q: "add subtitles", top1: "add-subtitles-to-video" },
  { q: "put two videos side by side", top1: "side-by-side-video" },
  { q: "reaction video", top1: "picture-in-picture-video" },
  { q: "green screen", top1: "remove-green-screen-from-video" },
  { q: "add countdown", top1: "add-timer-to-video" },
  { q: "fade to black", top1: "fade-video" },
  { q: "photos to video with music", top1: "images-to-video" },
  // Stills, file facts, recording, music
  { q: "screenshot from video", top1: "extract-frame-from-video" },
  { q: "thumbnail for youtube", top1: "video-thumbnail-maker" },
  { q: "remove location from video", top1: "remove-metadata-from-video" },
  { q: "video corrupted", top1: "repair-video" },
  { q: "what codec is my video", top1: "video-info" },
  { q: "change date of video", top1: "change-video-creation-date" },
  { q: "extract subtitles from mkv", top1: "extract-subtitles-from-video" },
  { q: "record my screen", top1: "screen-recorder" },
  { q: "make ringtone from song", top1: "ringtone-maker" },
  { q: "bpm of song", top1: "key-bpm-finder" },
  // Noise in the sound against grain in the picture (audio SEO audit, 2026-11-19).
  { q: "remove background noise from audio", top1: "remove-background-noise" },
  { q: "fan noise in my recording", top1: "remove-background-noise" },
  { q: "hiss in voice memo", top1: "remove-background-noise" },
  { q: "grainy video", top1: "denoise-video" },
  { q: "noisy video", top1: "denoise-video", top3: ["remove-background-noise"] },
  // Backgrounds: blur, replace without a screen, or key a green screen (round 4, builder C).
  { q: "blur my background", top1: "blur-video-background" },
  { q: "portrait mode blur on a video", top1: "blur-video-background" },
  { q: "remove background from video without green screen", top1: "remove-background-from-video" },
  { q: "change video background", top1: "remove-background-from-video" },
  { q: "virtual background for a recorded video", top1: "remove-background-from-video" },
  { q: "green screen video", top1: "remove-green-screen-from-video" },
  { q: "chroma key", top1: "remove-green-screen-from-video" },
  // Generated pages (ADR-0154): the standalone tool unless the query names the pair or preset.
  { q: "convert video to mp4", top1: "video-converter" },
  { q: "convert flac", top1: "audio-converter" },
  { q: "flac to mp3", top1: "flac-to-mp3" },
  { q: "convert mp4 to webm", top1: "mp4-to-webm" },
  { q: "under 8 mb", top1: "compress-video-under-8mb" },
  { q: "compress for email", top1: "compress-video-for-email" },
  { q: "resize video for facebook", top1: "resize-video-for-facebook" },
  { q: "convert subtitles", top1: "subtitle-converter" },
];

/**
 * Written after the table above passed and run once untuned: 23 of 30 first, 25 of 30 in the top
 * three. The misses led to general rules, not per-query rows: platform words weigh twice a symptom,
 * a query about a song leans to audio pages, a named format beats the general converter ("mkv won't
 * play" is MKV to MP4), and "turn" carries no intent. Kept here so those rules stay.
 */
export const heldOutCases: QueryCase[] = [
  { q: "reduce mp4 size", top1: "compress-video" },
  { q: "video too large to upload", top1: "compress-video" },
  { q: "how to send a long video on whatsapp", top1: "compress-video-for-whatsapp" },
  { q: "convert iphone video", top1: "video-converter" },
  { q: "mkv wont play on tv", top1: "video-converter" },
  { q: "audio is ahead of video", top1: "fix-audio-sync" },
  { q: "make clip shorter", top1: "trim-video" },
  { q: "turn video into mp3", top1: "extract-audio-from-video" },
  { q: "rotate iphone video", top1: "rotate-video" },
  { q: "make a meme gif", top1: "video-to-gif" },
  { q: "voice too low in video", top1: "change-video-volume" },
  { q: "dim video", top1: "adjust-video-brightness" },
  { q: "noisy low light clip", top1: "denoise-video" },
  { q: "shaky gopro footage", top1: "stabilize-video" },
  { q: "remove gps", top1: "remove-metadata-from-video" },
  { q: "join two videos", top1: "merge-videos" },
  { q: "put videos together", top1: "merge-videos" },
  { q: "add song to video", top1: "add-audio-to-video" },
  { q: "change video to 9:16 for reels", top1: "resize-video-for-instagram-reels" },
  { q: "speed up audio", top1: "change-audio-speed" },
  { q: "make video loop", top1: "loop-video" },
  { q: "pixelate", top1: "blur-video" },
  { q: "subtitles", top1: "add-subtitles-to-video" },
  { q: "mp4 to gif", top1: "video-to-gif" },
  { q: "video info", top1: "video-info" },
  { q: "split screen", top1: "side-by-side-video" },
  { q: "ringtone", top1: "ringtone-maker" },
  { q: "compress for discord", top1: "compress-video-for-discord" },
  { q: "mp3 cutter", top1: "trim-audio" },
  { q: "cut long video for reels", top1: "cut-video-into-shorts" },
];
