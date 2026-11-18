import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { LegalPage, proseLink } from "@/components/layout/legal-page";
import { about } from "@/content/site";
import { Link } from "@/lib/i18n/navigation";
import { routing } from "@/lib/i18n/routing";
import { ogImages } from "@/lib/og/images";
import { site } from "@/lib/site";

const localePathOf = (locale: string) => (locale === routing.defaultLocale ? "" : `/${locale}`);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const url = `${site.url}${localePathOf(locale)}/about`;
  return {
    title: about.metaTitle,
    description: about.metaDescription,
    alternates: { canonical: url },
    openGraph: {
      title: about.metaTitle,
      description: about.metaDescription,
      url,
      images: ogImages("home", about.metaTitle).images,
    },
    twitter: ogImages("home", about.metaTitle).twitter,
  };
}

/** About: what the site is, that it is free with no paid tier (ADR-0012), and what it will not do. */
export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <LegalPage
      title={about.title}
      path="/about"
      localePath={localePathOf(locale)}
      lead={about.lead}
      sections={about.sections}
    >
      <p className="mt-12 text-body text-fg-muted">
        How files are handled is described on the{" "}
        <Link href="/privacy" className={proseLink}>
          privacy page
        </Link>
        , and the software the tools run on is listed on the{" "}
        <Link href="/licences" className={proseLink}>
          licences page
        </Link>
        .
      </p>
    </LegalPage>
  );
}
