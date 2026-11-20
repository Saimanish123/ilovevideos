import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/lib/i18n/navigation";
import { keptZoneScript } from "@/lib/storage/keys";
import type { CategoryDefinition, ToolDefinition } from "@/tools/registry/schema";
import { Breadcrumb } from "./breadcrumb";
import { idleSpecs } from "./options/idle";
import { Prose } from "./prose";
import { ProseSection } from "./prose-section";
import { stageToolOf } from "./stage-run";
import { type ThenStep, ToolPageContext } from "./then-steps";
import { ToolStage } from "./tool-stage";

/**
 * Static shell of every tool page. Each content block carries the header's own gutter (px-4,
 * md:px-8) inside `--container-content`, so the H1, related tools and prose line up with the
 * wordmark at every width; the stage alone runs to the wider `--container-stage`.
 * Order matters for SEO and for the user:
 * H1 → subtitle → stage (interactive) → what (open) → steps, good to know, questions (folded
 * rows) → related tools (pills, "All tools" beside the heading) last. Generated pages (format
 * pairs, presets) are not listed here: they are reached from search, their hub's closed disclosure and their siblings (ADR-0154).
 * See README.md#tool-page-specification.
 */
export function ToolPage({
  tool,
  category,
  related,
  locale,
  then = [],
}: {
  tool: ToolDefinition;
  category: CategoryDefinition;
  related: ToolDefinition[];
  locale: string;
  /** "Then" candidates for the result (registry.getThenSteps); the stage's own next step goes first. */
  then?: ThenStep[];
}) {
  const c = tool.content[locale] ?? tool.content.en;
  return (
    <article className="mx-auto w-full max-w-(--container-stage) py-12 md:py-16">
      {/* The page's one entrance (ADR-0157): the trail, then the stage 40 ms later. The H1 and subtitle
          (the LCP) stay still. */}
      <header className="mx-auto max-w-(--container-content) px-4 md:px-8">
        <div className="enter-0">
          <Breadcrumb tool={tool} category={category} locale={locale} />
        </div>
        <h1 className="mt-4 text-h1 text-balance">{c.title}</h1>
        <p className="mt-3 max-w-(--container-prose) text-body-lg text-fg-muted">{c.subtitle}</p>
      </header>

      <div className="enter-1 mt-10 px-4 md:px-8">
        {/* Only the stage's own fields and this engine's idle module reach the browser. */}
        <ToolPageContext slug={tool.slug} title={c.title} steps={then}>
          <ToolStage tool={stageToolOf(tool)} idle={idleSpecs[tool.engine]} />
        </ToolPageContext>
        {/* Reserves room for "Your last result" before first paint (ADR-0131; CSP-hashed). */}
        <script dangerouslySetInnerHTML={{ __html: keptZoneScript }} />
      </div>

      {/* The reading content folds away: one open intro, then rows that open on demand, so the page
          is short to scroll and every word is still in the HTML (README tool-page spec, owner 2026-11-19). */}
      <div className="mx-auto mt-16 max-w-(--container-content) px-4 md:px-8">
        {/* The rows reveal once as they scroll into view, 30 ms apart (ADR-0157). */}
        <div data-reveal="group" className="max-w-(--container-prose) border-border border-b">
          <ProseSection id="what" title="What this does" open>
            <p className="text-body text-fg-muted">{c.what}</p>
          </ProseSection>

          <ProseSection id="how" title="How to use it">
            <ol className="list-decimal space-y-2 pl-5 text-body text-fg-muted marker:tabular-nums">
              {c.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </ProseSection>

          <ProseSection id="know" title="Good to know">
            <div className="space-y-4 text-body text-fg-muted">
              {c.goodToKnow.map((p) => (
                <p key={p.slice(0, 40)}>
                  <Prose text={p} />
                </p>
              ))}
            </div>
            {tool.sources.length > 0 && (
              <div className="mt-6 text-fg-muted text-sm">
                <p>Sources:</p>
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
          </ProseSection>

          <ProseSection id="faq" title="Questions">
            <dl className="divide-y divide-border">
              {c.faq.map((f) => (
                <div key={f.q} className="py-4 first:pt-0">
                  <dt className="text-body font-medium">{f.q}</dt>
                  <dd className="mt-1 text-body text-fg-muted">
                    <Prose text={f.a} />
                  </dd>
                </div>
              ))}
            </dl>
          </ProseSection>
        </div>
      </div>
      {related.length > 0 && (
        <section
          aria-labelledby="related"
          className="mx-auto mt-16 max-w-(--container-content) px-4 md:px-8"
        >
          {/* The heading row carries "All tools" on the right, as the home rows carry "See all", so
              no lone link wraps under the pills. Name-only pills (owner, 2026-11-19). */}
          <div data-reveal className="flex items-baseline justify-between gap-4">
            <h2 id="related" className="text-h3">
              Related tools
            </h2>
            <Link
              href="/#tools"
              className="inline-flex min-h-11 items-center rounded-sm text-fg-muted text-sm transition-colors duration-(--duration-instant) hover:text-fg focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
            >
              All tools
            </Link>
          </div>
          <ul data-reveal="group" className="mt-2 flex flex-wrap gap-2">
            {related.map((t) => (
              <li key={t.slug}>
                <Link
                  href={`/${t.slug}`}
                  className={buttonVariants({ variant: "chip", size: "pill" })}
                >
                  {/* Wraps inside the pill at 360 rather than truncating; balanced, so no lone word. */}
                  <span className="text-balance whitespace-normal">
                    {(t.content[locale] ?? t.content.en).title}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
