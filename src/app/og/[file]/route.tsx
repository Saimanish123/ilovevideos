import { resolveIllustration } from "@/components/illustrations/tools";
import { home } from "@/content/site";
import { ogCard } from "@/lib/og/card";
import { getActiveCategories, getToolsByCategory, tools } from "@/tools/registry";

/**
 * Social preview images as plain static files: /og/<slug>.png per tool, /og/hub-<id>.png per hub and
 * /og/home.png for home and the legal pages. The file convention (`opengraph-image.tsx`) put the image
 * under the locale path with a query string, which redirected and matched robots' `/*?*`, so X and
 * LinkedIn could not fetch it (SEO audit 2026-09-30). A dotted path also skips the locale proxy.
 */
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return [
    { file: "home.png" },
    ...getActiveCategories().map((c) => ({ file: `hub-${c.id}.png` })),
    ...tools.map((t) => ({ file: `${t.slug}.png` })),
  ];
}

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const name = file.replace(/\.png$/, "");
  if (name.startsWith("hub-")) {
    const cat = getActiveCategories().find((c) => `hub-${c.id}` === name);
    const first = cat ? getToolsByCategory(cat.id)[0] : undefined;
    if (cat)
      return ogCard({
        title: cat.hubTitle ?? `${cat.title} video tools`,
        subtitle: cat.description,
        illustration: first ? resolveIllustration(first.engine, first.illustration) : undefined,
      });
  }
  const tool = tools.find((t) => t.slug === name);
  if (tool)
    return ogCard({
      title: tool.content.en.title,
      subtitle: tool.content.en.subtitle,
      illustration: resolveIllustration(tool.engine, tool.illustration),
    });
  return ogCard({ title: home.title, subtitle: home.lead, illustration: "compress" });
}
