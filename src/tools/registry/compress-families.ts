import type { z } from "zod";
import { type PlatformId, platforms } from "@/content/platforms";
import { NBSP } from "@/lib/format";
import { MB, planTarget } from "@/tools/engines/compress/math";
import type { FaqItem, ToolInput } from "./schema";

/**
 * Generated compress families (README.md#feature-catalog A8/K, ADR-0011): compress for a platform, and
 * compress to under N MB. Every page is the compress engine with the preset locked to a size target, so
 * zero interaction produces a file under the limit. A page ships only with a hand-written story; the
 * generator adds the facts (dated limits from `src/content/platforms/`, and what the size buys, computed
 * with the engine's own planner so the numbers match what the tool will do).
 */

const mb = (n: number) => `${n}${NBSP}MB`;

/**
 * Every string the generators write (steps, the dated limits paragraph, the computed "what it buys"
 * paragraph). `pnpm lint:registry` counts only hand-written words toward a family page's own-word floor.
 */
const generated = new Set<string>();
const gen = (text: string) => {
  generated.add(text);
  return text;
};
export const familyGeneratedText: ReadonlySet<string> = generated;

/**
 * How the size target is met. Shared by every page in both families by design (it describes one engine
 * behaviour), so it is exempt from the duplicate-paragraph check like the format profiles.
 */
export const targetMechanics =
  "How the size is met: the tool divides the size by the clip's length to get a bit budget, gives the sound 128 kbps (96 or 64 kbps when the budget is tight), and spends the rest on the picture, lowering the resolution only when the bitrate would be too thin for the full frame. After encoding it measures the real file, and if the encoder overshot it encodes once more at a corrected bitrate. Limits are read as decimal megabytes (1 MB = 1,000,000 bytes), the smaller reading, so the file passes however the platform counts; the result line counts the way Windows does (1,048,576 bytes), so a file made for 10 MB reads as about 9 MB there.";

export const familySharedParagraphs: ReadonlySet<string> = new Set([targetMechanics]);

const fmtDuration = (seconds: number) => {
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
};
const kbps = (bps: number) =>
  bps >= 1_000_000
    ? `${(bps / 1_000_000).toFixed(1)}${NBSP}Mbps`
    : `${Math.round(bps / 1000)}${NBSP}kbps`;

/** "At 10 MB, a 0:30 clip gets …": computed with the engine's planner for a 1080p30 phone clip with sound. */
export function whatFits(sizeMb: number, durations: number[]): string {
  const src = { width: 1920, height: 1080, fps: 30, hasAudio: true };
  const parts = durations.map((d) => {
    const p = planTarget(sizeMb * MB, { ...src, durationSec: d }, "auto");
    if (!p.ok) return `a ${fmtDuration(d)} clip does not fit`;
    const res = p.height === "original" ? "stays at 1080p" : `drops to ${p.outHeight}p`;
    return `a ${fmtDuration(d)} clip gets about ${kbps(p.videoBitrate)} of picture and ${res}`;
  });
  // Any length too long to fit returns the longest one that would.
  const tooLong = planTarget(sizeMb * MB, { ...src, durationSec: 1e9 }, "auto");
  const limit = tooLong.ok ? 0 : tooLong.maxDurationSec;
  return gen(
    `What ${mb(sizeMb)} buys for a 1080p phone clip with sound: ${parts.join("; ")}. The longest clip that fits at all is about ${fmtDuration(limit)}; past that the page says so instead of making an unwatchable file, and [trim video](/trim-video) gets it under.`,
  );
}

export interface PlatformPageSpec {
  platform: PlatformId;
  slug: string;
  keywords: string[];
  aliases?: string[];
  related: string[];
  icon: string;
  title: string;
  subtitle: string;
  metaTitle: string;
  metaDescription: string;
  what: string;
  /** Platform-specific paragraphs (>= 3). This is what earns the page. */
  story: string[];
  faq: z.infer<typeof FaqItem>[];
  updatedAt: string;
}

export function platformTool(spec: PlatformPageSpec): ToolInput {
  const p = platforms[spec.platform];
  // "Discord limits by tier. Free, 10 MB: free accounts, per …; fits every account. …" The check date
  // stays in src/content/platforms (CHECKED) and is not shown (ADR-0149).
  const limits = gen(
    `${p.name} limits by tier. ${p.tiers.map((t) => `${t.plan}, ${mb(t.mb)}: ${t.note}`).join(" ")}`,
  );
  return {
    slug: spec.slug,
    engine: "compress",
    category: "platform",
    phase: "p1",
    backends: ["webcodecs"],
    accepts: ["video"],
    produces: "video",
    presetOptions: {
      preset: "target",
      targetMb: p.defaultMb,
      maxHeight: p.maxHeight,
      platform: p.id,
    },
    keywords: spec.keywords,
    aliases: spec.aliases ?? [],
    related: [...new Set([...spec.related, "compress-video"])],
    family: "compress-platform",
    sources: p.sources.map(({ title, url, checked }) => ({
      title: title ?? new URL(url).hostname,
      url,
      checked,
    })),
    updatedAt: spec.updatedAt,
    icon: spec.icon,
    illustration: `compress-for:${p.id}`,
    content: {
      en: {
        title: spec.title,
        subtitle: spec.subtitle,
        metaTitle: spec.metaTitle,
        metaDescription: spec.metaDescription,
        what: spec.what,
        steps: [
          "Drop the video onto the page or choose it from your device.",
          `Keep the ${mb(p.defaultMb)} limit selected, or pick the one for your account.`,
          "Press Compress and watch the real progress.",
          `Download the MP4 and attach it in ${p.name}. The original is untouched.`,
        ].map(gen),
        goodToKnow: [limits, ...spec.story, targetMechanics],
        faq: spec.faq,
      },
    },
  };
}

export interface SizePageSpec {
  mb: number;
  keywords?: string[];
  aliases?: string[];
  related: string[];
  /** Size-specific paragraphs (>= 2): who asks for this number and what it means in practice. */
  story: string[];
  faq: z.infer<typeof FaqItem>[];
  /** One sentence for `what`, specific to this size. */
  lead: string;
  /** Under the H1, <= 100 characters, specific to this size. */
  subtitle: string;
  /** <= 155 characters, true for this size (long clips are refused, so never "any video"). */
  metaDescription: string;
  /** Primary sources for the story's facts, when the story cites something other than the platform library. */
  sources?: { title: string; url: string; checked: string }[];
  /** Clip lengths used in the computed "what it buys" paragraph. */
  durations: number[];
  updatedAt: string;
}

export function sizeTool(spec: SizePageSpec): ToolInput {
  const n = spec.mb;
  return {
    slug: `compress-video-under-${n}mb`,
    engine: "compress",
    category: "compress",
    phase: "p1",
    backends: ["webcodecs"],
    accepts: ["video"],
    produces: "video",
    presetOptions: { preset: "target", targetMb: n, maxHeight: "auto" },
    keywords: [
      `compress video to ${n}mb`,
      `compress video under ${n}mb`,
      `reduce video size to ${n}mb`,
      `${n}mb video compressor`,
      ...(spec.keywords ?? []),
    ],
    aliases: spec.aliases ?? [],
    related: [...new Set([...spec.related, "compress-video"])],
    family: "compress-size",
    sources: spec.sources ?? [],
    updatedAt: spec.updatedAt,
    icon: "minimize-2",
    illustration: `compress-cap:${n}`,
    content: {
      en: {
        title: `Compress video to under ${mb(n)}`,
        subtitle: spec.subtitle,
        metaTitle: `Compress video under ${n} MB, free, no upload`,
        metaDescription: spec.metaDescription,
        what: spec.lead,
        steps: [
          "Drop the video onto the page or choose it from your device.",
          `The target is already set to ${mb(n)}; the line under it shows the resolution and bitrate it will use.`,
          "Press Compress and watch the real progress.",
          `Download the MP4. It is under ${mb(n)}, or the page tells you by how much it is not.`,
        ].map(gen),
        goodToKnow: [...spec.story, whatFits(n, spec.durations), targetMechanics],
        faq: spec.faq,
      },
    },
  };
}
