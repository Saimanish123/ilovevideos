import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { ClearSiteStorage } from "@/components/layout/clear-site-storage";
import { LegalPage, proseLink } from "@/components/layout/legal-page";
import { privacy } from "@/content/site";
import { Link } from "@/lib/i18n/navigation";
import { routing } from "@/lib/i18n/routing";
import { ogImages } from "@/lib/og/images";
import { site } from "@/lib/site";
import { ffmpegDownloadSize } from "@/tools/engines/ffmpeg/size";

const localePathOf = (locale: string) => (locale === routing.defaultLocale ? "" : `/${locale}`);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const url = `${site.url}${localePathOf(locale)}/privacy`;
  return {
    title: privacy.metaTitle,
    description: privacy.metaDescription,
    alternates: { canonical: url },
    openGraph: {
      title: privacy.metaTitle,
      description: privacy.metaDescription,
      url,
      images: ogImages("home", privacy.metaTitle).images,
    },
    twitter: ogImages("home", privacy.metaTitle).twitter,
  };
}

/** Privacy (README.md#privacy-and-processing §6). Every sentence must stay true of the code. */
export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <LegalPage
      title={privacy.title}
      path="/privacy"
      localePath={localePathOf(locale)}
      lead={privacy.lead}
      sections={privacy.sections}
      after={{ heading: "What this browser keeps", node: <ClearSiteStorage /> }}
    >
      <section className="mt-12">
        <h2 className="text-h2">In numbers</h2>
        <dl className="mt-4 divide-y divide-border text-body">
          <div className="grid gap-1 py-3 sm:grid-cols-[var(--container-label)_1fr] sm:gap-6">
            <dt className="font-medium">Bytes of your files sent anywhere</dt>
            <dd className="tabular text-fg-muted">0</dd>
          </div>
          <div className="grid gap-1 py-3 sm:grid-cols-[var(--container-label)_1fr] sm:gap-6">
            <dt className="font-medium">Cookies set</dt>
            <dd className="tabular text-fg-muted">0</dd>
          </div>
          <div className="grid gap-1 py-3 sm:grid-cols-[var(--container-label)_1fr] sm:gap-6">
            <dt className="font-medium">Third-party scripts</dt>
            <dd className="tabular text-fg-muted">0</dd>
          </div>
          <div className="grid gap-1 py-3 sm:grid-cols-[var(--container-label)_1fr] sm:gap-6">
            <dt className="font-medium">FFmpeg download, when a tool needs it</dt>
            <dd className="tabular text-fg-muted">{ffmpegDownloadSize()}, from this site, once</dd>
          </div>
        </dl>
        <p className="mt-6 text-body text-fg-muted">
          The software these tools run on is listed on the{" "}
          <Link href="/licences" className={proseLink}>
            licences page
          </Link>
          .
        </p>
      </section>
    </LegalPage>
  );
}
