import type { z } from "zod";
import { subtitleProfiles } from "@/content/subtitles";
import type { SubtitleFormat } from "@/tools/engines/subtitles/model";
import type { FaqItem, ToolInput } from "./schema";

/**
 * A subtitle pair page = two subtitle profiles + a hand-written story (ADR-0011, like `pairs.ts` for
 * video). Ship a pair only when people search for it and the story says something true about this
 * direction; every other combination is served by /subtitle-converter.
 */
export interface SubtitlePairSpec {
  from: Exclude<SubtitleFormat, "txt">;
  to: SubtitleFormat;
  /** 2–3 plain sentences on what this conversion does, specific to the pair. */
  what: string;
  /** Pair-specific paragraphs (>= 2): why people convert this way, what survives, what is dropped. */
  story: string[];
  faq: z.infer<typeof FaqItem>[];
  keywords?: string[];
  aliases?: string[];
  related?: string[];
  updatedAt: string;
}

export function subtitlePairTool(spec: SubtitlePairSpec): ToolInput {
  const from = subtitleProfiles[spec.from];
  const to = subtitleProfiles[spec.to];
  const slug = `${spec.from}-to-${spec.to}`;
  const transcript = spec.to === "txt";
  return {
    slug,
    engine: "subtitles-convert",
    category: "captions",
    phase: "p1",
    backends: ["canvas"],
    accepts: ["subtitle"],
    produces: transcript ? "text" : "subtitle",
    presetOptions: { job: "convert", from: spec.from, to: spec.to, lockTarget: true },
    keywords: [
      `${spec.from} to ${spec.to}`,
      `convert ${spec.from} to ${spec.to}`,
      `${spec.from} to ${spec.to} converter`,
      ...(spec.keywords ?? []),
    ],
    aliases: spec.aliases ?? [],
    related: [
      ...new Set([
        ...(spec.related ?? []),
        "subtitle-converter",
        "shift-subtitle-timing",
        "add-subtitles-to-video",
      ]),
    ],
    updatedAt: spec.updatedAt,
    icon: transcript ? "file-text" : "captions",
    content: {
      en: {
        title: `Convert ${from.name} to ${to.name}`,
        subtitle: transcript
          ? `Turn ${from.name} subtitles into a plain text transcript in your browser. Nothing is uploaded.`
          : `Turn ${from.name} subtitles into ${to.name} in your browser. Nothing is uploaded.`,
        metaTitle: `${from.metaName ?? from.name} to ${to.metaName ?? to.name} converter online, free, no upload`,
        metaDescription: `Convert ${from.name} subtitles to ${to.name} in your browser. See every cue and what ${to.name} cannot keep before you convert. Free, no account, no upload.`,
        action: "Convert",
        what: spec.what,
        steps: transcript
          ? [
              `Drop your .${from.extension} file onto the page, or choose it from your device.`,
              "Check the cue list: each cue becomes one line of the transcript.",
              "Tick Start time before each line if you want to find quotes in the video later.",
              "Press Convert and download the .txt file. The original is untouched.",
            ]
          : [
              `Drop your .${from.extension} file onto the page, or choose it from your device.`,
              `Check the cue list and the note on what ${to.name} keeps and drops.`,
              "Tick the timing fix if the page found overlaps or cues out of order.",
              `Press Convert and download the .${to.extension} file. The original is untouched.`,
            ],
        goodToKnow: [
          ...spec.story,
          from.summary,
          to.summary,
          to.support,
          transcript
            ? `To put the words on the video instead, [add the ${from.name} file to the video](/add-subtitles-to-video) as a track or burn it in, and [shift its timing](/shift-subtitle-timing) first if it runs early or late. Other targets are in the [subtitle converter](/subtitle-converter).`
            : `If the ${to.name} file then runs early or late against the video, [shift its timing](/shift-subtitle-timing); to put it inside the video as a track players can switch on, [add it to the video](/add-subtitles-to-video). Other ${from.name} targets are in the [subtitle converter](/subtitle-converter).`,
        ],
        faq: spec.faq,
      },
    },
  };
}
