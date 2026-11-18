import type { ReactNode } from "react";
import { Link } from "@/lib/i18n/navigation";

/**
 * Renders registry prose. The only markup allowed is `[text](/slug)` for links to sibling tools
 * (README.md#tool-page-specification §4: every page links contextually to at least one sibling).
 */
export function Prose({ text }: { text: string }): ReactNode {
  const parts: ReactNode[] = [];
  const re = /\[([^\]]+)\]\((\/[a-z0-9-]+)\)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) parts.push(text.slice(last, i));
    parts.push(
      <Link
        key={`${i}-${m[2]}`}
        href={m[2] ?? "/"}
        className="text-fg underline decoration-1 underline-offset-3 hover:decoration-fg-muted"
      >
        {m[1]}
      </Link>,
    );
    last = i + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
