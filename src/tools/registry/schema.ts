import { z } from "zod";

/**
 * The tool registry is the single source of truth that generates:
 *  - every tool page (route, metadata, JSON-LD, content slots)
 *  - the home grid, category pages, command palette entries, sitemap
 *  - internal "related tools" linking
 *
 * A Tool = an Engine + preset options + unique content + search intent.
 * Many tools share one engine. See README.md#feature-catalog and README.md#tool-page-specification.
 */

export const categoryIds = [
  "compress",
  "convert",
  "edit",
  "audio",
  "captions",
  "gif",
  "image",
  "info",
  "record",
  "platform",
] as const;
export const CategoryId = z.enum(categoryIds);
export type CategoryId = z.infer<typeof CategoryId>;

export const engineIds = [
  // A. size & quality
  "compress",
  "resize",
  "bitrate",
  "framerate",
  "codec",
  "remux",
  "faststart",
  // B. conversion
  "convert-video",
  "video-to-audio",
  "convert-audio",
  "video-to-gif",
  // Video → animated WebP, APNG, AVIF (builder F, ADR-0093).
  "animated-image",
  "gif-to-video",
  "video-to-frames",
  "images-to-video",
  "audio-to-video",
  // C. cut/join
  "trim",
  "split",
  "merge",
  "loop",
  "reverse",
  "speed",
  "remove-silence",
  // C. time and layout (round 3, builder C): freeze frame, two-video layouts, platform clips.
  "freeze-frame",
  "layout",
  "clips",
  // D. geometry
  "crop",
  "aspect-ratio",
  "rotate",
  "flip",
  "pad",
  "stabilize",
  // Key-framed zoom and pan over time (round 3, builder C).
  "zoom-pan",
  // E. audio
  "mute",
  "add-audio",
  "volume",
  "audio-fade",
  "audio-sync",
  "audio-tracks",
  // Round 3 audio: pitch shift, key and tempo analysis, joining audio files, ringtones.
  "pitch",
  "audio-analyze",
  "join-audio",
  "ringtone",
  // F. text
  "subtitles-add",
  "subtitles-generate",
  "subtitles-burn",
  "subtitles-extract",
  "subtitles-convert",
  "text-overlay",
  // Progress bar and timer on the picture; intro and outro around a video (round 3, builder B).
  "time-overlay",
  "intro-outro",
  // G. overlays/visual
  "watermark",
  "blur-region",
  "color-adjust",
  "filter",
  // Sharpen and denoise on one WebGL renderer (round 3, builder D, ADR-0081).
  "clarity",
  "image-overlay",
  // Green screen keyer (builder A, ADR-0065).
  "chroma-key",
  // Video fade in/out (picture, optionally sound) on the per-frame filter runner.
  "video-fade",
  // H. frames
  "frame-extract",
  "thumbnail-grid",
  // Thumbnail maker and sharpest frame (builder F, ADR-0094).
  "frame-pick",
  // The thumbnail maker: the frame-pick engine under its own id, for its own panel (ADR-0098).
  "thumbnail",
  // I. metadata
  "inspect",
  "strip-metadata",
  "edit-metadata",
  // Change a video file's thumbnail: the edit-metadata engine under its own id, one file at a time (ADR-0098).
  "cover",
  // Repair a damaged MP4/MOV/MKV (builder F, ADR-0097).
  "repair",
  // J. capture
  "screen-record",
  "webcam-record",
  "audio-record",
] as const;
export const EngineId = z.enum(engineIds);
export type EngineId = z.infer<typeof EngineId>;

/** Which execution backends a tool can use, in order of preference. */
export const Backend = z.enum(["webcodecs", "ffmpeg-wasm", "canvas", "server"]);
export type Backend = z.infer<typeof Backend>;

export const Phase = z.enum(["p1", "p2", "p3"]);

// "text" is for inspectors whose result is a report, not a media file (video-info).
export const MediaKind = z.enum(["video", "audio", "image", "gif", "subtitle", "text"]);

export const FaqItem = z.object({
  q: z.string().min(8),
  a: z.string().min(20),
});

export const ToolContent = z.object({
  /** H1. Pattern: "<Verb> <object>". Sentence case. */
  title: z.string().min(3).max(60),
  /** One sentence under the H1: what it does and where it runs. ≤ 100 chars so it fits two lines on a tool card. */
  subtitle: z.string().min(20).max(100),
  /** <title> tag, ≤ 60 chars, no site name (appended automatically). */
  metaTitle: z.string().min(10).max(60),
  /** ≤ 155 chars. */
  metaDescription: z.string().min(50).max(155),
  /** Primary button label when it should differ from the engine's verb (e.g. "Resize" on a compress preset page). */
  action: z.string().min(2).max(24).optional(),
  /** 2–3 plain sentences. */
  what: z.string().min(80),
  /** 3–6 steps, one sentence each. */
  steps: z.array(z.string().min(10)).min(3).max(6),
  /** Tool-specific knowledge paragraphs (markdown allowed). Minimum 3. */
  goodToKnow: z.array(z.string().min(60)).min(3),
  faq: z.array(FaqItem).min(4).max(8),
});
export type ToolContent = z.infer<typeof ToolContent>;

export const ToolDefinition = z.object({
  /** URL slug, e.g. "compress-video", "mov-to-mp4". Unique. Lowercase, hyphenated. */
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be lowercase-hyphenated"),
  engine: EngineId,
  category: CategoryId,
  phase: Phase,
  /** Preferred backends, first wins if the browser supports it. */
  backends: z.array(Backend).min(1),
  accepts: z.array(MediaKind).min(1),
  produces: MediaKind,
  /** Engine options locked or preselected for this page (validated by the engine's own schema at runtime). */
  presetOptions: z.record(z.string(), z.unknown()).default({}),
  /** Search intents this page targets; drives the command palette aliases and internal anchors. */
  keywords: z.array(z.string()).min(1),
  /** Command-palette aliases ("shrink", "reduce size"). */
  aliases: z.array(z.string()).default([]),
  /** Slugs of related tools; complemented automatically by same-engine/same-category tools. */
  related: z.array(z.string()).default([]),
  /** Lucide icon name or custom glyph id in src/components/icons/tools. */
  icon: z.string(),
  /** Illustration id in src/components/illustrations/tools (ADR-0008). Defaults per engine. */
  illustration: z.string().optional(),
  /**
   * Generated family this page belongs to (e.g. "compress-size"). Listings such as the home grid
   * collapse a family into one compact row instead of one card per page.
   */
  family: z.string().optional(),
  /** Primary sources for the page's facts (platform limits), shown as outbound links under Good to know. */
  sources: z
    .array(
      z.object({
        title: z.string(),
        url: z.string().url(),
        /** ISO date the source was read. */
        checked: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }),
    )
    .default([]),
  /** ISO date of the last significant content/tool change. Drives sitemap <lastmod>. Never auto-bump. */
  updatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Per-locale content. "en" is required. */
  content: z.object({ en: ToolContent }).catchall(ToolContent),
});
export type ToolDefinition = z.infer<typeof ToolDefinition>;
export type ToolInput = z.input<typeof ToolDefinition>;

export const CategoryDefinition = z.object({
  id: CategoryId,
  title: z.string(),
  /** H1 and <title> of the category hub, when "<title> video tools" would read badly. */
  hubTitle: z.string().optional(),
  description: z.string(),
  /** The hub's meta description (about 120 to 155 characters); `description` stays the on-page lead. */
  metaDescription: z.string().max(155).optional(),
  order: z.number().int(),
  /**
   * When the hub's own copy last changed in substance (ISO date). The sitemap's lastmod for the hub is
   * the later of this and its tools' `updatedAt`.
   */
  updatedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export type CategoryDefinition = z.infer<typeof CategoryDefinition>;
