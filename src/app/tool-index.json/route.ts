import { buildToolIndex } from "@/lib/tool-search";
import { categories, tools } from "@/tools/registry";

/**
 * The command palette's search index (feature catalog L4): every registry tool reduced to title,
 * aliases, keywords and category, about 4 kB gzipped. Built once at build time and served as a
 * static file from this origin, so the palette's chunk never carries the registry's page content
 * and nothing loads before the palette is opened. The query itself never leaves the page.
 */
export const dynamic = "force-static";

export function GET() {
  return Response.json(buildToolIndex(tools, categories), {
    headers: { "X-Robots-Tag": "noindex" },
  });
}
