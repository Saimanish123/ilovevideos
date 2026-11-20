import { MoreOptions } from "@/components/tool/regions/more-options";
import { ToolCard } from "@/components/tool/tool-card";
import { Link } from "@/lib/i18n/navigation";
import type { ToolDefinition } from "@/tools/registry/schema";
import type { ToolGroup } from "./tool-groups";

export { groupTools, type ToolGroup } from "./tool-groups";

/**
 * Card grid (design system §8.7): 1 column at 375, 2 at 768, 3 from 1024. The content column stops at
 * 1200px, where four cards would leave each caption about 240px wide and force clamping.
 */
export function ToolCardGrid({ tools, locale }: { tools: ToolDefinition[]; locale: string }) {
  if (tools.length === 0) return null;
  return (
    <ul className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {tools.map((t) => (
        // The same lift as a home card under a resting pointer (ADR-0157).
        <li key={t.slug} className="card-lift">
          <ToolCard tool={t} locale={locale} />
        </li>
      ))}
    </ul>
  );
}

/**
 * Hub version of a group, in the open: a heading and a link list that carries each page's subtitle.
 * Used where the generated pages are the hub's own content (the platform hub, ADR-0154).
 */
export function ToolGroupList({ group, locale }: { group: ToolGroup; locale: string }) {
  const id = `list-${group.key.replace(/[^a-z0-9-]/g, "-")}`;
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="text-h2">
        {group.label}
      </h2>
      <div className="mt-6">
        <GroupLinks members={group.members} locale={locale} />
      </div>
    </section>
  );
}

/** "All 36 format pages": what the bottom disclosure holds, by kind (pairs, presets or both). */
export function generatedLabel(groups: readonly ToolGroup[]): string {
  const n = groups.reduce((sum, g) => sum + g.members.length, 0);
  const pairs = groups.filter((g) => g.key.startsWith("pairs:")).length;
  const kind = pairs === groups.length ? "format" : pairs === 0 ? "preset" : "format and preset";
  return `All ${n} ${kind} ${n === 1 ? "page" : "pages"}`;
}

/**
 * The hub's generated pages (ADR-0154), at the very bottom, closed: format pairs and presets exist for
 * search engines, so browsing never lists them, but this one crawlable path keeps each one a click
 * below its hub. Native <details> (the shared disclosure), server-rendered: the links are in the HTML.
 */
export function GeneratedPages({ groups, locale }: { groups: ToolGroup[]; locale: string }) {
  if (groups.length === 0) return null;
  return (
    <MoreOptions label={generatedLabel(groups)}>
      {groups.map((g) => {
        const id = `pages-${g.key.replace(/[^a-z0-9-]/g, "-")}`;
        return (
          <div key={g.key}>
            <h2 id={id} className="font-medium text-fg text-sm">
              {g.label}
            </h2>
            <ul
              aria-labelledby={id}
              className="mt-1 grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-4"
            >
              {g.members.map(({ tool }) => (
                <li key={tool.slug}>
                  <Link
                    prefetch={false}
                    href={`/${tool.slug}`}
                    className="inline-flex min-h-11 items-center rounded-sm text-fg underline decoration-border-strong decoration-1 underline-offset-3 transition-colors duration-(--duration-instant) hover:decoration-fg focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
                  >
                    {(tool.content[locale] ?? tool.content.en).title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </MoreOptions>
  );
}

function GroupLinks({ members, locale }: { members: ToolGroup["members"]; locale: string }) {
  return (
    <ul className="grid grid-cols-1 gap-x-8 md:grid-cols-2 lg:grid-cols-3">
      {members.map(({ tool }) => {
        const c = tool.content[locale] ?? tool.content.en;
        return (
          <li key={tool.slug} className="border-border border-t">
            <Link
              prefetch={false}
              href={`/${tool.slug}`}
              className="group/link block rounded-sm py-4 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
            >
              <span className="block font-medium text-body underline decoration-transparent decoration-1 underline-offset-3 transition-colors duration-(--duration-instant) group-hover/link:decoration-fg-muted">
                {c.title}
              </span>
              <span className="mt-1 block text-fg-muted text-sm">{c.subtitle}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
