import { type PairSpec, pairTool } from "../pairs";
import { morePairSpecs } from "./pairs-more";

/**
 * Shipped format pairs (bounded matrix, README.md#seo-strategy §1). Add a pair here only with a real
 * story; everything else is handled by /video-converter without a dedicated page.
 */
const specs: PairSpec[] = [
  {
    from: "mov",
    to: "mp4",
    keywords: ["quicktime to mp4", "iphone video to mp4"],
    aliases: ["quicktime", "iphone video"],
    related: ["mp4-to-mov", "hevc-to-h264", "compress-video", "remove-audio-from-video"],
    updatedAt: "2026-09-30",
    story: [
      "An iPhone records MOV with HEVC video by default (Settings › Camera › Formats › High Efficiency). HEVC fits in MP4, so the conversion here is a straight copy, but the resulting MP4 still will not play in Chrome on many Windows PCs or in some chat apps. When the tool detects HEVC it offers a second option, convert to H.264, which re-encodes once and plays everywhere. If your iPhone is set to Most Compatible it already records H.264 and the copy is all you need.",
      "Screen recordings from macOS are also MOV, usually H.264 at a very high bitrate with no audio or with PCM audio. The picture copies losslessly; PCM audio cannot live in a standard MP4, so the tool re-encodes just the audio to AAC while leaving the video untouched. Expect the file to come out slightly smaller for that reason alone.",
      "If the MOV came from Final Cut Pro or a professional camera and contains ProRes, browsers cannot decode it with their built-in media pipeline, so the page decodes it another way, after a one-time download, and writes H.264. That path holds the whole file in memory and runs slower than the hardware encoder, so it suits clips up to about 2 GB; for longer masters, export an H.264 or HEVC version from the editing application.",
    ],
    faq: [
      {
        q: "Will converting MOV to MP4 lose quality?",
        a: "Not when the MOV holds H.264 or HEVC video, which is every iPhone and Mac recording. The video is copied bit for bit into the MP4. Only ProRes or other editing codecs are re-encoded.",
      },
      {
        q: "Why does my iPhone MP4 still not play on Windows?",
        a: "Because it still contains HEVC. Choose H.264 in the codec option to re-encode it once; the result plays in every browser and app.",
      },
      {
        q: "Is the file uploaded to a server?",
        a: "No. The file is read and rewritten inside your browser. You can disconnect from the internet after the page has loaded.",
      },
      {
        q: "How long does it take?",
        a: "A lossless copy is limited only by how fast your device reads and writes the file. Re-encoding to H.264 depends on the length of the video and on whether your device has a hardware encoder; the progress line shows real progress either way.",
      },
      {
        q: "Does it keep the audio?",
        a: "Yes. AAC audio is copied. PCM audio from screen recordings is re-encoded to AAC because MP4 players do not accept PCM.",
      },
    ],
  },
  {
    from: "mkv",
    to: "mp4",
    keywords: ["mkv to mp4 no quality loss", "obs mkv to mp4", "matroska to mp4"],
    aliases: ["matroska", "obs recording"],
    related: ["mkv-to-mov", "mkv-to-mp3", "remove-audio-from-video", "trim-video"],
    updatedAt: "2026-09-30",
    story: [
      "OBS records to MKV by default so a crash does not destroy the file, and its output is H.264 video with AAC audio, both of which MP4 accepts. Converting an OBS recording here is a lossless copy, the same thing OBS's own Remux Recordings menu does. The MP4 then uploads to YouTube, opens in Premiere and plays on a phone, which the MKV would not.",
      "MKV files from other sources can carry several audio tracks, subtitle tracks and chapters. Every track that MP4 can hold is carried over; text subtitle tracks and attachments are dropped, because MP4 has no place for them in the form most players understand. Chapters are not carried over yet.",
      "Video in MKV is sometimes HEVC or VP9, both of which fit in MP4 and copy losslessly, and sometimes AV1 from newer recorders, which also fits. Audio can be the problem: AC-3, E-AC-3 and DTS from disc rips cannot go into a standard MP4, so the tool re-encodes only the audio to AAC while copying the video.",
    ],
    faq: [
      {
        q: "Is MKV to MP4 lossless?",
        a: "For H.264, HEVC, VP9 and AV1 video with AAC, MP3, Opus or FLAC audio, yes: the streams are copied as they are. AC-3 and DTS audio is re-encoded to AAC; the picture is never touched.",
      },
      {
        q: "What happens to subtitles in the MKV?",
        a: "Text subtitle tracks are dropped, because MP4 players do not read them in that form. Keep the MKV if you need them, or put an SRT file back on the MP4 with [add subtitles to video](/add-subtitles-to-video).",
      },
      {
        q: "My MKV has two audio languages. Which one is kept?",
        a: "Both are carried into the MP4 when their codecs fit it, and players then let you switch. A track MP4 cannot hold as it is is left out, and the result line names it.",
      },
      {
        q: "Can it handle a 20 GB Blu-ray rip?",
        a: "When its sound is AAC, MP3, Opus or FLAC, the file is streamed rather than loaded into memory, so size is limited by free storage. Disc rips usually carry AC-3, E-AC-3 or DTS sound, which this browser cannot decode; those take a one-time download and are held in memory as a whole, which suits files up to roughly 2 GB.",
      },
      { q: "Is anything uploaded?", a: "No. Reading, remuxing and writing happen on your device." },
    ],
  },
  {
    from: "webm",
    to: "mp4",
    videoCodec: "avc",
    keywords: ["webm to mp4 converter", "screen recording webm to mp4", "discord webm to mp4"],
    aliases: ["browser recording", "screen recording to mp4"],
    related: ["webm-to-mov", "webm-to-mp3", "compress-video", "trim-video"],
    updatedAt: "2026-09-30",
    story: [
      "Browser screen recorders, Loom-style extensions and Discord clips produce WebM with VP8 or VP9 video and Opus audio. VP9 and Opus both fit inside MP4 in principle, and Chrome and Android play such a file, but Safari, iPhones, Instagram and most editors expect H.264 and AAC and will refuse it. For that reason this tool re-encodes to H.264 and AAC by default rather than copying, so the MP4 you download plays everywhere. For a VP9 or AV1 WebM a Keep option appears, which copies the streams when you only need it to work in Chrome and want zero quality loss.",
      "Recordings from browsers often have a broken duration: the file says 0:00 or an absurd length because the recorder never wrote the final header. The tool reads through the actual frames when the header is missing, so the MP4 it writes carries the real length and seeks properly.",
      "Frame rates from screen capture are variable, with long gaps when nothing moved on screen. Frame timestamps are carried over as they are, so the recording keeps its real length rather than being stretched or sped up.",
    ],
    faq: [
      {
        q: "Why is my WebM re-encoded instead of copied?",
        a: "VP9 and Opus technically fit in MP4, but most players outside Chrome will not play them there. Re-encoding to H.264 and AAC makes a file that plays on iPhone, Safari and social apps. For VP9 or AV1 video, choose Keep to copy instead.",
      },
      {
        q: "Does the quality drop?",
        a: "Slightly, as with any re-encode. The tool encodes at a high bitrate so the loss is not visible for screen recordings and talking-head video.",
      },
      {
        q: "My WebM shows no duration. Will the MP4?",
        a: "Yes. The true duration is measured from the frames during conversion and written into the MP4.",
      },
      {
        q: "How long does it take?",
        a: "Re-encoding depends on the length of the recording and on hardware acceleration; the progress line shows real progress. Copy mode is limited only by disk speed.",
      },
      { q: "Is the recording uploaded?", a: "No. Everything runs in your browser." },
    ],
  },
  {
    from: "mp4",
    to: "webm",
    keywords: ["mp4 to webm converter", "convert video for html5", "mp4 to vp9"],
    aliases: ["vp9", "html5 video"],
    related: ["mov-to-webm", "mkv-to-webm", "compress-video"],
    updatedAt: "2026-09-30",
    story: [
      "WebM is the format to reach for when a website wants small, royalty-free video that plays in every modern browser. Converting MP4 to WebM almost always re-encodes: H.264 cannot live inside WebM, so the video becomes VP9 and the audio becomes Opus. Only the rare MP4 that already holds VP9 or AV1 has its picture copied. This uses the hardware VP9 encoder where the browser has one; the progress line shows how far along it is.",
      "VP9 at the same visual quality is usually smaller than H.264, so the WebM will often be smaller than the MP4 you started with. Opus audio is also more efficient than AAC. If size is the only goal and you do not need WebM specifically, [compress video](/compress-video) produces an H.264 MP4 that plays in more places.",
      "Transparency is possible in WebM (VP9 with alpha) but not in MP4, so this direction cannot add it; a source with an alpha channel would need to come from an image sequence or a MOV with ProRes 4444.",
    ],
    faq: [
      {
        q: "Can MP4 to WebM be lossless?",
        a: "Almost never. WebM does not accept H.264 or AAC, so both are re-encoded to VP9 and Opus at a quality where the difference is not visible. Only an MP4 that already holds VP9 or AV1 video keeps its picture untouched.",
      },
      {
        q: "Will the WebM play on iPhone?",
        a: "Recent Safari on a Mac plays WebM; on iPhone it depends on the iOS version, so send MP4 to phones. Most social apps do not accept WebM either.",
      },
      {
        q: "Is the WebM smaller than the MP4?",
        a: "Usually, because VP9 and Opus compress more efficiently than H.264 and AAC at similar quality. The result card shows the real before and after sizes.",
      },
      {
        q: "Why is it slower than converting to MP4?",
        a: "Because nothing can be copied; every frame is decoded and re-encoded. Hardware VP9 encoders are also less common than H.264 encoders.",
      },
      {
        q: "Is my video uploaded?",
        a: "No. The conversion runs entirely in your browser.",
      },
    ],
  },
];

export const pairTools = [...specs, ...morePairSpecs].map(pairTool);
