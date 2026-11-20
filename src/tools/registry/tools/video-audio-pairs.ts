import { type VideoAudioPairSpec, videoAudioPairTool } from "../audio-pairs";

/**
 * Video → audio pairs on the video-to-audio engine, each with a story that differs from
 * mp4-to-mp3 (hand-written, ./mp4-to-mp3.ts). Pruned on 2026-09-30: mov-to-wav, mkv-to-wav and
 * webm-to-wav (the same story as mp4-to-wav), and every *-to-ogg, *-to-flac and *-to-aiff pair
 * (served by extract-audio-from-video).
 */
const specs: VideoAudioPairSpec[] = [
  {
    from: "mov",
    to: "mp3",
    keywords: ["iphone video to mp3", "quicktime to mp3", "mov to mp3 converter"],
    aliases: ["iphone video to mp3", "quicktime audio"],
    related: ["mp4-to-mp3", "mov-to-mp4"],
    updatedAt: "2026-09-30",
    story: [
      "MOV files are almost always iPhone videos, Mac screen recordings or camera clips. iPhone and Mac recordings carry AAC sound; camera MOVs from makers such as Canon and Nikon often carry uncompressed PCM instead. Whichever is inside, this page decodes it and encodes MP3 with a standard MP3 encoder, and the picture is never decoded at all, so even a ProRes camera file works as long as the browser can read the container.",
      "Because the picture is thrown away, the MP3 depends only on the length of the video and the bitrate: a ten-minute iPhone clip becomes about 14 MB at 192 kbps whether it was filmed in 4K or 720p. For a talk, a lesson or a voice memo filmed on the phone, 128 kbps is enough.",
      "When the MOV has several audio tracks, as some camera and screen recordings do, only the first becomes the MP3.",
    ],
    faq: [
      {
        q: "Can I get the iPhone video's sound without re-encoding?",
        a: "Yes: [extract audio from video](/extract-audio-from-video) with M4A copies the AAC track untouched. MP3 always means a new encode.",
      },
      {
        q: "Does the video resolution change the MP3?",
        a: "No. The sound track is independent of the picture, so a 4K and a 720p MOV of the same length give the same MP3 size.",
      },
      {
        q: "Can I convert only part of the MOV?",
        a: "Yes. Tick the range box and drag the two handles on the timeline under the preview; only that section becomes the MP3.",
      },
      {
        q: "My MOV came from a Canon or Nikon camera. Will it work?",
        a: "Yes, when the browser can open the file. Camera MOVs with PCM sound are decoded and encoded as MP3 the same way as phone videos.",
      },
    ],
  },
  {
    from: "mp4",
    to: "m4a",
    keywords: ["mp4 to m4a converter", "mp4 to aac", "extract aac from mp4"],
    aliases: ["mp4 to aac", "video to m4a"],
    related: ["mp4-to-mp3", "mp4-to-wav"],
    updatedAt: "2026-09-30",
    story: [
      "Nearly every MP4 stores its sound as AAC, and M4A is the same MPEG-4 container with only the audio in it. So this conversion copies the AAC track into a new file without decoding it: the M4A is bit for bit the sound the camera or phone recorded, and since nothing is encoded the speed is limited only by how fast your device reads and writes the file. No bitrate choice is needed, because nothing is encoded.",
      "When an MP4 carries something other than AAC, such as MP3, Opus from a web recorder or AC-3 from a TV recording, M4A cannot hold it as is. The line under the options says so before you start, and the page re-encodes to AAC at the bitrate you choose.",
      "M4A is what Apple's apps and most phones expect for an audio-only file, so the result imports into Music, plays on an iPhone and opens in any editor that reads AAC. Title and artist tags in the MP4 come along.",
    ],
    faq: [
      {
        q: "Is MP4 to M4A lossless?",
        a: "Yes, for the usual AAC sound: the track is copied, not re-encoded. The summary under the options says Lossless when that is the case.",
      },
      {
        q: "Why is there no bitrate option?",
        a: "A copy keeps the bitrate the MP4 already has. The option appears only when the MP4's sound is not AAC and has to be encoded.",
      },
      {
        q: "Is M4A the same as MP4?",
        a: "Same container, different contents: an M4A holds only audio, and the extension tells players to treat it as music rather than video.",
      },
      {
        q: "Can I just rename .mp4 to .m4a instead?",
        a: "Often it plays, but the file still contains the video, so it stays large and some apps reject it. Copying the audio track out gives a small, proper audio file.",
      },
    ],
  },
  {
    from: "mp4",
    to: "wav",
    keywords: ["mp4 to wav converter", "video to wav for transcription", "extract wav from mp4"],
    aliases: ["video to wav", "mp4 audio to wav"],
    related: ["mp4-to-mp3", "mp4-to-m4a"],
    updatedAt: "2026-09-30",
    story: [
      "WAV is what audio editors, DAWs, transcription and subtitling tools and speech-analysis software most reliably accept, so this page turns the sound of an MP4 into 16-bit PCM at the video's own sample rate and channel count. The AAC in the MP4 is decoded once; from there nothing more is lost, but nothing the AAC encoder removed comes back.",
      "The browser converts it itself, streaming through the MP4 with no extra download. The WAV is large: about 11.5 MB per minute for 48 kHz stereo, which is what most phones and cameras record, so an hour-long meeting recording becomes about 690 MB, held in memory until you download it.",
      "Use the range option to keep only the part you need: the timeline under the preview shows the frames, and only the section between the handles is written.",
    ],
    faq: [
      {
        q: "What sample rate will the WAV be?",
        a: "The MP4's own, usually 48 kHz for phone and camera video and 44.1 kHz for some exports. Nothing is resampled.",
      },
      {
        q: "Is a WAV from an MP4 better than the video's sound?",
        a: "It is the same sound, decoded. WAV only removes the need for any further decoding in the next program.",
      },
      {
        q: "Why is the WAV bigger than the whole video?",
        a: "Video codecs and AAC are heavily compressed; PCM is not. For a talking-head recording, the uncompressed sound alone can outweigh the compressed picture.",
      },
      {
        q: "Can I get a smaller lossless file?",
        a: "Yes: choose FLAC on [extract audio from video](/extract-audio-from-video) for the same samples at roughly half the size.",
      },
    ],
  },
  {
    from: "webm",
    to: "mp3",
    keywords: ["webm to mp3 converter", "browser recording to mp3", "webm audio to mp3"],
    aliases: ["screen recording to mp3", "meeting recording to mp3"],
    related: ["webm-to-mp4", "opus-to-mp3"],
    updatedAt: "2026-09-30",
    story: [
      "WebM files come from browsers: screen and camera recordings made with web-based recorders, meeting and call recordings from web apps, and clips saved by some Chrome extensions. Their sound is almost always Opus, sometimes Vorbis. This page decodes it and encodes an MP3 with a standard MP3 encoder, so the result opens in anything, including players and editors that have never heard of WebM.",
      "Browser recordings often have a missing or wrong duration in the header, because the recorder never goes back to write it. The conversion reads through the whole file, so the MP3 carries the real length. Opus always decodes at 48 kHz, so the MP3 is 48 kHz too, with the recording's own channel count.",
      "For listening back to a meeting or for transcription, 128 kbps is plenty.",
      "A meeting recording usually holds one mixed track of everyone on the call, and the MP3 keeps that single mix; speakers cannot be separated afterwards. Silent stretches stay at full length unless you tick the range box and keep only a section. Without the picture the file shrinks to what the sound needs: a two-hour recording at 128 kbps is about 115 MB as MP3, whatever size the WebM was.",
    ],
    faq: [
      {
        q: "Can I keep the Opus sound without re-encoding?",
        a: "Yes: [extract audio from video](/extract-audio-from-video) with Opus copies the track into an .opus file unchanged.",
      },
      {
        q: "My WebM shows a length of 0:00. Will the MP3?",
        a: "No. The MP3 is written from the audio that is actually there, so it has the true length and seeks normally.",
      },
      {
        q: "Does the picture in the WebM slow this down?",
        a: "Very little. The picture is skipped without being decoded; only the sound is decoded and encoded.",
      },
      {
        q: "Is the recording uploaded anywhere?",
        a: "No. Meeting and screen recordings are converted inside your browser and never leave your device.",
      },
      {
        q: "Which bitrate should I use for a WebM recording?",
        a: "128 kbps for speech, which is what most screen and meeting recordings are. Choose 192 kbps when the recording is mostly music.",
      },
    ],
  },
  {
    from: "mkv",
    to: "mp3",
    keywords: ["mkv to mp3 converter", "obs recording to mp3", "extract mp3 from mkv"],
    aliases: ["obs audio to mp3", "matroska to mp3"],
    related: ["mkv-to-mp4", "mp4-to-mp3"],
    updatedAt: "2026-09-30",
    story: [
      "MKV files are usually OBS recordings, TV and disc rips, or downloads with several language tracks. OBS stores the sound as AAC by default; rips often carry AC-3, E-AC-3, DTS or FLAC. The page decodes whichever it finds, after a one-time download, and encodes MP3 with a standard MP3 encoder, so formats the browser itself cannot play, such as AC-3 and DTS, still work.",
      "Only the first audio track becomes the MP3. OBS can record up to six tracks (game, microphone and music separately, for example), and track 1 is normally the full mix; for a disc rip it is usually the main language. Choosing another track is not possible yet.",
      "Surround sound, 5.1 from AC-3 or DTS, is mixed down to stereo, because MP3 holds two channels at most.",
      "Disc rips carry far more audio data than an MP3 needs: AC-3 on a DVD is typically 448 kbps and full-rate DTS about 1,509 kbps, for six channels. After the stereo downmix, 192 kbps MP3 is enough for films and TV; choose 320 kbps for concert recordings. In a downmix, dialogue sometimes sounds quieter than in the surround mix, because the centre channel is blended into left and right. If an OBS recording's MP3 has no microphone, check which tracks OBS was set to record: track 1 may hold only the game.",
    ],
    faq: [
      {
        q: "My MKV has several languages. Which one is converted?",
        a: "The first audio track, which is usually the default language of the release or the full mix of an OBS recording.",
      },
      {
        q: "Does it work with AC-3 and DTS sound?",
        a: "Yes. AC-3, E-AC-3 and DTS are decoded here even though browsers cannot play them, and the MP3 plays everywhere.",
      },
      {
        q: "What happens to 5.1 surround?",
        a: "It is mixed down to stereo, the most MP3 can hold. Keep the MKV if you need the surround channels.",
      },
      {
        q: "Can it handle a large MKV?",
        a: "The whole file is held in memory, so MKVs up to roughly 2 GB work in a desktop browser. For bigger files, [trim the video](/trim-video) first.",
      },
    ],
  },
];

export const videoAudioPairTools = specs.map(videoAudioPairTool);
