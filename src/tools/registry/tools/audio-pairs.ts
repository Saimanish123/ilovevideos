import { ffmpegDownloadSize } from "@/tools/engines/ffmpeg/size";
import { type AudioPairSpec, audioPairTool } from "../audio-pairs";

/**
 * Shipped audio → audio pairs. Each has a story that is true and specific to the pair; everything
 * else is handled by /audio-converter without a page. Pruned on 2026-09-30 for lack of an honest
 * story: mp3-to-flac and mp3-to-ogg (nothing to say beyond "it does not help"), wma-to-wav and
 * ogg-to-wav (the hub covers them), and every *-to-opus and *-to-aiff pair (no search demand we
 * could verify).
 */
const specs: AudioPairSpec[] = [
  {
    from: "wav",
    to: "mp3",
    keywords: [
      "wav to mp3 320kbps",
      "convert wav to mp3 without losing quality",
      "wav file to mp3",
    ],
    aliases: ["wave to mp3", "uncompressed to mp3"],
    related: ["flac-to-mp3", "mp3-to-wav", "wav-to-flac"],
    updatedAt: "2026-09-30",
    story: [
      "A WAV straight out of a recorder, a DAW bounce or a CD rip is uncompressed, so a four-minute song at CD quality is about 42 MB. As MP3 at 192 kbps the same four minutes is about 5.8 MB, and at 320 kbps about 9.6 MB. This is the conversion where MP3 makes the most sense: the source has never been compressed, so the encoder works from the full signal and the only loss is the one you choose with the bitrate.",
      "Studio WAVs are often 24-bit at 48 or 96 kHz. MP3 cannot store more than 48 kHz, so a 96 kHz recording comes out at 48 kHz, and the bit depth does not carry over either, because MP3 stores a bitrate rather than a bit depth. Neither is audible at normal listening levels, but it is why an MP3 should be a copy for listening and never replace the master WAV.",
      "Most WAV files carry no tags that other software reads, so the MP3 usually starts without a title or artist. When the WAV does have RIFF INFO tags (some recorders and editors write them), ffmpeg copies them into the MP3's ID3 tags.",
    ],
    faq: [
      {
        q: "What bitrate should I use for WAV to MP3?",
        a: "192 kbps for music you listen to, 320 kbps if the MP3 is the copy you keep, 128 kbps for speech, lectures and voice memos. The size line under the controls shows what each choice costs for your file.",
      },
      {
        q: "Does converting WAV to MP3 lose quality?",
        a: "Some, because MP3 is lossy, but at 192 kbps or more most listeners hear no difference at normal volume. Keep the WAV if you may edit, master or convert the recording again later.",
      },
      {
        q: "Why is the MP3 so much smaller than the WAV?",
        a: "The WAV stores every sample as a plain number, about 10 MB per minute at CD quality. MP3 at 192 kbps needs about 1.4 MB per minute because the encoder leaves out what it predicts you will not hear.",
      },
      {
        q: "Can it handle a 24-bit, 96 kHz WAV?",
        a: "Yes. The WAV is read in full precision and the MP3 is written at 48 kHz, the highest rate the MP3 format has.",
      },
    ],
  },
  {
    from: "m4a",
    to: "mp3",
    keywords: ["m4a to mp3 converter", "voice memo to mp3", "itunes m4a to mp3"],
    aliases: ["voice memo to mp3", "apple audio to mp3"],
    related: ["mp3-to-m4a", "m4a-to-wav", "aac-to-mp3", "wma-to-mp3"],
    updatedAt: "2026-09-30",
    story: [
      "Most M4A files hold AAC: Voice Memos recordings from an iPhone, songs bought or ripped with iTunes or Apple's Music app, and audio saved by many Android voice recorders. Converting to MP3 decodes that AAC and encodes it again with the LAME MP3 encoder, a second lossy step. Choose 192 kbps or more for music; at 128 kbps an MP3 made from AAC can lose detail you could still hear in the M4A.",
      "Some M4A files hold Apple Lossless (ALAC) instead, typically CD imports with the lossless setting. Apple Lossless is decoded without any loss by the ffmpeg engine before the MP3 encode, so the result is as good as an MP3 made from the CD itself.",
      "For a Voice Memo or any other speech recording, 128 kbps is plenty; more bitrate does not make a voice clearer. The MP3 keeps the recording's own sample rate and its channel count, so a mono memo stays mono.",
    ],
    faq: [
      {
        q: "Why not keep the M4A?",
        a: "If the device you are sending to plays M4A, keep it: it is smaller at the same quality, and converting costs a little. Convert when a car stereo, an old MP3 player or an upload form insists on .mp3.",
      },
      {
        q: "Which bitrate for M4A to MP3?",
        a: "At least the bitrate of the M4A, and 192 kbps for music in any case. The panel shows the M4A's own bitrate; going far above it only makes the file bigger.",
      },
      {
        q: "Can it convert an iTunes .m4p song?",
        a: "No. Songs in .m4p files are protected with Apple's FairPlay copy protection, and nothing outside Apple's own software can decode them.",
      },
      {
        q: "Are the song title and artist kept?",
        a: "Yes. The iTunes-style tags in the M4A are written into the MP3 as ID3v2 tags, which every music app reads.",
      },
    ],
  },
  {
    from: "flac",
    to: "mp3",
    keywords: ["flac to mp3 320", "convert flac to mp3 for iphone", "flac to mp3 converter"],
    aliases: ["lossless to mp3"],
    related: ["flac-to-wav", "wav-to-mp3", "m4a-to-mp3"],
    updatedAt: "2026-09-30",
    story: [
      "FLAC libraries are usually converted for one of three places: an iPhone or Mac music library, because Apple's Music app does not import FLAC; a car stereo or older player that reads only MP3; or a phone with little free storage. A FLAC of a four-minute CD track is roughly 20 to 30 MB; the MP3 at 320 kbps is about 9.6 MB and at 192 kbps about 5.8 MB.",
      "Because FLAC is lossless, this is a first-generation MP3, as good as an MP3 made straight from the CD. 320 kbps is the usual choice for a collection you will keep; 192 kbps is hard to tell apart on phone speakers and earbuds. High-resolution FLAC at 88.2 or 96 kHz comes out at 48 kHz, the highest rate MP3 supports.",
      "The Vorbis comments in the FLAC (title, artist, album, track number) are copied into ID3v2 tags. Cover art embedded in the FLAC is not carried over, because only the audio stream is converted; add artwork in your music app after importing.",
    ],
    faq: [
      {
        q: "Is FLAC to MP3 worth it if I have the space?",
        a: "Only when your player cannot read FLAC. Keep the FLAC files as your originals: an MP3 can always be made again from them, but a FLAC can never be made back from an MP3.",
      },
      {
        q: "Should I pick 320 or 192 kbps?",
        a: "320 kbps for music you will hear on good headphones or keep for years, 192 kbps when space matters more. Both are made from the lossless source, so each is as good as MP3 gets at that bitrate.",
      },
      {
        q: "Is the album art kept?",
        a: "Not yet. The picture embedded in the FLAC is dropped and the MP3 carries only the text tags.",
      },
      {
        q: "Can I convert a whole album at once?",
        a: "Yes. Drop every track at once; each is converted with the same settings and listed with its own download, plus one ZIP of all of them.",
      },
    ],
  },
  {
    from: "mp3",
    to: "wav",
    keywords: ["mp3 to wav converter", "convert mp3 to wav for editing", "mp3 to wav 16 bit"],
    aliases: ["mp3 to wave", "mp3 to pcm"],
    related: ["wav-to-mp3", "m4a-to-wav", "flac-to-wav"],
    updatedAt: "2026-09-30",
    story: [
      "People convert MP3 to WAV because something downstream asks for it: an audio editor or DAW that works in PCM, CD-burning software, a sampler, or an upload form for voice-over, radio and broadcast work. The WAV holds the decoded sound as 16-bit PCM at the MP3's own sample rate. It does not sound better than the MP3 and cannot restore what the MP3 encoder removed; it only stops further loss if the audio is edited and saved again.",
      "Expect the file to grow about tenfold: a 128 kbps MP3 is roughly 1 MB per minute, the WAV about 10 MB per minute for stereo at 44.1 kHz. The conversion runs on the browser's own media engine, without loading the ffmpeg download, so even a long recording finishes quickly.",
      "WAV has no tag format that music apps agree on, so the title and artist may not show up anywhere once the audio is a WAV. Keep the MP3 as the tagged copy for listening.",
    ],
    faq: [
      {
        q: "Will MP3 to WAV improve the sound?",
        a: "No. The WAV contains the same sound the MP3 plays, only stored without compression. It helps editing and compatibility, not quality.",
      },
      {
        q: "Why is the WAV ten times bigger?",
        a: "An MP3 at 128 kbps uses 128 kilobits per second; uncompressed CD-quality PCM uses 1,411. The WAV simply writes out every sample the MP3 decodes to.",
      },
      {
        q: "What sample rate and bit depth does the WAV have?",
        a: "The MP3's own sample rate, usually 44.1 kHz, as 16-bit PCM with the same number of channels. That is what CD burners and most editors expect.",
      },
      {
        q: "Does MP3 to WAV need the ffmpeg download?",
        a: "No. MP3 decoding and WAV writing both run on the browser's built-in media engine, so nothing extra is loaded.",
      },
    ],
  },
  {
    from: "ogg",
    to: "mp3",
    keywords: ["ogg to mp3 converter", "ogg vorbis to mp3", "telegram voice ogg to mp3"],
    aliases: ["vorbis to mp3", "oga to mp3"],
    related: ["opus-to-mp3", "wav-to-mp3"],
    updatedAt: "2026-09-30",
    story: [
      ".ogg files come from two different places. Game files, sound effects, open-source software and some music downloads use Ogg Vorbis; voice messages saved from Telegram and some other chat apps are Opus inside an .ogg or .oga file. The file card shows which codec yours holds. Either way ffmpeg decodes it and the LAME encoder writes the MP3, inside your browser.",
      "For a voice message, 128 kbps is more than enough, and the MP3 will be larger than the original because Opus is far more efficient at low bitrates: a minute of speech at 24 kbps Opus is about 180 KB, the MP3 at 128 kbps about 960 KB. For music in Vorbis, choose at least the Vorbis file's own bitrate, which the panel shows.",
      "Keep the .ogg for game audio that has to loop. MP3 encoders add a few milliseconds of silence at the start and end of the file (encoder delay and padding), so a sound designed to loop without a gap can click or stutter as an MP3. Vorbis comments such as title and artist are copied into ID3 tags.",
    ],
    faq: [
      {
        q: "My .ogg is a voice message. Will it work?",
        a: "Yes. Voice messages are usually Opus inside the Ogg file; the page reads Opus as well as Vorbis and writes an ordinary MP3.",
      },
      {
        q: "Is OGG better quality than MP3?",
        a: "At the same bitrate, Vorbis and especially Opus usually sound better than MP3. Converting cannot add quality, so choose a bitrate at or above the original to keep the added loss small.",
      },
      {
        q: "Why is the MP3 bigger than the OGG?",
        a: "Ogg files, voice messages in particular, often use very low bitrates that only Vorbis and Opus handle well. MP3 needs more bits for the same clarity.",
      },
      {
        q: "Is the OGG file sent to a server?",
        a: "No. Decoding and encoding happen in this browser tab, and the file is never sent anywhere.",
      },
    ],
  },
  {
    from: "aac",
    to: "mp3",
    keywords: ["aac to mp3 converter", "convert aac file to mp3", "adts aac to mp3"],
    aliases: ["raw aac to mp3"],
    related: ["m4a-to-mp3", "opus-to-mp3"],
    updatedAt: "2026-09-30",
    story: [
      "A .aac file is AAC without a container, as written by some call and voice recorders, stream capture tools and programs that pull the sound out of TV recordings. With no index, players often show the wrong length or cannot seek. MP3 has no index either, but players have handled it for decades, and the MP3 written here is constant bitrate, so its length shows correctly and seeking works everywhere.",
      "If you only need a file that plays and seeks properly and your player accepts M4A, the [audio converter](/audio-converter) can instead copy the same AAC frames into an M4A without re-encoding: no quality loss, and because nothing is encoded it is limited only by how fast your device reads and writes the file. MP3 means a decode and a second lossy encode, so choose at least the source bitrate shown in the panel.",
      "Raw AAC usually carries no tags, so the MP3 starts without a title or artist; add them in your music app afterwards.",
    ],
    faq: [
      {
        q: "Why does my .aac file show the wrong duration?",
        a: "Raw AAC has no index, so players estimate the length from the first frames and the file size, and a variable bitrate throws the estimate off. The constant-bitrate MP3 from this page shows its length correctly.",
      },
      {
        q: "Is AAC to M4A lossless?",
        a: "Yes, on the audio converter: the AAC frames are copied into an MP4 container unchanged. This page always makes MP3, which re-encodes.",
      },
      {
        q: "What is the difference between .aac and .m4a?",
        a: "The sound is the same AAC codec. An .m4a wraps it in an MP4 container with an index and tags; an .aac file is the bare stream.",
      },
      {
        q: "Which bitrate should I pick for AAC to MP3?",
        a: "The AAC file's own bitrate or the next preset above it. For speech recordings 128 kbps is enough, for music 192 kbps.",
      },
    ],
  },
  {
    from: "wma",
    to: "mp3",
    keywords: ["wma to mp3 converter", "windows media audio to mp3", "convert wma files to mp3"],
    aliases: ["windows media audio to mp3"],
    related: ["m4a-to-mp3", "wav-to-mp3"],
    updatedAt: "2026-09-30",
    story: [
      `WMA files are mostly old CD rips: Windows Media Player used WMA as its default ripping format for years, so music folders from the 2000s are often full of it. This page decodes WMA with ffmpeg compiled to WebAssembly (loaded once from this site, about ${ffmpegDownloadSize()}) and encodes MP3 with LAME, all inside your browser. WMA Standard, WMA Pro, WMA Lossless and WMA Voice are all read.`,
      "Files bought from old music stores such as MSN Music often carry Windows Media DRM. Nothing outside licensed Windows software can decode those, so they cannot be converted here or anywhere else.",
      "WMA is a lossy codec, except WMA Lossless, so this is a second lossy step. Many old rips are 128 kbps WMA, and 192 kbps MP3 keeps what is there; 320 kbps only makes the file bigger. Browsers cannot play WMA, so there is no preview before converting, but the MP3 plays on the page as soon as it is ready.",
    ],
    faq: [
      {
        q: "Can it convert protected WMA files?",
        a: "No. WMA files with DRM from old music stores can only be played by licensed Windows software, and converters cannot read them.",
      },
      {
        q: "Why is there no preview before converting?",
        a: "Browsers do not play WMA, so the page cannot play or draw the file until it has become an MP3. The MP3 plays on the page once it is done.",
      },
      {
        q: "Are artist and album tags carried over?",
        a: "Yes, where ffmpeg recognises them: the title, artist and album that Windows Media Player wrote are copied into ID3 tags.",
      },
      {
        q: `Does the about ${ffmpegDownloadSize()} download happen for every file?`,
        a: "Only the first time. The browser keeps it, so later conversions start without the wait.",
      },
    ],
  },
  {
    from: "opus",
    to: "mp3",
    keywords: ["opus to mp3 converter", "whatsapp voice note to mp3", "convert opus file to mp3"],
    aliases: ["whatsapp audio to mp3", "voice note to mp3"],
    related: ["ogg-to-mp3", "m4a-to-mp3"],
    updatedAt: "2026-09-30",
    story: [
      "Most .opus files are voice notes: WhatsApp records voice messages with Opus, and Android phones show them as .opus files when you save, share or back them up. Opus is excellent at low bitrates, so a voice note is often only 16 to 32 kbps. Converting to MP3 at 128 kbps gives a file that every phone, computer, editor and transcription service accepts, several times larger than the original.",
      "Opus always decodes at 48 kHz, so the MP3 is 48 kHz too. A voice note is mono and the MP3 stays mono, so all of its bitrate goes to the one voice channel.",
      "The page decodes the Opus natively to draw its waveform and play it, and the MP3 is encoded with the LAME encoder in ffmpeg compiled to WebAssembly, loaded once from this site.",
    ],
    faq: [
      {
        q: "What bitrate is enough for a voice note?",
        a: "128 kbps is plenty for speech. 192 kbps is only worth it for music saved as Opus.",
      },
      {
        q: "Why is the MP3 so much bigger than the Opus file?",
        a: "Opus keeps speech clear at a fraction of the bitrate MP3 needs. At 128 kbps the MP3 is usually four to eight times the size of a voice note.",
      },
      {
        q: "What about .ogg voice messages from Telegram?",
        a: "They are Opus too, only with the .ogg extension; the [OGG to MP3](/ogg-to-mp3) page handles them the same way.",
      },
      {
        q: "Does the voice note leave my phone?",
        a: "No. It is decoded and re-encoded inside the browser on your phone or computer; nothing is uploaded.",
      },
    ],
  },
  {
    from: "aiff",
    to: "mp3",
    keywords: ["aiff to mp3 converter", "aif to mp3", "convert aiff to mp3 mac"],
    aliases: ["aif to mp3"],
    related: ["aiff-to-wav", "wav-to-mp3", "flac-to-mp3"],
    updatedAt: "2026-09-30",
    story: [
      "AIFF files usually come from a Mac: Logic Pro and GarageBand exports, CD imports with iTunes or Music set to AIFF, and sample libraries. They are uncompressed, so a four-minute song at CD quality is about 42 MB, and as MP3 at 320 kbps it is about 9.6 MB. Because nothing was lost on the way in, this is a first-generation MP3, as good as the format gets at the bitrate you pick.",
      `Chrome, Firefox and Edge cannot read AIFF, so this page decodes it with ffmpeg compiled to WebAssembly (about ${ffmpegDownloadSize()}, loaded once and kept by the browser) and encodes the MP3 with LAME, all on your device. For the same reason no waveform is drawn for the AIFF itself; the MP3 plays on the page once it is done.`,
      "Tags that Apple's apps wrote into the AIFF (title, artist, album) are copied into the MP3 where ffmpeg can read them. High sample rates such as 96 kHz come out at 48 kHz, the most MP3 holds.",
    ],
    faq: [
      {
        q: "Should I convert AIFF to MP3 or to WAV?",
        a: "MP3 to share or to save space; [WAV](/aiff-to-wav) when a Windows program or an upload form wants uncompressed audio. WAV keeps every sample and is the same size as the AIFF.",
      },
      {
        q: "Why can't I play the AIFF on this page first?",
        a: "Chrome, Firefox and Edge have no AIFF support, so there is nothing to play until it is converted. Safari can play it.",
      },
      {
        q: "Which bitrate should I use for AIFF to MP3?",
        a: "320 kbps for music you want to keep, 192 kbps for everyday listening. The source is lossless, so the bitrate alone decides the quality.",
      },
      {
        q: "Is the AIFF uploaded for conversion?",
        a: "No. ffmpeg runs inside your browser tab; the AIFF is read from your disk and the MP3 is written back to it.",
      },
    ],
  },
  {
    from: "wav",
    to: "flac",
    keywords: ["wav to flac converter", "compress wav lossless", "convert wav to flac"],
    aliases: ["lossless compression"],
    related: ["flac-to-wav", "wav-to-mp3"],
    updatedAt: "2026-09-30",
    story: [
      "WAV to FLAC is the one audio conversion with no trade-off: FLAC is lossless, so decoding it gives back exactly the samples of the WAV, and the file is typically 50 to 70 percent of the size. Recordings, CD rips and DAW bounces kept as FLAC take roughly half the disk space and can be turned back into identical audio at any time with [FLAC to WAV](/flac-to-wav).",
      "FLAC also fixes WAV's two practical weaknesses. It stores proper tags (Vorbis comments) that music apps read, and it records an MD5 checksum of the audio, so a damaged copy can be detected years later with `flac -t`. FLAC stores integer samples only, so a 32-bit floating-point WAV from a DAW is converted to integers, which is not bit-exact; 16- and 24-bit WAVs, nearly all of them, are.",
      "The encoder runs in ffmpeg compiled to WebAssembly, loaded once from this site. The whole WAV is held in memory while it works, so very long multitrack recordings over about 2 GB are better converted on a desktop computer.",
    ],
    faq: [
      {
        q: "Is WAV to FLAC really lossless?",
        a: "Yes, for 16-bit and 24-bit PCM, which is nearly every WAV: FLAC stores the same samples, only packed more efficiently. Converting back gives identical audio.",
      },
      {
        q: "How much smaller will the FLAC be?",
        a: "Typically 50 to 70 percent of the WAV. Quiet, simple recordings compress more; dense, loud music and noise compress less. The result card shows the real number.",
      },
      {
        q: "Can every program open FLAC?",
        a: "Most can, but Apple's Music app and some editors cannot. Keep a WAV copy, or convert back, when one of them needs the audio.",
      },
      {
        q: "Does it keep the WAV's sample rate and bit depth?",
        a: "Yes. A 16-bit WAV becomes a 16-bit FLAC and a 24-bit WAV a 24-bit FLAC, at the same sample rate and channel count.",
      },
    ],
  },
  {
    from: "flac",
    to: "wav",
    keywords: ["flac to wav converter", "convert flac to wav lossless", "flac to wav 24 bit"],
    aliases: ["flac to wave"],
    related: ["wav-to-flac", "flac-to-mp3", "mp3-to-wav"],
    updatedAt: "2026-09-30",
    story: [
      "FLAC to WAV is exact: the WAV holds the same samples the FLAC encodes, at the same sample rate and channel count. The page reads the bit depth from the FLAC header, so a 16-bit CD rip becomes a 16-bit WAV and a 24-bit master a 24-bit WAV. Expect the file to grow by half again to double.",
      "Convert when something cannot read FLAC: CD-burning software, some DAWs and video editors, samplers and hardware players, broadcast and voice-over upload forms that ask for WAV. The conversion runs in ffmpeg compiled to WebAssembly, loaded once from this site: the browser's own path from decoded sound to 16-bit PCM rounds some samples by one step, and ffmpeg's integer path does not, so the WAV is bit-exact.",
      "Tags do not come along in a form most programs read, because WAV has no tag standard that music apps agree on. Keep the FLAC as the tagged, compact master and treat the WAV as a working copy.",
    ],
    faq: [
      {
        q: "Is FLAC to WAV lossless?",
        a: "Yes. Decoding FLAC is exact by design, and the WAV is written at the FLAC's own bit depth, so every sample matches.",
      },
      {
        q: "Why is the WAV so much bigger than the FLAC?",
        a: "FLAC packs the samples the way a zip file packs text; WAV writes every sample out in full. The sound is identical.",
      },
      {
        q: "Does it keep 24-bit and 96 kHz?",
        a: "Yes. 24-bit FLAC is written as 24-bit PCM, and the sample rate and channels are kept as they are.",
      },
      {
        q: "Can I get the FLAC back later?",
        a: "Yes. [WAV to FLAC](/wav-to-flac) packs it again with the same audio, though tags have to be added again.",
      },
    ],
  },
  {
    from: "m4a",
    to: "wav",
    keywords: ["m4a to wav converter", "voice memo to wav", "convert m4a to wav for editing"],
    aliases: ["voice memo to wav", "aac to wav"],
    related: ["m4a-to-mp3", "mp3-to-wav"],
    updatedAt: "2026-09-30",
    story: [
      "Voice Memos, interview recordings and phone audio are usually M4A with AAC inside, and audio editors, transcription and subtitling services, forensic and broadcast tools often want WAV instead. This page decodes the AAC once and writes 16-bit PCM at the recording's own sample rate and channel count, on the browser's own media engine, without the ffmpeg download. Apple Lossless M4A files are decoded by ffmpeg instead, without any loss.",
      "The WAV sounds exactly like the M4A, because it holds what the AAC decoder produces; it is not better quality, only easier for other software to work with. It is also far larger: a 128 kbps M4A is about 1 MB per minute, the WAV about 10 MB per minute in stereo at 44.1 kHz, or about 5.8 MB per minute for a mono recording at 48 kHz.",
    ],
    faq: [
      {
        q: "Will the WAV sound better than the M4A?",
        a: "No. It is the M4A's sound stored without compression. That helps editing and compatibility, not quality.",
      },
      {
        q: "What sample rate will the WAV have?",
        a: "The same as the M4A, usually 44.1 or 48 kHz. Voice Memos recordings keep their own rate and channel count.",
      },
      {
        q: "Is there a size limit for M4A to WAV?",
        a: "No fixed limit, but the WAV is built in memory, so a two-hour recording (about 1.3 GB of stereo WAV at 44.1 kHz) needs a desktop browser with enough free memory. Classic WAV files stop at 4 GB.",
      },
      {
        q: "Does the recording leave my device?",
        a: "No. It is read and converted inside your browser, and the WAV is saved straight to your downloads.",
      },
    ],
  },
  {
    from: "mp3",
    to: "m4a",
    keywords: ["mp3 to m4a converter", "convert mp3 to aac", "mp3 to m4a for iphone"],
    aliases: ["mp3 to aac"],
    related: ["m4a-to-mp3", "mp3-to-wav"],
    updatedAt: "2026-11-18",
    story: [
      "Converting MP3 to M4A does not improve quality: the MP3 is decoded and encoded again as AAC, a second lossy step. It makes sense when something accepts only M4A or AAC, for example preparing an iPhone ringtone (an .m4r file is AAC in the same MPEG-4 container; the [ringtone maker](/ringtone-maker) writes one directly), an app or device that takes only .m4a, or keeping a library that is otherwise all AAC.",
      "Choose a bitrate at or above the MP3's own, which the panel shows. AAC at the source bitrate keeps the added loss small, while a lower bitrate compounds it. The encoder is ffmpeg's built-in AAC encoder, running in WebAssembly on your device; for most music 192 kbps is transparent.",
      "The MP3's ID3 tags (title, artist, album) are written as iTunes-style tags in the M4A, which Apple's Music app and iPhones read.",
    ],
    faq: [
      {
        q: "Will MP3 to M4A make my files smaller?",
        a: "Only if you choose a lower bitrate, and that costs quality twice. At the same bitrate the M4A is about the same size as the MP3.",
      },
      {
        q: "Why is AAC considered better than MP3?",
        a: "AAC is a newer, more efficient codec: at the same bitrate it usually keeps more detail, especially at 128 kbps and below. That advantage applies to encoding from the original, not to re-encoding an MP3.",
      },
      {
        q: "Does the M4A play on Android and Windows?",
        a: "Yes. Android phones, Windows 10 and 11 and every current browser play AAC in M4A.",
      },
      {
        q: "Is the MP3 uploaded for conversion?",
        a: "No. The AAC encoder runs in your browser; the MP3 is read from your device and the M4A written back to it.",
      },
    ],
  },
  {
    from: "aiff",
    to: "wav",
    keywords: ["aiff to wav converter", "aif to wav", "convert aiff to wav for windows"],
    aliases: ["aif to wav", "mac audio to wav"],
    related: ["aiff-to-mp3", "wav-to-flac"],
    updatedAt: "2026-09-30",
    story: [
      "AIFF and WAV store the same thing, uncompressed PCM, so converting between them is lossless: the samples are the same, only their byte order changes (AIFF is big-endian, WAV little-endian) along with the container around them. 16-bit AIFF becomes 16-bit WAV and 24-bit stays 24-bit, with the sample rate and channels kept, so the file is almost exactly the same size.",
      `The usual reason is moving audio from a Mac to Windows or to web software: a Logic or GarageBand bounce, a sample pack, or a CD import set to AIFF. Chrome, Firefox and Edge cannot read AIFF at all, so this page uses ffmpeg compiled to WebAssembly (about ${ffmpegDownloadSize()}, loaded once) for the conversion, and the WAV then plays on the page.`,
      "Tags that Apple's apps wrote into the AIFF have no widely read equivalent in WAV, so the WAV may show no title or artist in music apps.",
    ],
    faq: [
      {
        q: "Is AIFF to WAV lossless?",
        a: "Yes. Both formats hold uncompressed PCM; the conversion rewrites the same samples in WAV's byte order.",
      },
      {
        q: "Why is the WAV the same size as the AIFF?",
        a: "Because nothing is compressed in either. Only the headers differ, by a few bytes.",
      },
      {
        q: "What about AIFF-C files?",
        a: "AIFF-C can hold compressed audio as well as plain PCM. PCM in either byte order converts losslessly; compressed AIFF-C, such as IMA ADPCM, is decoded to 16-bit PCM.",
      },
      {
        q: "Does AIFF to WAV run offline?",
        a: "Once the page and the converter have loaded, yes: everything happens in the browser and the file is never sent anywhere.",
      },
    ],
  },
];

export const audioPairTools = specs.map(audioPairTool);
