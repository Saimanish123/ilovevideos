import { groupLabels } from "@/content/site";
import { hubGroups, hubMore } from "@/content/site/discovery";
import type { CategoryId, ToolDefinition } from "@/tools/registry/schema";

/**
 * How a category's pages are listed on the home page and the hubs. Standalone tools get an
 * illustrated card. Generated pages (a registry `family`, or locked-target format pairs) collapse into
 * one group per family, because thirty cards with the same picture read as a directory, not a product.
 */
export interface ToolGroup {
  key: string;
  label: string;
  members: { tool: ToolDefinition; short: string }[];
}

const groupKey = (t: ToolDefinition): string | undefined =>
  t.family ?? (t.presetOptions.lockTarget === true ? `pairs:${t.engine}` : undefined);

/** "Compress video to under 8 MB" among its siblings → "8 MB"; "Convert MOV to MP4" → "MOV to MP4". */
function shortLabels(titles: string[]): string[] {
  const words = titles.map((t) => t.split(" "));
  let common = 0;
  const first = words[0] ?? [];
  while (
    common < first.length - 1 &&
    words.every((w) => w.length > common + 1 && w[common] === first[common])
  )
    common++;
  return words.map((w) => {
    const rest = w.slice(common).join(" ");
    return rest.charAt(0).toUpperCase() + rest.slice(1);
  });
}

export function groupTools(
  list: readonly ToolDefinition[],
  locale: string,
): { cards: ToolDefinition[]; groups: ToolGroup[] } {
  const cards: ToolDefinition[] = [];
  const byKey = new Map<string, ToolDefinition[]>();
  for (const t of list) {
    const key = groupKey(t);
    if (key) byKey.set(key, [...(byKey.get(key) ?? []), t]);
    else cards.push(t);
  }
  const groups = [...byKey].map(([key, members]) => {
    const titles = members.map((t) => (t.content[locale] ?? t.content.en).title);
    const shorts = shortLabels(titles);
    return {
      key,
      label: groupLabels[key] ?? titles[0] ?? key,
      members: members.map((tool, i) => ({ tool, short: shorts[i] ?? tool.slug })),
    };
  });
  return { cards, groups };
}

/**
 * A hub's standalone pages under task headings (ADR-0127), from `hubGroups` in content, in the order
 * written there. A page no heading lists (a new one) goes under "More", so nothing is dropped. Hubs
 * without groups, or with a handful of pages, get one list.
 */
export function taskGroups(
  category: CategoryId,
  cards: readonly ToolDefinition[],
): { label: string; tools: ToolDefinition[] }[] | undefined {
  const groups = hubGroups[category];
  if (!groups || cards.length <= TASK_GROUPS_FROM) return undefined;
  const bySlug = new Map(cards.map((t) => [t.slug, t]));
  const placed = new Set<string>();
  const out = groups
    .map((g) => ({
      label: g.label,
      tools: g.slugs.flatMap((s) => {
        const t = bySlug.get(s);
        if (!t || placed.has(s)) return [];
        placed.add(s);
        return [t];
      }),
    }))
    .filter((g) => g.tools.length > 0);
  const rest = cards.filter((t) => !placed.has(t.slug));
  if (rest.length) out.push({ label: hubMore, tools: rest });
  return out;
}

/** Up to this many standalone pages, a hub is one list; above it, task headings. */
export const TASK_GROUPS_FROM = 8;
