import { taskLabels } from "@/content/site/discovery";
import { searchIntents } from "@/content/site/search-intents";
import { buildToolIndex, type SearchPayload } from "@/lib/tool-search";
import { categories, getActiveCategories, tools } from "@/tools/registry";

/**
 * The search index (feature catalog L4, ADR-0123): every registry tool reduced to title, aliases,
 * keywords and category, the intent table folded into the tools it points to, and the task groups
 * the empty search shows. Built once at build time and served as a static file from this origin, so
 * no page's chunk carries the registry's content or the intent table, and nothing loads before
 * search is opened. The query is not part of this request (failed searches: ADR-0150).
 */
export const dynamic = "force-static";

export function GET() {
  const payload: SearchPayload = {
    tools: buildToolIndex(tools, categories, searchIntents),
    groups: getActiveCategories().map((c) => ({
      id: c.id,
      label: taskLabels[c.id],
      href: `/tools/${c.id}`,
    })),
  };
  return Response.json(payload, { headers: { "X-Robots-Tag": "noindex" } });
}
