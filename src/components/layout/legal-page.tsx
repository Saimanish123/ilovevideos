import type { ReactNode } from "react";
import { BreadcrumbTrail } from "@/components/layout/breadcrumb-trail";
import { JsonLd } from "@/components/layout/json-ld";
import { pageBreadcrumbs } from "@/lib/seo/jsonld";

/**
 * Shell for the plain-language pages (privacy, about, licences): breadcrumb and BreadcrumbList,
 * one H1, a lead, then sections set as prose at 65ch. One screen of reading, no decoration.
 */
export function LegalPage({
  title,
  path,
  localePath,
  lead,
  sections = [],
  children,
}: {
  title: string;
  path: string;
  localePath: string;
  lead: string;
  sections?: readonly { heading: string; paragraphs: readonly string[] }[];
  children?: ReactNode;
}) {
  return (
    <article className="mx-auto w-full max-w-(--container-content) px-4 py-12 md:px-8 md:py-16">
      <JsonLd data={pageBreadcrumbs([{ name: title, path }], localePath)} />
      <BreadcrumbTrail items={[{ name: "Home", href: "/" }, { name: title }]} />
      <div className="max-w-(--container-prose)">
        <h1 className="mt-4 text-balance text-h1">{title}</h1>
        <p className="mt-3 text-body-lg text-fg-muted">{lead}</p>
        {sections.map((s) => (
          <section key={s.heading} className="mt-12">
            <h2 className="text-h2">{s.heading}</h2>
            <div className="mt-4 space-y-4 text-body text-fg-muted">
              {s.paragraphs.map((p) => (
                <p key={p.slice(0, 40)}>{p}</p>
              ))}
            </div>
          </section>
        ))}
        {children}
      </div>
    </article>
  );
}

export const proseLink =
  "rounded-sm text-fg underline decoration-1 underline-offset-3 hover:decoration-fg-muted focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2";
