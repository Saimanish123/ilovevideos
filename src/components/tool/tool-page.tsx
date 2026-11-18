import { Link } from "@/lib/i18n/navigation";
import type { CategoryDefinition, ToolDefinition } from "@/tools/registry/schema";
import { Breadcrumb } from "./breadcrumb";
import { idleSpecs } from "./options/idle";
import { Prose } from "./prose";
import { stageToolOf } from "./stage-run";
import { ToolCard } from "./tool-card";
import { ToolStage } from "./tool-stage";

/**
 * Static shell of every tool page. Order matters for SEO and for the user:
 * H1 → subtitle → stage (interactive) → what → steps → good to know → FAQ → related.
 * See README.md#tool-page-specification.
 */
export function ToolPage({
  tool,
  category,
  related,
  hubPages = [],
  locale,
}: {
  tool: ToolDefinition;
  category: CategoryDefinition;
  related: ToolDefinition[];
  /** Converter hubs: every pair page below them (registry.getHubPages). Empty elsewhere. */
  hubPages?: ToolDefinition[];
  locale: string;
}) {
  const c = tool.content[locale] ?? tool.content.en;
  return (
    <article className="mx-auto w-full max-w-(--container-stage) px-4 py-12 md:px-8 md:py-16">
      <header className="mx-auto max-w-(--container-content)">
        <Breadcrumb tool={tool} category={category} locale={locale} />
        <h1 className="mt-4 text-h1 text-balance">{c.title}</h1>
        <p className="mt-3 max-w-(--container-prose) text-body-lg text-fg-muted">{c.subtitle}</p>
      </header>

      <div className="mt-10">
        {/* Only the stage's own fields and this engine's idle module reach the browser. */}
        <ToolStage tool={stageToolOf(tool)} idle={idleSpecs[tool.engine]} />
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
              <p key={p.slice(0, 40)}>
                <Prose text={p} />
              </p>
            ))}
          </div>
          {tool.sources.length > 0 && (
            <div className="mt-6 text-fg-muted text-sm">
              <p>Sources, checked {[...new Set(tool.sources.map((x) => x.checked))].join(", ")}:</p>
              <ul className="mt-2 space-y-1">
                {tool.sources.map((x) => (
                  <li key={x.url}>
                    <a
                      href={x.url}
                      rel="noopener"
                      className="inline-flex min-h-11 items-center text-fg underline decoration-1 underline-offset-3 hover:decoration-fg-muted"
                    >
                      {x.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section aria-labelledby="faq">
          <h2 id="faq" className="text-h2">
            Questions
          </h2>
          <dl className="mt-4 divide-y divide-border">
            {c.faq.map((f) => (
              <div key={f.q} className="py-4">
                <dt className="text-body font-medium">{f.q}</dt>
                <dd className="mt-1 text-body text-fg-muted">
                  <Prose text={f.a} />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      {hubPages.length > 0 && (
        <section aria-labelledby="pairs" className="mx-auto mt-24 max-w-(--container-content)">
          <h2 id="pairs" className="text-h2">
            Pages for common conversions
          </h2>
          <ul className="mt-6 grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
            {hubPages.map((t) => (
              <li key={t.slug}>
                <Link
                  href={`/${t.slug}`}
                  className="inline-flex min-h-11 items-center rounded-sm text-body text-fg underline decoration-1 underline-offset-3 hover:decoration-fg-muted focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
                >
                  {(t.content[locale] ?? t.content.en).title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {related.length > 0 && (
        <section aria-labelledby="related" className="mx-auto mt-24 max-w-(--container-content)">
          <h2 id="related" className="text-h2">
            Related tools
          </h2>
          <ul className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {related.map((t) => (
              <li key={t.slug}>
                <ToolCard tool={t} locale={locale} />
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-fg-muted">
            <Link
              href="/#tools"
              className="underline underline-offset-3 decoration-1 hover:decoration-fg-muted"
            >
              All tools
            </Link>
          </p>
        </section>
      )}
    </article>
  );
}
