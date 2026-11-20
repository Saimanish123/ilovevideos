import type { z } from "zod";
import { type FormatId, formats } from "@/content/formats";
import {
  type AudioFormatId,
  type AudioFormatSpec,
  audioFormatById,
  audioSources,
} from "@/content/formats/audio";
import { type AudioProfileId, audioProfiles } from "@/content/formats/audio-profiles";
import { ffmpegDownloadSize } from "@/tools/engines/ffmpeg/size";
import type { FaqItem, ToolInput } from "./schema";

/**
 * Audio pair pages (ADR-0011, same model as ./pairs.ts): two profiles from
 * `content/formats/audio-profiles.ts` plus a hand-written story and questions. Ship a pair only when
 * people search for it and the story says something true and specific about it; the generic
 * `/audio-converter` handles every other combination without a page. `what` is derived from the
 * capability table so it says truthfully what runs where: copy or re-encode, native or ffmpeg.
 */
export interface AudioPairSpec {
  from: AudioProfileId;
  to: AudioFormatId;
  keywords?: string[];
  aliases?: string[];
  related?: string[];
  /** Pair-specific paragraphs (>= 2). This is the content that earns the page. */
  story: string[];
  /** Pair-specific questions (>= 4); answers must not repeat another page's. */
  faq: z.infer<typeof FaqItem>[];
  updatedAt: string;
}

/** Codec a source format holds in practice, for the derived sentences. */
const sourceCodec: Record<AudioProfileId, { codec: string; lossless: boolean }> = {
  mp3: { codec: "MP3", lossless: false },
  wav: { codec: "PCM", lossless: true },
  m4a: { codec: "AAC", lossless: false },
  aac: { codec: "AAC", lossless: false },
  flac: { codec: "FLAC", lossless: true },
  ogg: { codec: "Vorbis", lossless: false },
  opus: { codec: "Opus", lossless: false },
  wma: { codec: "WMA", lossless: false },
  aiff: { codec: "PCM", lossless: true },
};

const encoderName: Record<AudioFormatId, string> = {
  mp3: "a standard MP3 encoder",
  m4a: "an AAC encoder",
  wav: "16-bit PCM (24-bit when the source has it)",
  flac: "the FLAC encoder",
  ogg: "the Vorbis encoder",
  opus: "the browser's own Opus encoder",
  aiff: "big-endian PCM",
};

const bitrateHint = (to: AudioFormatSpec) =>
  to.id === "mp3"
    ? "128 kbps for speech, 192 kbps for music, 320 kbps for the most MP3 allows"
    : "128 kbps for speech, 192 kbps for music, 320 kbps for the most detail";

/** "an MP3", "a WAV", "a FLAC", as the names are said. */
export const withArticle = (name: string) =>
  `${/^(MP3|M4A|AAC|OGG|Opus|AIFF|MP4|MKV|AVI|FLV|MXF|MTS|MPEG|MPEG-TS|M4V|OGV)$/.test(name) ? "an" : "a"} ${name}`;

const codecLabel: Record<string, string> = {
  aac: "AAC",
  mp3: "MP3",
  opus: "Opus",
  vorbis: "Vorbis",
  flac: "FLAC",
};

export function audioPairTool(spec: AudioPairSpec): ToolInput {
  const from = audioProfiles[spec.from];
  const toProfile = audioProfiles[spec.to];
  const to = audioFormatById.get(spec.to);
  if (!to || !toProfile) throw new Error(`No audio target ${spec.to}`);
  const src = sourceCodec[spec.from];
  const read = audioSources.find((s) => s.id === spec.from)?.read ?? "native";
  const ext = audioSources.find((s) => s.id === spec.from)?.extensions[0] ?? spec.from;
  // Lossless sources to WAV go through ffmpeg for bit-exact samples (see video-to-audio/plan.ts).
  const native = read === "native" && !!to.encode.native && !(to.id === "wav" && src.lossless);
  const slug = `${spec.from}-to-${spec.to}`;

  const engine = native
    ? "It runs on the browser's own media engine, streaming through the file, so nothing extra is downloaded."
    : read === "ffmpeg"
      ? `Browsers cannot read ${from.name} themselves, so the conversion needs a one-time download of about ${ffmpegDownloadSize()}, which your browser keeps.`
      : `The encode needs a one-time download of about ${ffmpegDownloadSize()}, which your browser keeps.`;
  const what = to.lossless
    ? src.lossless
      ? `This page converts ${from.name} to ${to.name} without losing anything: the ${src.codec} audio is decoded to its exact samples and written as ${encoderName[spec.to]}, keeping the sample rate and channels. ${engine}`
      : `This page decodes the ${src.codec} audio in your ${from.name} file once and writes it as ${to.name} (${encoderName[spec.to]}) at the same sample rate. From here on nothing more is lost, though nothing ${src.codec} removed comes back. ${engine}`
    : `This page decodes the ${src.codec} audio in your ${from.name} file and encodes it as ${to.name} with ${encoderName[spec.to]}, at the bitrate you choose. ${src.lossless ? `Because ${from.name} is lossless, this is a first-generation encode: the only loss is the one the bitrate sets.` : `${src.codec} is already lossy, so this is a second lossy step; the panel shows the source bitrate so you can match it.`} ${engine}`;

  return {
    slug,
    engine: "convert-audio",
    category: "convert",
    phase: "p1",
    backends: native ? ["webcodecs", "ffmpeg-wasm"] : ["ffmpeg-wasm", "webcodecs"],
    accepts: ["audio"],
    produces: "audio",
    presetOptions: { from: spec.from, to: spec.to, lockTarget: true },
    keywords: [
      `${spec.from} to ${spec.to}`,
      `convert ${spec.from} to ${spec.to}`,
      `${spec.from} to ${spec.to} converter`,
      ...(spec.keywords ?? []),
    ],
    aliases: spec.aliases ?? [],
    related: [...new Set([...(spec.related ?? []), "audio-converter", "extract-audio-from-video"])],
    updatedAt: spec.updatedAt,
    icon: "audio-lines",
    illustration: `audio-pair:${spec.from}:${spec.to}`,
    content: {
      en: {
        title: `Convert ${from.name} to ${to.name}`,
        subtitle: to.lossless
          ? `Your ${from.name} kept sample for sample, with nothing more lost.`
          : `Your ${from.name} at the quality you choose, with its tags kept.`,
        metaTitle: `${from.name} to ${to.name} converter online, free, no upload`,
        metaDescription: to.lossless
          ? `Convert ${from.name} to ${to.name} in your browser without uploading. Sample rate and bit depth are kept. Free, no account, no watermark.`
          : `Convert ${from.name} to ${to.name} in your browser without uploading. Choose 128, 192 or 320 kbps; tags are kept. Free, no account.`,
        action: "Convert",
        what,
        steps: [
          `Drop your .${ext} file onto the page; its waveform and codec appear.`,
          to.lossless
            ? `Check the line under the options: it says what the ${to.name} will contain and how large it will be.`
            : `Choose a bitrate: ${bitrateHint(to)}.`,
          "Press Convert.",
          `Play the ${to.name} on the page, then download it. The ${from.name} is left as it was.`,
        ],
        goodToKnow: [
          ...spec.story,
          from.summary,
          toProfile.summary,
          from.playback,
          toProfile.playback,
          `Once the ${from.name} is ${withArticle(to.name)}, it can go onto a video with [add audio to video](/add-audio-to-video). For any other target, the [audio converter](/audio-converter) takes the same ${from.name} and offers every format we write.`,
        ],
        faq: spec.faq,
      },
    },
  };
}

/** Video → audio pair pages on the video-to-audio engine (mov-to-mp3, mp4-to-m4a, ...). */
export interface VideoAudioPairSpec {
  from: FormatId;
  to: AudioFormatId;
  keywords?: string[];
  aliases?: string[];
  related?: string[];
  story: string[];
  faq: z.infer<typeof FaqItem>[];
  updatedAt: string;
}

export function videoAudioPairTool(spec: VideoAudioPairSpec): ToolInput {
  const from = formats[spec.from];
  const to = audioFormatById.get(spec.to);
  const toProfile = audioProfiles[spec.to];
  if (!to || !toProfile) throw new Error(`No audio target ${spec.to}`);
  const copyable = from.audioCodecs.filter((c) => to.codecs.includes(c));
  // Wording follows the container's usual sound (its first listed codec), as `usualAudio` in
  // ./pairs.ts: an MKV usually holds AAC, AC-3, DTS or FLAC, so mkv-to-mp3 is an encode even though
  // the rare MP3 track copies.
  const usualCopies = to.codecs.includes(from.audioCodecs[0] ?? "");
  const slug = `${from.id}-to-${spec.to}`;
  const native = usualCopies || !!to.encode.native;
  const rareCopy =
    !usualCopies && copyable.length > 0
      ? ` A track that is already ${copyable.map((c) => codecLabel[c] ?? c).join(" or ")} is copied as it is instead, and the line under the options says so.`
      : "";
  const what = usualCopies
    ? `This page takes the sound out of ${withArticle(from.name)} video and saves it as ${to.name}. When the track is ${copyable.map((c) => codecLabel[c] ?? c).join(" or ")}, which ${to.name} holds as it is, it is copied without re-encoding: no quality loss, and because nothing is encoded it is limited only by how fast your device reads and writes the file. Any other sound is re-encoded, and the line under the options says which case your file is before you start.`
    : to.lossless
      ? `This page takes the sound out of ${withArticle(from.name)} video and writes it as ${to.name}: the audio is decoded once to ${encoderName[spec.to]} at the video's own sample rate, and the picture is discarded without being decoded. Nothing more is lost from here on.`
      : `This page takes the sound out of ${withArticle(from.name)} video and encodes it as ${to.name} with ${encoderName[spec.to]} at the bitrate you choose. The picture is discarded without being decoded, so only the length of the video and the bitrate decide how big the ${to.name} is.${rareCopy}`;
  return {
    slug,
    engine: "video-to-audio",
    category: "audio",
    phase: "p1",
    backends: native ? ["webcodecs", "ffmpeg-wasm"] : ["ffmpeg-wasm", "webcodecs"],
    accepts: ["video"],
    produces: "audio",
    presetOptions: { from: from.id, to: spec.to, lockTarget: true },
    keywords: [
      `${from.id} to ${spec.to}`,
      `convert ${from.id} to ${spec.to}`,
      `${from.id} to ${spec.to} converter`,
      ...(spec.keywords ?? []),
    ],
    aliases: spec.aliases ?? [],
    related: [...new Set([...(spec.related ?? []), "extract-audio-from-video", "audio-converter"])],
    updatedAt: spec.updatedAt,
    icon: "music",
    illustration: `video-audio-pair:${from.id}:${spec.to}`,
    content: {
      en: {
        title: `Convert ${from.name} to ${to.name}`,
        subtitle: `Save the sound of ${withArticle(from.name)} video as ${to.name}.`,
        metaTitle: `${from.name} to ${to.name} converter online, free, no upload`,
        metaDescription: usualCopies
          ? `Convert ${from.name} video to ${to.name} audio in your browser. The sound is usually copied with no quality loss. Free, no account, no upload.`
          : `Convert ${from.name} video to ${to.name} audio in your browser, on your device. Trim to a range, keep the tags. Free, no account, no upload.`,
        action: "Convert",
        what,
        steps: [
          `Drop your .${from.extensions[0]} file onto the page. The card names the sound codec inside it.`,
          usualCopies || to.lossless
            ? "Read the line under the options: it says whether the sound is copied or re-encoded, and the size to expect."
            : `Choose a bitrate: ${bitrateHint(to)}.`,
          "To keep only part of the sound, tick the range box and drag the handles on the timeline.",
          `Press Convert, listen to the ${to.name} on the page, then download it.`,
        ],
        goodToKnow: [
          ...spec.story,
          from.summary,
          toProfile.summary,
          toProfile.playback,
          `Making the ${to.name} leaves the ${from.name} untouched. To keep the picture and drop the sound instead, use [remove audio from video](/remove-audio-from-video); to save the same ${from.name}'s sound in a format other than ${to.name}, use [extract audio from video](/extract-audio-from-video).`,
        ],
        faq: spec.faq,
      },
    },
  };
}
