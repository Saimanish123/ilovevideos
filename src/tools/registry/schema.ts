import { z } from "zod";

/**
 * The tool registry is the single source of truth that generates:
 *  - every tool page (route, metadata, JSON-LD, content slots)
 *  - the home grid, category pages, command palette entries, sitemap
 *  - internal "related tools" linking
 *
 * A Tool = an Engine + preset options + unique content + search intent.
 * Many tools share one engine. See docs/02-feature-catalog.md and docs/10-tool-page-spec.md.
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
  // D. geometry
  "crop",
  "aspect-ratio",
  "rotate",
  "flip",
  "pad",
  "stabilize",
  // E. audio
  "mute",
  "add-audio",
  "volume",
  "audio-fade",
  "audio-sync",
  "audio-tracks",
  // F. text
  "subtitles-add",
  "subtitles-generate",
  "subtitles-burn",
  "subtitles-extract",
  "subtitles-convert",
  "text-overlay",
  // G. overlays/visual
  "watermark",
  "blur-region",
  "color-adjust",
  "filter",
  "image-overlay",
  // H. frames
  "frame-extract",
  "thumbnail-grid",
  // I. metadata
  "inspect",
  "strip-metadata",
  "edit-metadata",
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

export const MediaKind = z.enum(["video", "audio", "image", "gif", "subtitle"]);

export const FaqItem = z.object({
  q: z.string().min(8),
  a: z.string().min(20),
});

export const ToolContent = z.object({
  /** H1. Pattern: "<Verb> <object>". Sentence case. */
  title: z.string().min(3).max(60),
  /** One sentence under the H1: what it does and where it runs. */
  subtitle: z.string().min(20).max(160),
  /** <title> tag, ≤ 60 chars, no site name (appended automatically). */
  metaTitle: z.string().min(10).max(60),
  /** ≤ 155 chars. */
  metaDescription: z.string().min(50).max(155),
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
  /** ISO date of the last significant content/tool change. Drives sitemap <lastmod>. Never auto-bump. */
  updatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** True if every backend keeps the file on-device. Server-capable tools must say so in UI. */
  onDeviceOnly: z.boolean().default(true),
  /** Per-locale content. "en" is required. */
  content: z.object({ en: ToolContent }).catchall(ToolContent),
});
export type ToolDefinition = z.infer<typeof ToolDefinition>;
export type ToolInput = z.input<typeof ToolDefinition>;

export const CategoryDefinition = z.object({
  id: CategoryId,
  title: z.string(),
  description: z.string(),
  order: z.number().int(),
});
export type CategoryDefinition = z.infer<typeof CategoryDefinition>;
