import { categories } from "./categories";
import {
  type CategoryDefinition,
  type CategoryId,
  type EngineId,
  type ToolDefinition as Tool,
  ToolDefinition,
} from "./schema";
import { toolInputs } from "./tools";

const parsed: Tool[] = toolInputs.map((t) => ToolDefinition.parse(t));

const bySlug = new Map(parsed.map((t) => [t.slug, t]));
if (bySlug.size !== parsed.length) {
  throw new Error("Duplicate tool slug in registry");
}

export const tools: readonly Tool[] = parsed;
export { categories };

export function getCategory(id: CategoryId): CategoryDefinition {
  const c = categories.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown category ${id}`);
  return c;
}

export function getTool(slug: string): Tool | undefined {
  return bySlug.get(slug);
}

export function getToolsByCategory(category: CategoryId): Tool[] {
  return parsed.filter((t) => t.category === category);
}

/**
 * Categories with at least two tools. Hubs, the sitemap and listings use this, so an empty or
 * single-tool hub (a thin page that only repeats its one tool, SEO audit 2026-09-30) never ships.
 */
export const MIN_HUB_TOOLS = 2;
export function getActiveCategories(): CategoryDefinition[] {
  return categories.filter(
    (c) => parsed.filter((t) => t.category === c.id).length >= MIN_HUB_TOOLS,
  );
}

/** "mov-to-mp4" → ["mov", "mp4"]; undefined for pages that are not a pair. */
const pairParts = (slug: string): [string, string] | undefined => {
  const m = /^([a-z0-9]+)-to-([a-z0-9]+)$/.exec(slug);
  return m?.[1] && m[2] ? [m[1], m[2]] : undefined;
};

/**
 * Related tools: the explicit list, then the reverse pair (mp4-to-mov on mov-to-mp4), then pages on the
 * same engine, then the same category, then anything, deduplicated and excluding self. Within each fill
 * step the page linked from the fewest other modules so far goes first (then pairs sharing a format, then
 * the nearest in registry order), so every page is reachable from several others and no two pages show
 * an identical set. Computed once for the whole registry, in registry order; deterministic.
 */
export function getRelatedTools(tool: Tool, limit = 6): Tool[] {
  return (relatedMap(limit).get(tool.slug) ?? []).slice(0, limit);
}

const relatedCache = new Map<number, Map<string, Tool[]>>();

function relatedMap(limit: number): Map<string, Tool[]> {
  const cached = relatedCache.get(limit);
  if (cached) return cached;
  const inbound = new Map<string, number>();
  const bump = (slug: string) => inbound.set(slug, (inbound.get(slug) ?? 0) + 1);
  const explicit = new Map<string, Tool[]>();
  for (const tool of parsed) {
    const seen = new Set<string>([tool.slug]);
    const out: Tool[] = [];
    const parts = pairParts(tool.slug);
    const reverse = parts ? [`${parts[1]}-to-${parts[0]}`] : [];
    for (const slug of [...tool.related, ...reverse]) {
      const t = bySlug.get(slug);
      if (t && out.length < limit && !seen.has(t.slug)) {
        out.push(t);
        seen.add(t.slug);
        bump(t.slug);
      }
    }
    explicit.set(tool.slug, out);
  }
  const map = new Map<string, Tool[]>();
  parsed.forEach((tool, at) => {
    const out = [...(explicit.get(tool.slug) ?? [])];
    const seen = new Set<string>([tool.slug, ...out.map((t) => t.slug)]);
    const parts = pairParts(tool.slug);
    const shares = (t: Tool) => {
      const q = pairParts(t.slug);
      return parts && q ? q.filter((x) => parts.includes(x)).length : 0;
    };
    const distance = (t: Tool) => {
      const d = Math.abs(parsed.indexOf(t) - at);
      return Math.min(d, parsed.length - d);
    };
    const fill = (pool: Tool[]) => {
      const ranked = pool
        .filter((t) => !seen.has(t.slug))
        .sort(
          (a, b) =>
            (inbound.get(a.slug) ?? 0) - (inbound.get(b.slug) ?? 0) ||
            shares(b) - shares(a) ||
            distance(a) - distance(b),
        );
      for (const t of ranked) {
        if (out.length >= limit) return;
        out.push(t);
        seen.add(t.slug);
        bump(t.slug);
      }
    };
    fill(parsed.filter((t) => t.engine === tool.engine));
    fill(parsed.filter((t) => t.category === tool.category));
    // Small catalogue: fill the module to `limit` from other categories so it never looks empty.
    fill(parsed);
    map.set(tool.slug, out);
  });
  relatedCache.set(limit, map);
  return map;
}

/**
 * Converter hubs and the engines whose locked-target pages they list ("Pages for common conversions"),
 * so every pair page is one link below its hub (README.md#seo-strategy §1). The audio converter also
 * lists the video → audio pages.
 */
const hubEngines: Record<string, EngineId[]> = {
  "video-converter": ["convert-video"],
  "audio-converter": ["convert-audio", "video-to-audio"],
  "subtitle-converter": ["subtitles-convert"],
  "change-video-codec": ["codec"],
};

/** The pair pages a converter hub links down to, in registry order; empty for every other page. */
export function getHubPages(tool: Tool): Tool[] {
  const engines = hubEngines[tool.slug];
  if (!engines) return [];
  return parsed.filter(
    (t) =>
      t.slug !== tool.slug && engines.includes(t.engine) && t.presetOptions.lockTarget === true,
  );
}
