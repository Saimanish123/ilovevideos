/**
 * Profiles for the legacy, broadcast, camera and phone video formats (README.md#feature-catalog B11,
 * B12). Same shape and rules as the four core profiles in ./index.ts: facts only, shared by every pair
 * page that uses the format, exempt from the duplicate-paragraph check. `videoCodecs` and `audioCodecs`
 * list what files of this format actually contain, most common first, under mediabunny's names where it
 * has one and ffmpeg's otherwise; whether a stream is copied or re-encoded is decided against the target
 * container's row in ./containers.ts.
 */
import type { FormatProfile } from "./index";
import { formatNames } from "./names";

export type LegacyFormatId =
  | "avi"
  | "wmv"
  | "flv"
  | "mpeg"
  | "ts"
  | "mts"
  | "3gp"
  | "vob"
  | "ogv"
  | "m4v";

export const legacyFormats: Record<
  LegacyFormatId,
  Omit<FormatProfile, "id"> & { id: LegacyFormatId }
> = {
  avi: {
    id: "avi",
    name: formatNames.avi,
    container: "avi",
    extensions: ["avi", "divx"],
    videoCodecs: ["mpeg4", "mjpeg", "avc", "msmpeg4v3"],
    audioCodecs: ["mp3", "ac3", "pcm-s16"],
    origin: "DivX and Xvid downloads, 2000s digital cameras, old Windows capture software.",
    summary:
      "AVI (Audio Video Interleave) is the container Microsoft introduced in 1992. It stores video and sound as interleaved chunks with an index at the end of the file, and it was designed before B-frames, variable frame rates, subtitles and chapters were common, so codecs rely on workarounds to fit in it. Most AVI files people still have hold DivX or Xvid video (both MPEG-4 Part 2) with MP3 sound; compact cameras of the 2000s wrote Motion JPEG, and some later files carry H.264.",
    playback:
      "AVI with DivX or Xvid plays in VLC, on Windows with the decoders Windows 7 and later include, and on DVD players and TVs with DivX certification. It does not play in any browser, on iPhone or iPad without a third-party app, or in QuickTime Player, and most social and chat apps reject it on upload.",
  },
  wmv: {
    id: "wmv",
    name: formatNames.wmv,
    container: "wmv",
    extensions: ["wmv", "asf"],
    videoCodecs: ["wmv3", "vc1", "wmv2"],
    audioCodecs: ["wmav2"],
    origin: "Windows Movie Maker, old Windows screen recorders, training and conference videos.",
    summary:
      "WMV is Windows Media Video, Microsoft's codec family, stored in the ASF container (Advanced Systems Format). Windows Movie Maker, older Windows screen recorders, corporate training material and early-2000s downloads used it. WMV 9 was later standardised as VC-1 and holds up reasonably well; WMV 7 and 8 are older and blockier. The sound is almost always WMA.",
    playback:
      "WMV plays in Windows Media Player and the Windows Films & TV app, and in VLC on any system. QuickTime on a Mac has never played it without a plug-in, iPhones and Android phones need a third-party player, no browser plays it, and video sites and chat apps either convert it on upload or refuse it.",
  },
  flv: {
    id: "flv",
    name: formatNames.flv,
    container: "flv",
    extensions: ["flv", "f4v"],
    videoCodecs: ["avc", "flv1", "vp6f"],
    audioCodecs: ["aac", "mp3"],
    origin: "Flash-era video sites, webcam recorders, RTMP live-stream recordings.",
    summary:
      "FLV is the Flash Video container, what YouTube, news sites and webcam recorders delivered through Flash Player until it was switched off at the end of 2020. Early FLV files hold Sorenson Spark or On2 VP6 video with MP3 sound; from 2008 onwards most hold H.264 with AAC, the same streams an MP4 carries. Live streaming still packages video as FLV over RTMP, so streaming servers and some recorders save FLV files today.",
    playback:
      "Since Adobe ended Flash Player on 31 December 2020, no browser plays FLV. VLC and mpv still do and some editors import it, but phones, TVs, QuickTime and the players built into Windows do not, and upload forms reject the extension.",
  },
  mpeg: {
    id: "mpeg",
    name: formatNames.mpeg,
    container: "mpg",
    extensions: ["mpg", "mpeg", "mpe"],
    videoCodecs: ["mpeg2video", "mpeg1video"],
    audioCodecs: ["mp2", "ac3", "mp3"],
    origin: "DVD recorders, TV tuner cards, Video CDs, early digital cameras.",
    summary:
      "An .mpg or .mpeg file is an MPEG program stream: MPEG-1 video from Video CDs and early digital cameras, or MPEG-2 video from DVD recorders, TV tuner cards and camcorders that recorded straight to disc. The sound is MPEG audio layer 2 or Dolby Digital (AC-3). Both video codecs date from the 1990s and need roughly twice the bitrate of H.264 for the same picture, which is why these files are large for their length.",
    playback:
      "MPEG-2 files play in VLC, on DVD players and on Windows with Microsoft's MPEG-2 video extension. They do not play in Chrome, Safari or Firefox, QuickTime Player on current macOS does not open them, and phones and chat apps generally refuse .mpg uploads.",
  },
  ts: {
    id: "ts",
    name: formatNames.ts,
    container: "ts",
    extensions: ["ts", "m2t"],
    videoCodecs: ["avc", "hevc", "mpeg2video"],
    audioCodecs: ["aac", "ac3", "mp3", "mp2"],
    origin: "TV recorders and set-top boxes, IPTV and HLS stream captures, some screen recorders.",
    summary:
      "A .ts file is an MPEG transport stream, the broadcast format: digital TV, satellite, IPTV and HLS streaming all send video as a run of 188-byte packets that a receiver can join at any point. That is why TV recorders, stream capture tools and some screen recorders save .ts files. Inside is usually H.264 or HEVC with AAC or AC-3 sound, or MPEG-2 video in older broadcast recordings.",
    playback:
      "VLC, mpv, Plex and Windows 10 and 11 play .ts files. A downloaded .ts does not play in Chrome or Firefox, on iPhone or in QuickTime Player, most editors refuse it, and upload forms reject the extension even when the streams inside are the same as an MP4's.",
  },
  mts: {
    id: "mts",
    name: formatNames.mts,
    container: "ts",
    extensions: ["mts", "m2ts"],
    videoCodecs: ["avc", "hevc"],
    audioCodecs: ["ac3", "pcm-s16", "aac"],
    origin: "AVCHD camcorders from Sony, Panasonic and Canon; Blu-ray disc structures.",
    summary:
      "MTS and M2TS are AVCHD files, the format Sony, Panasonic and Canon camcorders recorded to cards and hard drives from 2006 onwards, and the files on a Blu-ray disc. They are MPEG transport streams with a 4-byte timestamp in front of every packet. The video is H.264, often interlaced 1080i at 50 or 60 fields per second; the sound is Dolby Digital (AC-3), sometimes uncompressed PCM.",
    playback:
      "Windows 10 and 11 and VLC play MTS files, and macOS imports them through Photos or iMovie from the camera's complete card folder. A loose .mts file does not open in QuickTime Player, and phones, browsers and social apps do not accept it.",
  },
  "3gp": {
    id: "3gp",
    name: formatNames["3gp"],
    container: "3gp",
    extensions: ["3gp", "3g2"],
    videoCodecs: ["h263", "mpeg4", "avc"],
    audioCodecs: ["amr_nb", "aac"],
    origin: "Feature phones and early smartphones from Nokia, Sony Ericsson, Samsung and Motorola.",
    summary:
      "3GP is the video format of the pre-smartphone era, defined by the 3rd Generation Partnership Project as a trimmed-down MP4 for slow networks and small screens. Nokia, Sony Ericsson and Samsung phones recorded it at 176×144 or 320×240 with H.263 or MPEG-4 Part 2 video and AMR sound, which is tuned for voice; later phones put H.264 and AAC in the same container.",
    playback:
      "Android phones and VLC play 3GP. Apple devices, browsers and most editors handle only some 3GP files, depending on the codecs inside; the AMR sound of old phones is the usual reason one refuses to play or comes out silent.",
  },
  vob: {
    id: "vob",
    name: formatNames.vob,
    container: "vob",
    extensions: ["vob"],
    videoCodecs: ["mpeg2video"],
    audioCodecs: ["ac3", "mp2", "pcm_dvd"],
    origin: "The VIDEO_TS folder of a DVD: home DVD recorders, camcorders, copied discs.",
    summary:
      "VOB files are the video of a DVD, stored in its VIDEO_TS folder in pieces of at most 1 GB (VTS_01_1.VOB, VTS_01_2.VOB and so on). Each holds MPEG-2 video at 720×480 (NTSC) or 720×576 (PAL), Dolby Digital or MPEG sound, and subtitles drawn as images. Commercial discs are also encrypted with CSS; files from a home-made or camcorder DVD are not.",
    playback:
      "VOB files play in VLC and in DVD player software, and on Windows with Microsoft's MPEG-2 video extension. Macs, phones, browsers and most editors do not open them directly, which is why a folder of VOBs usually has to be converted before it can be watched anywhere else or edited.",
  },
  ogv: {
    id: "ogv",
    name: formatNames.ogv,
    container: "ogv",
    extensions: ["ogv", "ogg"],
    videoCodecs: ["theora", "vp8"],
    audioCodecs: ["vorbis", "opus", "flac"],
    origin: "Wikimedia Commons, Linux screen recorders, open-source project videos.",
    summary:
      "OGV is video in the Ogg container from the Xiph.Org Foundation, almost always Theora video with Vorbis sound. It was the open, patent-free choice for web video before WebM existed, which is why Wikimedia Commons, Linux desktop recorders and open-source projects used it. Theora compresses about as well as MPEG-4 Part 2, well behind H.264 and VP9.",
    playback:
      "VLC, mpv and most Linux video players play OGV. Safari, iPhones, QuickTime, the players built into Windows and nearly every social or chat app do not, and browser support for Theora has been shrinking.",
  },
  m4v: {
    id: "m4v",
    name: formatNames.m4v,
    container: "mp4",
    extensions: ["m4v"],
    videoCodecs: ["avc", "hevc"],
    audioCodecs: ["aac", "ac3"],
    origin: "iTunes and Apple TV app downloads, Handbrake's Apple presets, older iPod exports.",
    summary:
      "M4V is Apple's name for an MP4 file: the same container, with the .m4v extension that iTunes, the Apple TV app and Handbrake's Apple presets write. It usually holds H.264 or HEVC video with AAC sound, sometimes with an extra Dolby Digital track for home theatre. Films and episodes bought or rented from Apple are M4V files protected with FairPlay DRM, which only Apple's own apps can play.",
    playback:
      "An M4V without DRM plays wherever MP4 plays once the player recognises the extension: Apple devices, VLC and most browsers accept it, while some Android galleries, smart TVs and upload forms only look for .mp4 and skip it. Files with FairPlay DRM play only in Apple's apps, signed in to the account that bought them.",
  },
};
