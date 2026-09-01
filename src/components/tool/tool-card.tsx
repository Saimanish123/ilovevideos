import { ToolIcon } from "@/components/icons/tools/tool-icon";
import { Link } from "@/lib/i18n/navigation";
import type { ToolDefinition } from "@/tools/registry/schema";

export function ToolCard({ tool, locale }: { tool: ToolDefinition; locale: string }) {
  const c = tool.content[locale] ?? tool.content.en;
  return (
    <Link
      href={`/${tool.slug}`}
      className="block rounded-lg border border-border p-5 transition-colors duration-(--duration-instant) hover:border-border-strong focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
    >
      <ToolIcon name={tool.icon} className="text-fg" />
      <h3 className="mt-4 text-h3">{c.title}</h3>
      <p className="mt-1 text-sm text-fg-muted">{c.subtitle}</p>
    </Link>
  );
}
