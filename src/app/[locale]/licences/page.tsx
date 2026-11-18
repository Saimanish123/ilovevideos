import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { LegalPage, proseLink } from "@/components/layout/legal-page";
import { licences } from "@/content/site";
import { routing } from "@/lib/i18n/routing";
import { ogImages } from "@/lib/og/images";
import { site } from "@/lib/site";

const localePathOf = (locale: string) => (locale === routing.defaultLocale ? "" : `/${locale}`);

/**
 * Facts about the shipped FFmpeg build, read from the installed package at build time so this page
 * cannot drift from what is served under /wasm (ADR-0004): the package version, its declared licence
 * and the configure line compiled into the WebAssembly binary.
 */
function ffmpegBuild(): { version: string; licence: string; configure?: string } {
  const root = join(process.cwd(), "node_modules/@ffmpeg/core-mt");
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    version: string;
    license: string;
  };
  let configure: string | undefined;
  try {
    const wasm = readFileSync(join(root, "dist/esm/ffmpeg-core.wasm")).toString("latin1");
    configure = /--target-os=[^\0]*?(?=\0)/.exec(wasm)?.[0];
  } catch {
    configure = undefined;
  }
  return { version: pkg.version, licence: pkg.license, configure };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const url = `${site.url}${localePathOf(locale)}/licences`;
  return {
    title: licences.metaTitle,
    description: licences.metaDescription,
    alternates: { canonical: url },
    openGraph: {
      title: licences.metaTitle,
      description: licences.metaDescription,
      url,
      images: ogImages("home", licences.metaTitle).images,
    },
    twitter: ogImages("home", licences.metaTitle).twitter,
  };
}

export default async function LicencesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const ffmpeg = ffmpegBuild();
  return (
    <LegalPage
      title={licences.title}
      path="/licences"
      localePath={localePathOf(locale)}
      lead={licences.lead}
    >
      <section className="mt-12">
        <h2 className="text-h2">FFmpeg</h2>
        <div className="mt-4 space-y-4 text-body text-fg-muted">
          {licences.ffmpeg.map((p) => (
            <p key={p.slice(0, 40)}>{p}</p>
          ))}
        </div>
        <dl className="mt-6 divide-y divide-border text-body">
          <div className="grid gap-1 py-3 sm:grid-cols-[var(--container-label)_1fr] sm:gap-6">
            <dt className="font-medium">Package</dt>
            <dd className="tabular text-fg-muted">@ffmpeg/core-mt {ffmpeg.version}</dd>
          </div>
          <div className="grid gap-1 py-3 sm:grid-cols-[var(--container-label)_1fr] sm:gap-6">
            <dt className="font-medium">Licence</dt>
            <dd className="text-fg-muted">
              GNU General Public License, version 2 or later ({ffmpeg.licence})
            </dd>
          </div>
          <div className="grid gap-1 py-3 sm:grid-cols-[var(--container-label)_1fr] sm:gap-6">
            <dt className="font-medium">Served from</dt>
            <dd className="font-mono text-fg-muted text-sm">/wasm/ffmpeg/{ffmpeg.version}/</dd>
          </div>
          <div className="grid gap-1 py-3 sm:grid-cols-[var(--container-label)_1fr] sm:gap-6">
            <dt className="font-medium">Source code</dt>
            <dd className="text-fg-muted">
              <a
                href="https://github.com/ffmpegwasm/ffmpeg.wasm"
                rel="noopener"
                className={proseLink}
              >
                ffmpeg.wasm repository
              </a>{" "}
              (the scripts this build is made from), and the{" "}
              <a
                href={`https://www.npmjs.com/package/@ffmpeg/core-mt/v/${ffmpeg.version}`}
                rel="noopener"
                className={proseLink}
              >
                published package
              </a>
            </dd>
          </div>
        </dl>
        {ffmpeg.configure && (
          <div className="mt-6">
            <h3 className="text-h3">Build configuration</h3>
            <p className="mt-2 text-fg-muted text-sm">
              Read from the shipped binary. It lists every library compiled in.
            </p>
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all rounded-md border border-border bg-bg-raised p-4 font-mono text-fg text-xs">
              {ffmpeg.configure}
            </pre>
          </div>
        )}
      </section>

      <section className="mt-12">
        <h2 className="text-h2">Other software and fonts</h2>
        <ul className="mt-4 divide-y divide-border">
          {licences.packages.map((p) => (
            <li key={p.name} className="py-4">
              <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                {"url" in p ? (
                  <a
                    href={p.url}
                    rel="noopener"
                    className={`${proseLink} inline-flex min-h-11 min-w-11 items-center font-medium md:min-h-0 pointer-coarse:min-h-11`}
                  >
                    {p.name}
                  </a>
                ) : (
                  <span className="font-medium">{p.name}</span>
                )}
                <span className="text-fg-muted text-sm">{p.licence}</span>
              </p>
              <p className="mt-1 text-fg-muted text-sm">{p.purpose}</p>
            </li>
          ))}
        </ul>
      </section>
    </LegalPage>
  );
}
