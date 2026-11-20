import type { z } from "zod";
import { canCopy, type FormatId, formats } from "@/content/formats";
import { containerById } from "@/content/formats/containers";
import { codecName, nativelyDecodes } from "@/tools/engines/convert-video/plan";
import { ffmpegDownloadSize } from "@/tools/engines/ffmpeg/size";
import { withArticle } from "./audio-pairs";
import type { FaqItem, ToolInput } from "./schema";

const names = (ids: string[]) => [...new Set(ids.map((c) => codecName(c) ?? c.toUpperCase()))];
const list = (xs: string[], and = "and") =>
  xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} ${and} ${xs[xs.length - 1]}`;

/** What a re-encode writes for a target: the native engine's codecs, or the ffmpeg row's encoders. */
function encodesTo(containerId: string): { video: string; audio: string; ffmpeg: boolean } {
  const c = containerById.get(containerId);
  if (!c || c.write === "native")
    return containerId === "webm"
      ? { video: "VP9", audio: "Opus", ffmpeg: false }
      : { video: "H.264", audio: "AAC", ffmpeg: false };
  return {
    video: codecName(c.ffmpeg?.video) ?? "H.264",
    audio: codecName(c.ffmpeg?.audio) ?? "AAC",
    ffmpeg: true,
  };
}

/**
 * Every string the pair generator writes (`what`, subtitle, steps, the closing link paragraph). The
 * registry validator counts only the rest (story and FAQ) toward a pair page's hand-written floor.
 */
const generated = new Set<string>();
const gen = (text: string) => {
  generated.add(text);
  return text;
};
export const pairGeneratedText: ReadonlySet<string> = generated;

/**
 * A pair page = two format profiles + a hand-written story. Ship a pair only when (a) people search
 * for it and (b) the story says something true and specific about this pair (README.md#feature-catalog
 * pruning rule). The generic converter handles every other combination without a page.
 */
export interface PairSpec {
  from: FormatId;
  to: FormatId;
  /** Extra search phrases beyond "<from> to <to>". */
  keywords?: string[];
  aliases?: string[];
  related?: string[];
  /** Pair-specific paragraphs (>= 2). This is the content that earns the page. */
  story: string[];
  /** Force H.264 on this pair (e.g. WebM → MP4, where copied VP9 would not play outside Chrome). */
  videoCodec?: "avc";
  /** Pair-specific questions (>= 4). */
  faq: z.infer<typeof FaqItem>[];
  updatedAt: string;
}

/** What a target is for, in plain words, for the subtitle of a pair that re-encodes. */
const pairPurpose: Partial<Record<FormatId, string>> = {
  mp4: "that play almost anywhere",
  webm: "for web pages",
  mov: "for Apple apps and editors",
  avi: "for older players and editors",
};

export function pairTool(spec: PairSpec): ToolInput {
  const from = formats[spec.from];
  const to = formats[spec.to];
  const copy = canCopy(from, to);
  const forced = spec.videoCodec === "avc";
  const lossless = copy.video.length > 0 && !forced;
  const slug = `${from.id}-to-${to.id}`;

  // Lossless by default only when the codec files of this format usually carry is one the target holds.
  const usual = from.videoCodecs[0] ?? "";
  const usuallyCopies = lossless && copy.video.includes(usual);
  const enc = encodesTo(to.container);
  const usualAudio = from.audioCodecs[0] ?? "";
  const audioCopies = copy.audio.includes(usualAudio);
  // The ffmpeg engine runs when either side is a container only it handles, or when a stream that has
  // to be re-encoded is one the browser cannot decode (H.263 in 3GP, AC-3 in MTS).
  const needsFfmpeg =
    enc.ffmpeg ||
    containerById.get(from.container)?.read === "ffmpeg" ||
    (!copy.video.includes(usual) && !nativelyDecodes(usual)) ||
    (!audioCopies && !nativelyDecodes(usualAudio));
  const usualSound = names([usualAudio])[0] ?? usualAudio;
  // "Lossless" wording only when both the usual picture and the usual sound are copied (an MTS's AC-3 is not).
  const fullyCopies = usuallyCopies && audioCopies;
  const ffmpegSide = needsFfmpeg
    ? ` It needs a one-time download of about ${ffmpegDownloadSize()} the first time.`
    : " It uses the browser's own video encoder, on the device's hardware where available.";
  const copyNote =
    "nothing is encoded, so it is limited by how fast your device reads and writes the file";
  const what = usuallyCopies
    ? audioCopies
      ? `${from.name} and ${to.name} can both carry ${list(names(copy.video))} video, so when your file uses one of those codecs this tool copies the streams into a new ${to.name} container without re-encoding: no quality loss, and ${copyNote}. Only when the ${from.name} holds a codec ${to.name} cannot contain does it transcode, and it tells you which case you are in before you press Convert.${needsFfmpeg ? ffmpegSide : ""}`
      : `${from.name} and ${to.name} can both carry ${list(names(copy.video), "or")} video, so this tool usually copies the picture into ${withArticle(to.name)} without re-encoding it. The ${usualSound} sound ${from.name} files usually carry does not fit ${to.name}, so the sound alone is re-encoded to ${enc.audio}. The tool says which streams it copies before you press Convert.${needsFfmpeg ? ffmpegSide : ""}`
    : lossless
      ? `Most ${from.name} files carry ${list(names(from.videoCodecs.filter((c) => !copy.video.includes(c))), "or")} video, which ${to.name} cannot hold, so this tool usually re-encodes the video to ${enc.video}${audioCopies ? ` and copies the ${usualSound} sound as it is` : ` and the sound to ${enc.audio}`}. When your ${from.name} already holds ${list(names(copy.video), "or")}, it copies that stream instead with no quality loss, and it says which case you are in before you press Convert.${ffmpegSide}`
      : forced
        ? `${from.name} usually carries ${list(names(from.videoCodecs))} video. ${to.name} can technically hold ${list(names(copy.video))}, but most players outside Chrome will not play it there, so this page re-encodes the video to H.264 and the audio to AAC by default for a file that plays everywhere. Choose Keep in the options to copy the streams unchanged instead. It uses the browser's own video encoder, on the device's hardware where available.`
        : `${from.name} and ${to.name} do not share a video codec (${from.name} carries ${list(names(from.videoCodecs))}, ${to.name} is written with ${enc.video}), so this conversion re-encodes the video to ${enc.video} and the sound to ${enc.audio}, and the tool says so before you press Convert.${ffmpegSide}`;

  return {
    slug,
    engine: "convert-video",
    category: "convert",
    phase: "p1",
    backends: ["webcodecs"],
    accepts: ["video"],
    produces: "video",
    presetOptions: {
      from: from.id,
      to: to.container,
      lockTarget: true,
      ...(forced ? { videoCodec: "avc" } : {}),
    },
    keywords: [
      `${from.id} to ${to.id}`,
      `convert ${from.id} to ${to.id}`,
      `${from.id} to ${to.id} converter`,
      ...(spec.keywords ?? []),
    ],
    aliases: spec.aliases ?? [],
    related: [...new Set([...(spec.related ?? []), "video-converter"])],
    updatedAt: spec.updatedAt,
    icon: "repeat",
    illustration: `video-pair:${from.id}:${to.id}`,
    content: {
      en: {
        title: `Convert ${from.name} to ${to.name}`,
        subtitle: gen(
          fullyCopies
            ? `Turn ${from.name} videos into ${to.name}, usually with no quality loss.`
            : usuallyCopies
              ? `Turn ${from.name} videos into ${to.name}, with the picture kept as it is.`
              : `Turn ${from.name} videos into ${to.name} ${pairPurpose[to.id] ?? "files"}.`,
        ),
        metaTitle: `${from.name} to ${to.name} converter online, free, no upload`,
        metaDescription: fullyCopies
          ? `Convert ${from.name} to ${to.name} in your browser without uploading. Most files are copied with no quality loss. Free, no account, no watermark.`
          : usuallyCopies
            ? `Convert ${from.name} to ${to.name} in your browser without uploading. The picture is copied; the ${usualSound} sound becomes ${enc.audio}. Free, no account.`
            : `Convert ${from.name} to ${to.name} in your browser without uploading. Re-encoded on your device. Free, no account, no watermark.`,
        what: gen(what),
        steps: [
          gen(`Drop your .${from.extensions[0]} file onto the page.`),
          gen(
            copy.video.length > 0
              ? `The tool reads the streams and says whether it can convert to ${to.name} losslessly.`
              : `The tool reads the streams and says what it will re-encode for ${to.name}.`,
          ),
          gen("Press Convert."),
          gen(`Download the .${to.extensions[0]} file. The original is untouched.`),
        ],
        goodToKnow: [
          ...spec.story,
          from.summary,
          to.summary,
          from.playback,
          to.playback,
          gen(
            `Once your ${from.name} is ${withArticle(to.name)}, it can go through [compress video](/compress-video) if the file needs to be smaller, and the [general video converter](/video-converter) handles every other ${from.name} target.`,
          ),
        ],
        faq: spec.faq,
      },
    },
  };
}
