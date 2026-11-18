import { ToolCard } from "@/components/tool/tool-card";
import { Link } from "@/lib/i18n/navigation";
import type { ToolDefinition } from "@/tools/registry/schema";
import type { ToolGroup } from "./tool-groups";

export { groupTools, type ToolGroup } from "./tool-groups";

const chip =
  "tabular inline-flex min-h-11 items-center rounded-md border border-border bg-bg-raised px-3 text-sm transition-colors duration-(--duration-instant) hover:border-border-strong focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2";

/**
 * Card grid (design system §8.7): 1 column at 375, 2 at 768, 3 from 1024. The content column stops at
 * 1200px, where four cards would leave each caption about 240px wide and force clamping.
 */
export function ToolCardGrid({ tools, locale }: { tools: ToolDefinition[]; locale: string }) {
  if (tools.length === 0) return null;
  return (
    <ul className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {tools.map((t) => (
        <li key={t.slug}>
          <ToolCard tool={t} locale={locale} />
        </li>
      ))}
    </ul>
  );
}

/** One compact row: the group's label, then one chip per page. The chip's name is the full title. */
export function ToolGroupRow({ group, locale }: { group: ToolGroup; locale: string }) {
  const id = `group-${group.key.replace(/[^a-z0-9-]/g, "-")}`;
  return (
    <div className="grid gap-3 md:grid-cols-[var(--container-label)_1fr] md:gap-6">
      <p id={id} className="font-medium text-sm md:pt-3">
        {group.label}
      </p>
      <ul aria-labelledby={id} className="flex flex-wrap gap-2">
        {group.members.map(({ tool, short }) => (
          <li key={tool.slug}>
            <Link
              prefetch={false}
              href={`/${tool.slug}`}
              aria-label={(tool.content[locale] ?? tool.content.en).title}
              className={chip}
            >
              {short}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Hub version of a group: a heading and a link list that carries each page's subtitle. */
export function ToolGroupList({ group, locale }: { group: ToolGroup; locale: string }) {
  const id = `list-${group.key.replace(/[^a-z0-9-]/g, "-")}`;
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="text-h2">
        {group.label}
      </h2>
      <ul className="mt-6 grid grid-cols-1 gap-x-8 md:grid-cols-2 lg:grid-cols-3">
        {group.members.map(({ tool }) => {
          const c = tool.content[locale] ?? tool.content.en;
          return (
            <li key={tool.slug} className="border-border border-t">
              <Link
                prefetch={false}
                href={`/${tool.slug}`}
                className="group block rounded-sm py-4 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
              >
                <span className="block font-medium text-body underline decoration-transparent decoration-1 underline-offset-3 transition-colors duration-(--duration-instant) group-hover:decoration-fg-muted">
                  {c.title}
                </span>
                <span className="mt-1 block text-fg-muted text-sm">{c.subtitle}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
