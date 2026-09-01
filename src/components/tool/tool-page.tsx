import { Link } from "@/lib/i18n/navigation";
import type { ToolDefinition } from "@/tools/registry/schema";
import { ToolCard } from "./tool-card";
import { ToolStage } from "./tool-stage";

/**
 * Static shell of every tool page. Order matters for SEO and for the user:
 * H1 → subtitle → stage (interactive) → what → steps → good to know → FAQ → related.
 * See docs/10-tool-page-spec.md.
 */
export function ToolPage({
  tool,
  related,
  locale,
}: {
  tool: ToolDefinition;
  related: ToolDefinition[];
  locale: string;
}) {
  const c = tool.content[locale] ?? tool.content.en;
  return (
    <article className="mx-auto w-full max-w-(--container-stage) px-4 py-12 md:px-8 md:py-16">
      <header className="mx-auto max-w-(--container-content)">
        <h1 className="text-h1 text-balance">{c.title}</h1>
        <p className="mt-3 max-w-[60ch] text-body-lg text-fg-muted">{c.subtitle}</p>
      </header>

      <div className="mt-10">
        <ToolStage tool={tool} />
      </div>

      <div className="mx-auto mt-24 grid max-w-(--container-content) gap-16 md:grid-cols-[minmax(0,65ch)]">
        <section aria-labelledby="what">
          <h2 id="what" className="text-h2">
            What this does
          </h2>
          <p className="mt-4 text-body text-fg-muted">{c.what}</p>
        </section>

        <section aria-labelledby="how">
          <h2 id="how" className="text-h2">
            How to use it
          </h2>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-body text-fg-muted marker:tabular-nums">
            {c.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="know">
          <h2 id="know" className="text-h2">
            Good to know
          </h2>
          <div className="mt-4 space-y-4 text-body text-fg-muted">
            {c.goodToKnow.map((p) => (
              <p key={p.slice(0, 40)}>{p}</p>
            ))}
          </div>
        </section>

        <section aria-labelledby="faq">
          <h2 id="faq" className="text-h2">
            Questions
          </h2>
          <dl className="mt-4 divide-y divide-border">
            {c.faq.map((f) => (
              <div key={f.q} className="py-4">
                <dt className="text-body font-medium">{f.q}</dt>
                <dd className="mt-1 text-body text-fg-muted">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      {related.length > 0 && (
        <section aria-labelledby="related" className="mx-auto mt-24 max-w-(--container-content)">
          <h2 id="related" className="text-h2">
            Related tools
          </h2>
          <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((t) => (
              <li key={t.slug}>
                <ToolCard tool={t} locale={locale} />
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-fg-muted">
            <Link
              href="/"
              className="underline underline-offset-[3px] decoration-1 hover:decoration-fg-muted"
            >
              All tools
            </Link>
          </p>
        </section>
      )}
    </article>
  );
}
