import { ToolIcon } from "@/components/icons/tools/tool-icon";
import { resolveIllustration, ToolIllustration } from "@/components/illustrations/tools";
import { Link } from "@/lib/i18n/navigation";
import type { ToolDefinition } from "@/tools/registry/schema";

/**
 * Tool card (design system §8.7, ADR-0008): a 3:2 illustration well with a caption. Used on the
 * home grid, category hubs and the related-tools block. Falls back to the tool glyph until an
 * engine has its illustration drawn.
 */
export function ToolCard({ tool, locale }: { tool: ToolDefinition; locale: string }) {
  const c = tool.content[locale] ?? tool.content.en;
  const illustration = resolveIllustration(tool.engine, tool.illustration);
  return (
    <Link
      prefetch={false}
      href={`/${tool.slug}`}
      className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-bg-raised transition-colors duration-(--duration-instant) hover:border-border-strong focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
    >
      <div className="flex aspect-3/2 items-center justify-center bg-bg-subtle text-fg">
        {illustration ? (
          <ToolIllustration id={illustration} className="h-3/4 w-3/4" />
        ) : (
          <ToolIcon name={tool.icon} className="text-fg-muted" />
        )}
      </div>
      {/*
        Caption shown in full, never clamped: the title may wrap to two lines and the subtitle (≤ 100
        characters) to three. The card stretches to its grid row, so every card in a row is the same
        height (design system §8.7).
      */}
      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-balance text-h3">{c.title}</h3>
        <p className="mt-1 text-fg-muted text-sm">{c.subtitle}</p>
      </div>
    </Link>
  );
}
