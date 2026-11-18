import { ffmpegDownloadSize } from "@/tools/engines/ffmpeg/size";
import type { PairSpec } from "../pairs";

/**
 * Legacy, broadcast, camera and cross-format pairs (README.md#feature-catalog B10–B12). Same rule as
 * ./pairs.ts: a pair ships only with a story that says something true and specific about it. Whether a
 * pair copies or re-encodes comes from the codec matrix (profiles + containers.ts), not from this file.
 */
export const morePairSpecs: PairSpec[] = [
  {
    from: "avi",
    to: "mp4",
    keywords: ["divx to mp4", "xvid to mp4", "avi to mp4 converter free"],
    aliases: ["divx", "xvid"],
    related: ["mp4-to-avi", "wmv-to-mp4", "mpeg-to-mp4", "compress-video"],
    updatedAt: "2026-09-30",
    story: [
      "Nearly every AVI still in a drawer is DivX or Xvid: MPEG-4 Part 2 video with MP3 sound, from film downloads of the 2000s, old camcorders and TV capture cards. MP4 players on phones and in browsers do not decode MPEG-4 Part 2 any more, so this page re-encodes the picture to H.264. The MP3 sound fits in MP4 and is copied as it is, which keeps the audio exactly as it was.",
      "Some AVI files hold H.264 already, usually from screen recorders and later Windows capture software. In that case nothing needs re-encoding: the tool copies the video out of the AVI and into the MP4; nothing is encoded, so it is limited by how fast your device reads and writes the file. Motion JPEG AVIs from compact cameras are the opposite case, very large for their length, and shrink dramatically as H.264.",
      "AVI files have their index at the end, and a recording that was cut off, by a full card or a crash, often has none. The ffmpeg engine reads such files from the start and rebuilds the timing as it goes, so a truncated AVI often converts up to the point where the recording stopped.",
    ],
    faq: [
      {
        q: "Does converting AVI to MP4 lose quality?",
        a: "For DivX and Xvid, one re-encode at high quality, which is not visible in normal viewing. H.264 AVIs are copied with no loss at all.",
      },
      {
        q: "Why does my AVI play on my PC but not on my phone?",
        a: "Windows includes a DivX-compatible decoder; phones and browsers do not. As an MP4 with H.264, the same video plays on both.",
      },
      {
        q: "Will the MP4 be smaller than the AVI?",
        a: "Usually, because H.264 needs far fewer bits than MPEG-4 Part 2 for the same picture. Motion JPEG AVIs shrink the most.",
      },
      {
        q: "Why does the first conversion take longer to start?",
        a: `AVI needs the ffmpeg engine, a one-time download of about ${ffmpegDownloadSize()}, which your browser then keeps.`,
      },
      {
        q: "Is my AVI uploaded?",
        a: "No. The ffmpeg engine runs inside this tab; the file is read and written on your device.",
      },
    ],
  },
  {
    from: "wmv",
    to: "mp4",
    keywords: ["wmv to mp4 converter", "windows media video to mp4", "asf to mp4"],
    aliases: ["windows media", "asf"],
    related: ["avi-to-mp4", "m4v-to-mp4", "compress-video", "trim-video"],
    updatedAt: "2026-09-30",
    story: [
      "WMV comes from Windows Movie Maker projects, old Windows screen recorders, webinar archives and training videos made for Windows Media Player. None of its codecs fit in MP4, so this conversion always re-encodes: the WMV picture becomes H.264 and the WMA sound becomes AAC, which together play on a Mac, a phone and in every browser.",
      "WMV 9 files are usually already well compressed, so the MP4 comes out about the same size, sometimes a little larger; WMV 7 and 8 files, and anything recorded at a high bitrate, shrink. If the result must be small for sending, run it through [compress video](/compress-video) with a size target afterwards rather than squeezing it here.",
      "Files protected with Windows Media DRM, sold or rented through old Windows stores, cannot be decoded by anything but Microsoft's player with a valid licence. They fail to convert here; that is the protection working, not a broken file.",
    ],
    faq: [
      {
        q: "Can WMV be converted to MP4 without re-encoding?",
        a: "No. MP4 players do not accept WMV or WMA streams, so both are encoded again, the picture as H.264 and the sound as AAC.",
      },
      {
        q: "Will the MP4 play on a Mac?",
        a: "Yes. H.264 with AAC plays in QuickTime Player, Photos, iMovie and Safari, none of which open WMV.",
      },
      {
        q: "My WMV came out larger as an MP4. Why?",
        a: "WMV 9 at a low bitrate is already compact, and this page encodes at high quality. Compress the MP4 afterwards if size matters more than detail.",
      },
      {
        q: "Does it work with ASF files?",
        a: "Yes. ASF is the container WMV lives in, and .asf files with Windows Media streams convert the same way.",
      },
      {
        q: "Does the WMV leave my computer?",
        a: "No. It is decoded and encoded in your browser by the ffmpeg engine.",
      },
    ],
  },
  {
    from: "flv",
    to: "mp4",
    keywords: ["flv to mp4 converter", "flash video to mp4", "f4v to mp4"],
    aliases: ["flash video", "f4v"],
    related: ["avi-to-mp4", "ts-to-mp4", "compress-video", "trim-video"],
    updatedAt: "2026-09-30",
    story: [
      "Most FLV files made after 2008 hold H.264 video and AAC sound, exactly what an MP4 holds, only in Flash's own container. For those the conversion is a copy: both streams move into the MP4 unchanged and the picture is bit for bit the original; nothing is encoded, so it is limited by how fast your device reads and writes the file. The ready state names the codecs it found and says Lossless copy before you press Convert.",
      "Older FLVs, from the early YouTube years and from webcam chat recorders, use Sorenson Spark or On2 VP6 video, which no current player decodes. Those are re-encoded to H.264 and AAC. They are usually small and low resolution, so the conversion is quick either way.",
      "FLV is also what an RTMP live stream is packaged as, so a stream archive or a recording saved by a streaming server can be an FLV. Those carry H.264 and AAC and copy losslessly; a long archive is limited only by the memory the ffmpeg engine can use, roughly 2 GB.",
    ],
    faq: [
      {
        q: "Is FLV to MP4 lossless?",
        a: "When the FLV holds H.264 and AAC, which most do, yes: the streams are copied. Sorenson Spark and VP6 files are re-encoded.",
      },
      {
        q: "Why won't my FLV play any more?",
        a: "FLV was played by Flash Player, which browsers removed at the end of 2020. As an MP4 the same video plays everywhere.",
      },
      {
        q: "Does it convert F4V too?",
        a: "Yes. F4V is Adobe's MP4-based variant of Flash video with H.264 inside, and it converts the same way.",
      },
      {
        q: "How long does it take?",
        a: "A copy encodes nothing, so it is limited by how fast your device reads and writes the file. A re-encode of an old FLV depends on its length and your device; the progress line shows real progress.",
      },
      {
        q: "Is anything uploaded?",
        a: "No. The file is converted in your browser tab.",
      },
    ],
  },
  {
    from: "mpeg",
    to: "mp4",
    keywords: ["mpg to mp4", "mpeg to mp4 converter", "mpeg2 to mp4", "mpg to mp4 converter"],
    aliases: ["mpg", "mpeg-2", "mpeg-1"],
    related: ["vob-to-mp4", "ts-to-mp4", "compress-video"],
    updatedAt: "2026-09-30",
    story: [
      "An .mpg from a DVD recorder, a TV tuner card or an old camcorder holds MPEG-2 video, and one from a Video CD or an early digital camera holds MPEG-1. MP4 can technically carry MPEG-2, but phones, browsers and editors do not play it there, so this page re-encodes the picture to H.264 and the MPEG audio layer 2 sound to AAC. At the same quality the MP4 is usually around half the size.",
      "Recordings from TV and DVD recorders use a 720×576 or 720×480 frame with a flag that tells players to show it as 4:3 or 16:9. The MP4 keeps both the frame and the flag, so it displays at the shape the recorder intended rather than squeezed.",
      "Long recordings are the norm here, an hour or two of television, and the ffmpeg engine holds the whole file in memory. Files up to about 2 GB convert. For a longer recording, cut it into parts on the recorder or in a desktop editor first; once it is an MP4, [split video](/split-video) reads it in a streaming way and has no such limit.",
    ],
    faq: [
      {
        q: "Is MPEG to MP4 lossless?",
        a: "No. MPEG-2 and MPEG-1 video is re-encoded to H.264 once at high quality, so the result plays everywhere and is usually much smaller.",
      },
      {
        q: "Why is the MP4 so much smaller than my MPG?",
        a: "H.264 needs roughly half the bits of MPEG-2 for the same picture, and MPEG files from recorders often use a generous fixed bitrate.",
      },
      {
        q: "Will my 16:9 recording come out stretched?",
        a: "No. The shape flag of the MPEG is carried over, so players show it at 16:9 or 4:3 as the recorder intended.",
      },
      {
        q: "Is there a size limit?",
        a: "About 2 GB, because the ffmpeg engine keeps the file in memory. Most recordings under two hours fit.",
      },
      {
        q: "Is my recording uploaded?",
        a: "No. It is converted in your browser; nothing is sent anywhere.",
      },
    ],
  },
  {
    from: "ts",
    to: "mp4",
    keywords: ["ts to mp4 converter", "transport stream to mp4", "m2t to mp4", "hls ts to mp4"],
    aliases: ["transport stream", "iptv recording"],
    related: ["mts-to-mp4", "mpeg-to-mp4", "trim-video"],
    updatedAt: "2026-09-30",
    story: [
      "A .ts from a TV recorder, a set-top box or a saved HLS stream usually holds H.264 video with AAC sound, which MP4 holds too. For those the page copies both streams into an MP4 without re-encoding, reading the transport stream natively in your browser; the picture is untouched, and nothing is encoded, so it is limited by how fast your device reads and writes the file.",
      "Broadcast recordings often carry Dolby Digital (AC-3) sound instead, which a standard MP4 cannot hold. The video is still copied; only the sound is re-encoded to AAC, by the ffmpeg engine. Older standard-definition recordings with MPEG-2 video are re-encoded to H.264 as well. The ready state names each stream and says which of these cases applies.",
      "A recording from a TV box usually starts a little before the programme and runs on after it, because recorders pad the schedule. Once it is an MP4, [trim video](/trim-video) cuts off the extra minutes at either end with a timeline, which the .ts could not be opened in.",
    ],
    faq: [
      {
        q: "Is TS to MP4 lossless?",
        a: "For H.264 with AAC, yes: both streams are copied. AC-3 sound is re-encoded to AAC while the picture is still copied; MPEG-2 video is re-encoded.",
      },
      {
        q: "Why is my TV recording a .ts file?",
        a: "Digital television is broadcast as a transport stream, and recorders save it as received. The MP4 holds the same pictures in a container everything plays.",
      },
      {
        q: "Can it join several .ts segments from a stream?",
        a: "Not on this page. Convert the segments, then join them with merge videos; segments from one stream share codecs, so the join is a copy.",
      },
      {
        q: "Are subtitles or teletext kept?",
        a: "No. MP4 has no place for broadcast subtitle streams in a form players read, so they are dropped.",
      },
      {
        q: "Does the recording leave my device?",
        a: "No. Reading, copying and writing all happen in your browser.",
      },
    ],
  },
  {
    from: "mts",
    to: "mp4",
    keywords: ["m2ts to mp4", "avchd to mp4", "mts to mp4 converter", "camcorder video to mp4"],
    aliases: ["avchd", "m2ts", "camcorder"],
    related: ["ts-to-mp4", "merge-videos", "compress-video"],
    updatedAt: "2026-09-30",
    story: [
      "An .mts from a Sony, Panasonic or Canon camcorder holds H.264 video with Dolby Digital sound. The H.264 picture fits in MP4 and is copied unchanged, so the camcorder's full detail survives; the AC-3 sound does not fit a standard MP4 and is re-encoded to AAC by the ffmpeg engine. The ready state shows this as Picture copied, sound re-encoded.",
      "AVCHD camcorders split long recordings into files of about 2 GB, 00000.MTS, 00001.MTS and so on, in the card's PRIVATE/AVCHD/BDMV/STREAM folder. Convert each file here, then join the MP4s with [merge videos](/merge-videos); because the pieces share codecs, the join is a copy and the seam is invisible.",
      "The copied picture is exactly what the camcorder recorded, frame for frame, and a 5.1 surround track stays 5.1, as AAC. Blu-ray M2TS files convert the same way when they are not encrypted, which home-made discs are not and commercial discs are.",
    ],
    faq: [
      {
        q: "Is MTS to MP4 lossless?",
        a: "The picture is: H.264 is copied bit for bit. The Dolby Digital sound is re-encoded to AAC, because standard MP4 players do not accept AC-3.",
      },
      {
        q: "Why is my recording split into several MTS files?",
        a: "AVCHD camcorders start a new file at about 2 GB. Convert each and join them with merge videos, which copies without re-encoding.",
      },
      {
        q: "Does it convert M2TS from Blu-ray?",
        a: "Unencrypted M2TS files, such as those from a home-made disc, yes. Commercial Blu-rays are encrypted and cannot be read.",
      },
      {
        q: "Will the MP4 import into iMovie or Premiere?",
        a: "Yes. H.264 with AAC in MP4 imports everywhere, without the full card folder that MTS import needs.",
      },
      {
        q: "Is the footage uploaded?",
        a: "No. The file stays on your device while it is converted.",
      },
    ],
  },
  {
    from: "3gp",
    to: "mp4",
    keywords: ["3gp to mp4 converter", "old phone video to mp4", "3g2 to mp4"],
    aliases: ["nokia video", "old phone video", "3g2"],
    related: ["avi-to-mp4", "m4v-to-mp4", "compress-video", "change-video-speed"],
    updatedAt: "2026-09-30",
    story: [
      "3GP videos from a Nokia, Sony Ericsson or Samsung phone of the 2000s usually hold H.263 video and AMR sound. Neither decodes in a browser's media pipeline or plays in an MP4 player, so this page hands them to the ffmpeg engine, which re-encodes the picture to H.264 and the sound to AAC. The result is small and plays on any current phone or computer.",
      "Later phones wrote H.264 and AAC into the same 3GP container. Those are read natively and copied into the MP4 without re-encoding; nothing is encoded, so it is limited by how fast your device reads and writes the file. The ready state names the codecs it found and says which of the two cases you are in before you press Convert.",
      "Expect the picture to stay small: 176×144 and 320×240 were the usual sizes, often at 15 frames per second. Converting cannot add detail the phone never recorded, and the MP4 keeps the original size and frame rate so nothing is invented.",
    ],
    faq: [
      {
        q: "Is 3GP to MP4 lossless?",
        a: "For 3GP files with H.264 and AAC, yes. The older H.263 and AMR kind is re-encoded, because nothing current plays those codecs.",
      },
      {
        q: "Why does my 3GP play with no sound?",
        a: "It probably has AMR sound, which many players skip. The MP4 has AAC sound, which every player handles.",
      },
      {
        q: "Can the video be made sharper?",
        a: "No. The MP4 keeps the phone's resolution; enlarging it would only make the blocks bigger.",
      },
      {
        q: "Does it handle 3G2 files?",
        a: "Yes. 3G2 is the same idea for CDMA phones and converts the same way.",
      },
      {
        q: "Are my old videos uploaded?",
        a: "No. They are converted inside your browser and stay on your device.",
      },
    ],
  },
  {
    from: "vob",
    to: "mp4",
    keywords: ["vob to mp4 converter", "dvd to mp4", "video_ts to mp4"],
    aliases: ["dvd", "video_ts"],
    related: ["mpeg-to-mp4", "mts-to-mp4", "merge-videos", "compress-video"],
    updatedAt: "2026-09-30",
    story: [
      "A VOB is one piece of a DVD's VIDEO_TS folder, holding MPEG-2 video and usually Dolby Digital sound. MP4 players do not take either, so the page re-encodes the picture to H.264 and the sound to AAC with the ffmpeg engine. The DVD's 720×576 or 720×480 frame and its 4:3 or 16:9 shape flag are kept, so the MP4 displays at the shape the disc did.",
      "A film is split across several VOBs of up to 1 GB, VTS_01_1.VOB, VTS_01_2.VOB and so on, while VTS_01_0.VOB is usually just the menu. Convert the numbered pieces, then join the MP4s in order with [merge videos](/merge-videos). DVD subtitles are pictures rather than text and are not carried over.",
      "Commercial DVDs are encrypted with CSS and their VOBs cannot be decoded here. Discs you recorded yourself, on a DVD recorder or a camcorder, are not encrypted and convert normally, which is the usual reason to reach for this page.",
    ],
    faq: [
      {
        q: "Can I convert a whole DVD at once?",
        a: "Convert each numbered VOB, then join the MP4s with merge videos. The file ending in _0 is the menu and can be skipped.",
      },
      {
        q: "Why does my VOB fail to convert?",
        a: "It is most likely from a commercial, CSS-encrypted disc, which cannot be decoded here. Home-made discs convert normally.",
      },
      {
        q: "Does the MP4 keep DVD quality?",
        a: "The picture is re-encoded once at high quality from the MPEG-2 original, at the same 720-wide frame. It looks the same and takes much less space.",
      },
      {
        q: "Are DVD subtitles kept?",
        a: "No. DVD subtitles are images, and MP4 players do not read them.",
      },
      {
        q: "Is the disc content uploaded?",
        a: "No. The VOB is converted in your browser and never leaves your computer.",
      },
    ],
  },
  {
    from: "ogv",
    to: "mp4",
    keywords: ["ogv to mp4 converter", "ogg video to mp4", "theora to mp4"],
    aliases: ["ogg video", "theora"],
    related: ["webm-to-mp4", "mkv-to-webm", "compress-video", "trim-video"],
    updatedAt: "2026-09-30",
    story: [
      "OGV files come from Wikimedia Commons, Linux desktop recorders and open-source project sites, almost always with Theora video and Vorbis sound. MP4 players take neither, so the ffmpeg engine re-encodes the picture to H.264 and the sound to AAC. Theora compresses less efficiently than H.264, so the MP4 is usually smaller at the same look.",
      "Wikimedia Commons offers most videos as WebM too, and some as transcoded files; if you are fetching a video from there, a WebM version converts faster and from a better source, through [WebM to MP4](/webm-to-mp4). For an OGV you already have, this page is the direct route.",
      "Screen recordings from older Linux tools such as recordMyDesktop are OGV with a variable frame rate. The conversion keeps each frame's timing, so the MP4 runs at the length of the original recording.",
    ],
    faq: [
      {
        q: "Is OGV to MP4 lossless?",
        a: "No. Theora and Vorbis are re-encoded to H.264 and AAC, once, at a quality that keeps the picture looking the same.",
      },
      {
        q: "Why will my OGV not play on a Mac or iPhone?",
        a: "Apple has never supported Theora. As an MP4 with H.264 the video plays on every Apple device.",
      },
      {
        q: "Does it convert .ogg files with video?",
        a: "Yes. An .ogg that holds a video stream converts the same way; audio-only .ogg files belong in an audio converter.",
      },
      {
        q: "How long does it take?",
        a: "Re-encoding runs through every frame, so it depends on the video's length and your device; the progress line shows real progress.",
      },
      {
        q: "Is anything uploaded?",
        a: "No. The file is converted in this browser tab.",
      },
    ],
  },
  {
    from: "m4v",
    to: "mp4",
    keywords: ["m4v to mp4 converter", "itunes video to mp4", "convert m4v"],
    aliases: ["itunes video"],
    related: ["mov-to-mp4", "compress-video", "remove-metadata-from-video"],
    updatedAt: "2026-09-30",
    story: [
      "An M4V is already an MP4 inside; only the extension differs. Converting one here copies the H.264 or HEVC video and the AAC sound into a file named .mp4, which is what Android galleries, smart TVs and upload forms that ignore .m4v are looking for. Nothing is re-encoded, so it is limited by how fast your device reads and writes the file.",
      "Films and episodes bought or rented from Apple are M4Vs protected with FairPlay DRM. Their video is encrypted, so no tool outside Apple's apps can read it and this page reports that it cannot decode the stream. Home videos exported from iMovie or Photos, and files made by Handbrake's Apple presets, are not protected and convert normally.",
      "Because the same streams are copied, the MP4 comes out about the same size as the M4V. The title and other descriptive tags in the file are carried over too; if you would rather share the video without them, [remove metadata from video](/remove-metadata-from-video) strips them without touching the picture or the sound.",
    ],
    faq: [
      {
        q: "Is M4V to MP4 lossless?",
        a: "Yes, for files without DRM: the streams are copied and only the container is rewritten with the .mp4 extension.",
      },
      {
        q: "Can I just rename .m4v to .mp4?",
        a: "Often that works, because the inside is the same. Converting also rewrites the file cleanly, which fixes players that check more than the name.",
      },
      {
        q: "Why can I not convert a film I bought on iTunes?",
        a: "It is protected with FairPlay DRM and only plays in Apple's apps. Removing the protection is not something this tool does.",
      },
      {
        q: "Does it keep chapters?",
        a: "Not yet. The video and sound are kept; chapter markers from the M4V are not carried over.",
      },
      {
        q: "Is my file uploaded?",
        a: "No. It is rewritten inside your browser.",
      },
    ],
  },
  {
    from: "mp4",
    to: "avi",
    keywords: ["mp4 to avi converter", "mp4 to divx", "mp4 to xvid", "convert mp4 for dvd player"],
    aliases: ["divx", "xvid", "dvd player"],
    related: ["avi-to-mp4", "compress-video", "video-converter"],
    updatedAt: "2026-09-30",
    story: [
      "People convert MP4 to AVI for one reason: an older DVD player, TV or car screen that plays DivX files from a USB stick or a disc but not H.264. This page writes exactly that kind of AVI, MPEG-4 Part 2 video with MP3 sound, the combination DivX-certified players were built for. It always re-encodes, because an H.264 AVI would defeat the purpose.",
      "Those players often have limits of their own, commonly a maximum picture size around 720×576 or 1280×720 depending on the model. If the AVI plays with sound but a black picture, the resolution is the likely cause: make the video smaller with [compress video](/compress-video) and its resolution setting, then convert it here.",
      "AVI is not a good choice for anything else. It cannot carry subtitles in a standard way, handles variable frame rates poorly, and no browser, phone or social app plays it. Keep the MP4 as your main copy and treat the AVI as the version for that one player.",
    ],
    faq: [
      {
        q: "Which codec does the AVI use?",
        a: "MPEG-4 Part 2, the codec DivX and Xvid are built on, with MP3 sound. That is what DivX-certified players decode.",
      },
      {
        q: "Will the AVI play on my old DVD player?",
        a: "If the player lists DivX or Xvid support, it should. Very large pictures can still fail on some models; a 720p or smaller version is the safe choice.",
      },
      {
        q: "Does MP4 to AVI lose quality?",
        a: "Yes, a little: MPEG-4 Part 2 is older and less efficient than H.264, so the file is larger for the same look.",
      },
      {
        q: "Why is there no preview of the AVI?",
        a: "Browsers do not play AVI, so the preview keeps showing the MP4. Download the AVI and play it in VLC or on the player to check it.",
      },
      {
        q: "Is the MP4 uploaded?",
        a: "No. The ffmpeg engine writes the AVI inside your browser.",
      },
    ],
  },
  {
    from: "mp4",
    to: "mov",
    keywords: ["mp4 to mov converter", "mp4 to quicktime", "convert mp4 for final cut"],
    aliases: ["quicktime"],
    related: ["mov-to-mp4", "compress-video", "trim-video"],
    updatedAt: "2026-09-30",
    story: [
      "MOV and MP4 share the same internal structure, and H.264, HEVC and AAC fit in both, so converting an MP4 to MOV is a copy: the streams move into a QuickTime file unchanged and the picture is bit for bit the original; nothing is encoded, so it is limited by how fast your device reads and writes the file.",
      "The usual reason is a workflow that asks for .mov by name: an editing house's delivery spec, an older Apple application, a template or a hardware player that filters by extension. The content is not improved by the change; if the MP4 already opens where you need it, it is fine as it is.",
      "An MP4 whose sound is Opus, MP3 or FLAC is the exception. The MOV row of the capability table takes AAC and PCM, so that sound is re-encoded to AAC while the picture is still copied. An MP4 with VP9 video is re-encoded to H.264, since QuickTime does not play VP9.",
    ],
    faq: [
      {
        q: "Is MP4 to MOV lossless?",
        a: "For H.264 or HEVC with AAC, yes: nothing is re-encoded. Only unusual sound or VP9 video is encoded again.",
      },
      {
        q: "Is a MOV better quality than an MP4?",
        a: "No. The quality lives in the codec, and a copy keeps it identical. MOV only matters where something asks for it.",
      },
      {
        q: "Will Final Cut Pro or iMovie open the MOV?",
        a: "Yes, both open H.264 and HEVC in MOV. They open the same MP4 too, so convert only if a template or delivery spec asks for .mov.",
      },
      {
        q: "How long does it take?",
        a: "A copy encodes nothing, so it is limited by how fast your device reads and writes the file; the progress line shows real progress.",
      },
      {
        q: "Is my video uploaded?",
        a: "No. The copy is made inside your browser.",
      },
    ],
  },
  {
    from: "mov",
    to: "webm",
    keywords: ["mov to webm converter", "quicktime to webm", "iphone video to webm"],
    aliases: ["web video"],
    related: ["mp4-to-webm", "mov-to-mp4", "compress-video"],
    updatedAt: "2026-09-30",
    story: [
      "WebM does not accept the H.264 or HEVC that a MOV holds, so this conversion always re-encodes: the picture becomes VP9 and the sound Opus, in your browser, with the hardware encoder where one exists. The result is a royalty-free file for a website's video tag, usually smaller than the MOV at the same look.",
      "Fewer devices have a hardware VP9 encoder than an H.264 one, so this direction is slower than MOV to MP4, and a 4K iPhone clip stays 4K in the WebM. A web page rarely shows video that large; a lower resolution would encode faster and load faster for visitors.",
      "A MOV from Final Cut, Motion or a camera may hold ProRes, which browsers cannot decode, so such a file goes to the ffmpeg engine, which writes VP8 video instead of VP9 and holds the whole file in memory. For ProRes 4444 with transparency, check the result before relying on it, or export WebM with alpha straight from the editing application.",
    ],
    faq: [
      {
        q: "Can MOV to WebM be lossless?",
        a: "No. WebM only holds VP8, VP9 and AV1, so the H.264 or HEVC picture in a MOV is always re-encoded.",
      },
      {
        q: "Why is MOV to WebM slower than MOV to MP4?",
        a: "Both re-encode here, but hardware H.264 encoders are far more common than VP9 ones, so VP9 often runs in software.",
      },
      {
        q: "Does it keep a transparent background?",
        a: "Do not count on it. ProRes 4444 goes through the ffmpeg engine, and transparency is not checked here; your editor's own WebM export with alpha is the reliable route.",
      },
      {
        q: "Will the WebM play on iPhone?",
        a: "Recent Safari on a Mac plays WebM; on iPhone it depends on the iOS version, so send MP4 to phones.",
      },
      {
        q: "Is the MOV uploaded?",
        a: "No. It is re-encoded inside this browser tab.",
      },
    ],
  },
  {
    from: "mkv",
    to: "webm",
    keywords: ["mkv to webm converter", "matroska to webm", "obs mkv to webm"],
    aliases: ["matroska"],
    related: ["mkv-to-mp4", "mp4-to-webm", "compress-video"],
    updatedAt: "2026-09-30",
    story: [
      "WebM is a strict subset of Matroska, the same container limited to VP8, VP9 or AV1 video with Opus or Vorbis sound. An MKV that already holds those codecs converts by copy: the file is rewritten as WebM with nothing re-encoded, so it is limited by how fast your device reads and writes the file.",
      "Most MKVs hold H.264 instead, including every OBS recording on default settings, and many carry AAC, AC-3 or DTS sound. Those need a re-encode to VP9 and Opus, which runs on your device and depends on the recording's length and on whether the device has a hardware VP9 encoder. The ready state names the codecs and says which case applies.",
      "Subtitles, chapters and attachments that MKV allows are not WebM material here: text subtitle tracks and attachments are dropped. If the goal is a file that plays everywhere rather than one for a web page, [MKV to MP4](/mkv-to-mp4) is usually a lossless copy.",
    ],
    faq: [
      {
        q: "Is MKV to WebM lossless?",
        a: "Only when the MKV holds VP8, VP9 or AV1 with Opus or Vorbis. H.264, HEVC, AAC and AC-3 are re-encoded.",
      },
      {
        q: "Why is my OBS recording being re-encoded?",
        a: "OBS writes H.264 by default, which WebM cannot hold. MKV to MP4 would copy it instead.",
      },
      {
        q: "Are subtitles kept?",
        a: "No. Subtitle tracks and attachments are dropped; keep the MKV if you need them.",
      },
      {
        q: "How long does the re-encode take?",
        a: "It depends on the recording's length and on whether your device has a hardware VP9 encoder. The progress line counts real frames.",
      },
      {
        q: "Is the MKV uploaded?",
        a: "No. It is converted in your browser.",
      },
    ],
  },
  {
    from: "mkv",
    to: "mov",
    keywords: ["mkv to mov converter", "mkv to quicktime", "mkv for final cut", "mkv to imovie"],
    aliases: ["quicktime", "final cut", "imovie"],
    related: ["mkv-to-mp4", "mov-to-mp4", "mts-to-mp4", "trim-video"],
    updatedAt: "2026-09-30",
    story: [
      "Final Cut Pro, iMovie and QuickTime Player do not open MKV, which is what OBS records by default. An OBS recording holds H.264 and AAC, both of which MOV accepts, so the conversion is a copy: the streams go into a QuickTime file unchanged, ready to import; nothing is encoded, so it is limited by how fast your device reads and writes the file.",
      "MKVs from other sources vary more. HEVC and AV1 video copy too; VP9 does not fit a MOV and is re-encoded to H.264. Opus, AC-3 and DTS sound are re-encoded to AAC while the picture is still copied. The ready state names what it found and says whether the file will be copied or re-encoded before you press Convert.",
      "If you recorded several audio tracks in OBS, for example game sound and microphone apart, the MOV keeps them as separate tracks when their codec fits, so they can still be mixed apart in the editor. For a file to share rather than edit, [MKV to MP4](/mkv-to-mp4) is the usual choice.",
    ],
    faq: [
      {
        q: "Is MKV to MOV lossless?",
        a: "For H.264, HEVC or AV1 with AAC, which covers OBS recordings, yes. VP9 video and Opus, AC-3 or DTS sound are re-encoded.",
      },
      {
        q: "Why can't Final Cut open my MKV?",
        a: "Apple's apps do not read the Matroska container, whatever is inside. The same streams in a MOV import directly.",
      },
      {
        q: "Should I choose MOV or MP4 for editing?",
        a: "Either imports into Final Cut and iMovie. MOV suits Apple-only workflows; MP4 plays in more places if you also share the file.",
      },
      {
        q: "Are OBS's separate audio tracks kept?",
        a: "Yes, when their codec fits in MOV. Each stays a separate track.",
      },
      {
        q: "Is the recording uploaded?",
        a: "No. It is rewritten in your browser and stays on your device.",
      },
    ],
  },
  {
    from: "webm",
    to: "mov",
    keywords: ["webm to mov converter", "webm to quicktime", "webm for imovie", "webm to keynote"],
    aliases: ["quicktime", "imovie", "keynote"],
    related: ["webm-to-mp4", "mov-to-mp4", "mkv-to-webm", "trim-video"],
    updatedAt: "2026-09-30",
    story: [
      "Browser screen recorders and meeting tools save WebM, and iMovie, Final Cut Pro and Keynote will not import it. MOV cannot hold VP8 or VP9, so this conversion re-encodes the picture to H.264 and the Opus sound to AAC, on your device, giving a file that drops straight into Apple's apps.",
      "Screen recordings are mostly still frames with sudden changes, and they often carry a variable frame rate and a missing duration in the header, because the recorder stopped without finishing the file. The conversion reads the real frames, keeps each one's timing and writes the true length into the MOV, so the timeline in the editor matches the recording.",
      "If the destination is not an Apple app, [WebM to MP4](/webm-to-mp4) makes the same H.264 file with the .mp4 extension, which more upload forms and players accept. Choose MOV when a Keynote slide or an iMovie project is where the recording is going.",
    ],
    faq: [
      {
        q: "Is WebM to MOV lossless?",
        a: "No. MOV cannot hold VP8 or VP9, so the picture is re-encoded to H.264 and the sound to AAC.",
      },
      {
        q: "Will the MOV import into Keynote?",
        a: "Yes. H.264 with AAC in a MOV is what Keynote and iMovie handle natively.",
      },
      {
        q: "My WebM shows no length. Will the MOV?",
        a: "Yes. The true duration is measured from the frames during conversion and written into the MOV.",
      },
      {
        q: "MOV or MP4 for a screen recording?",
        a: "MOV for Apple's apps, MP4 for everything else. The picture inside is the same.",
      },
      {
        q: "Is my recording uploaded?",
        a: "No. It is converted inside your browser.",
      },
    ],
  },
];
