/**
 * Audio format profiles (ADR-0011, same model as ./index.ts for video). Each audio format is
 * described once; audio pair pages compose two profiles with a hand-written pair story. Profile
 * paragraphs are shared across pages by design and exempt from the registry's duplicate check;
 * every pair page still needs its own >= 150 words (`pnpm lint:registry`). Capability facts (what
 * we can read, write, copy) live in ./audio.ts; this file is prose only.
 */
import type { AudioFormatId, AudioSourceSpec } from "./audio";

export type AudioProfileId = AudioSourceSpec["id"];

export interface AudioProfile {
  id: AudioProfileId;
  /** As the world writes it. */
  name: string;
  /** Output format id when we can write it (pair targets). */
  target?: AudioFormatId;
  /** One paragraph: what the format is, how it stores sound. Shared across pages. */
  summary: string;
  /** One paragraph: where it plays and where it does not. Shared across pages. */
  playback: string;
}

export const audioProfiles: Record<AudioProfileId, AudioProfile> = {
  mp3: {
    id: "mp3",
    name: "MP3",
    target: "mp3",
    summary:
      "MP3 (MPEG-1 Audio Layer III) is a lossy format from the early 1990s: the encoder throws away the parts of the sound a psychoacoustic model predicts you will not hear, at a bitrate between 32 and 320 kbps. The patents have expired, so every device and program can use it without a licence. It stores up to two channels at up to 48 kHz, and title, artist and album live in ID3 tags at the start of the file.",
    playback:
      "MP3 plays on practically everything that makes sound: every browser, phone, computer, car stereo with a USB port, smart speaker and portable player made in the last twenty years. Upload forms that accept only one audio format usually accept MP3. What it cannot do is hold more than two channels or anything lossless.",
  },
  wav: {
    id: "wav",
    name: "WAV",
    target: "wav",
    summary:
      "WAV is Microsoft and IBM's RIFF container for audio, and in practice it almost always holds uncompressed PCM: every sample stored as a plain number. CD quality (16-bit, 44.1 kHz, stereo) is 1,411 kbps, about 10 MB per minute; studio recordings at 24-bit and 48 or 96 kHz are larger still. Nothing is compressed, so nothing is lost, and the classic format stops at 4 GB per file.",
    playback:
      "WAV opens in every audio editor, DAW, video editor and broadcast system, and plays in browsers and on phones. Its weak points are size and metadata: tags are stored in RIFF chunks that many players ignore, so a folder of WAV files often shows no titles or artists. Email and chat apps reject large WAVs on size alone.",
  },
  m4a: {
    id: "m4a",
    name: "M4A",
    target: "m4a",
    summary:
      "M4A is an MPEG-4 file (the same box structure as MP4) that holds only audio, nearly always AAC and occasionally Apple Lossless (ALAC). Apple made the extension common through iTunes, and the iPhone's Voice Memos app records to it. AAC is a lossy codec like MP3 but more efficient, so an M4A at 128 kbps usually sounds better than an MP3 at 128 kbps. Tags use iTunes-style atoms.",
    playback:
      "M4A plays on iPhones, iPads, Macs, Android phones, Windows 10 and 11, and in every current browser. Older MP3 players, some car stereos and a few upload forms that expect the .mp3 extension do not accept it. Files ending in .m4p are copy-protected purchases from the old iTunes Store, and no converter outside Apple's own software can read them.",
  },
  aac: {
    id: "aac",
    name: "AAC",
    summary:
      "A file ending in .aac is raw AAC audio: a stream of AAC frames, each with a small ADTS header, and no container around them. It is what some voice and call recorders, radio stream captures and tools that pull the sound out of a TV recording write. The sound is the same AAC found in M4A files; what is missing is the index a container provides.",
    playback:
      "Most players can play raw AAC, but because there is no index they often show the wrong duration, seek slowly or not at all, and ignore tags. Many car stereos and music library apps do not list .aac files, and some editors refuse them. Wrapping the same frames in M4A or converting to MP3 fixes all of that.",
  },
  flac: {
    id: "flac",
    name: "FLAC",
    target: "flac",
    summary:
      "FLAC (Free Lossless Audio Codec) compresses audio the way a zip file compresses text: decoding gives back exactly the samples that went in, bit for bit, typically at 50 to 70 percent of the WAV size. It is open and royalty-free, supports 24-bit and high sample rates, stores tags as Vorbis comments and carries an MD5 checksum of the audio so a copy can be verified.",
    playback:
      "FLAC plays on Android, Windows 10 and 11, in Chrome, Firefox, Edge and Safari, and in most hi-fi streamers and music servers. Apple's Music app does not import it, many car stereos and older portable players do not read it, and upload forms rarely accept it. That is the usual reason to convert a FLAC library.",
  },
  ogg: {
    id: "ogg",
    name: "OGG",
    target: "ogg",
    summary:
      "OGG is the Xiph.Org Foundation's open container, and a .ogg audio file usually holds Vorbis, a royalty-free lossy codec from 2000 that competes with MP3 and AAC. Games use it widely (Minecraft's sounds are Ogg Vorbis), as do many open-source programs. The same container can also hold Opus, which is what voice messages saved as .ogg or .oga usually contain.",
    playback:
      "Ogg Vorbis plays in Chrome, Firefox, Edge, on Android and in VLC, and game engines such as Godot and Unity import it. Apple's Music app, many car stereos, older portable players and a lot of upload forms do not accept .ogg files, which is why they are so often converted to MP3.",
  },
  opus: {
    id: "opus",
    name: "Opus",
    target: "opus",
    summary:
      "Opus is a lossy codec standardised by the IETF in 2012 (RFC 6716) for everything from phone calls to music. It is the most efficient codec in common use: speech is clear at 16 to 32 kbps and music is close to transparent around 128 kbps. Opus always runs at 48 kHz internally. A .opus file is Opus inside an Ogg container.",
    playback:
      "Opus is what WhatsApp voice notes and Discord calls use, and it plays in Chrome, Firefox and Edge, on Android and in VLC. Many desktop music players, car stereos, older phones and upload forms do not recognise the .opus extension at all, so voice notes saved from a chat app often need converting before they can be used anywhere else.",
  },
  wma: {
    id: "wma",
    name: "WMA",
    summary:
      "WMA (Windows Media Audio) is Microsoft's family of audio codecs from 1999, stored in the ASF container. Windows Media Player ripped CDs to WMA by default for years, so old music libraries are full of it. The family covers WMA Standard (lossy), WMA Pro, WMA Lossless and WMA Voice; files bought from old music stores may also carry DRM.",
    playback:
      "WMA plays in Windows Media Player, in VLC and on some older portable players and car stereos. It does not play on iPhones, in Apple's Music app or in browsers, and many Android phones need a separate app for it, which is why it is converted.",
  },
  aiff: {
    id: "aiff",
    name: "AIFF",
    target: "aiff",
    summary:
      "AIFF (Audio Interchange File Format) is Apple's uncompressed audio format from 1988, the Mac counterpart of WAV. It stores plain PCM samples, with the bytes in big-endian order, so an AIFF is the same size as the WAV of the same recording. Logic, GarageBand and iTunes CD imports write it, and unlike most WAV files it carries tags that Apple's apps read.",
    playback:
      "AIFF plays in Apple's Music app, QuickTime, Safari and every Mac audio editor, and professional editors on Windows open it too. Chrome, Firefox and Edge do not play AIFF, most Android phones do not list it, and it is as large as WAV, so it is rarely the right format to send to someone.",
  },
};

export const audioProfileList = Object.values(audioProfiles);

/** Paragraphs that may legitimately appear on more than one page. */
export const audioSharedParagraphs: ReadonlySet<string> = new Set(
  audioProfileList.flatMap((p) => [p.summary, p.playback]),
);
