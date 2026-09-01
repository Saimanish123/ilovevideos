import { categories } from "./categories";
import {
  type CategoryDefinition,
  type CategoryId,
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

/** Related tools: explicit list first, then same category, deduplicated, excluding self. */
export function getRelatedTools(tool: Tool, limit = 6): Tool[] {
  const out: Tool[] = [];
  const seen = new Set<string>([tool.slug]);
  for (const slug of tool.related) {
    const t = bySlug.get(slug);
    if (t && !seen.has(t.slug)) {
      out.push(t);
      seen.add(t.slug);
    }
  }
  for (const t of parsed) {
    if (out.length >= limit) break;
    if (t.category === tool.category && !seen.has(t.slug)) {
      out.push(t);
      seen.add(t.slug);
    }
  }
  return out.slice(0, limit);
}
