import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";
import { JsonLd } from "@/components/layout/json-ld";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { GeistMono, GeistSans } from "@/lib/fonts";
import { routing } from "@/lib/i18n/routing";
import { organization, website } from "@/lib/seo/jsonld";
import { site } from "@/lib/site";
import "@/styles/globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `Video tools, free, on your device · ${site.name}`,
    template: `%s · ${site.name}`,
  },
  description: site.description,
  robots: { index: true, follow: true },
};

const SW_REGISTER =
  'if("serviceWorker"in navigator)addEventListener("load",function(){navigator.serviceWorker.register("/sw.js",{updateViaCache:"none"}).catch(function(){})})';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body className="flex min-h-dvh flex-col antialiased">
        <a
          href="#main"
          className="sr-only z-50 rounded-md bg-bg-raised text-sm shadow-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:px-4 focus:py-3"
        >
          Skip to content
        </a>
        <JsonLd data={[organization(), website()]} />
        {/* The service worker (ADR-0102), registered after load by 154 bytes of inline script (hashed
            into the page's CSP at build), so the first-load script budget pays nothing for it. */}
        {process.env.NODE_ENV === "production" && (
          <script dangerouslySetInnerHTML={{ __html: SW_REGISTER }} />
        )}
        {/* Light only for now (ADR-0010). The provider stays so a dark theme can be re-enabled in one place. */}
        <ThemeProvider attribute="data-theme" forcedTheme="light" enableSystem={false}>
          <NextIntlClientProvider>
            <SiteHeader />
            <main id="main" className="flex-1">
              {children}
            </main>
            <SiteFooter locale={locale} />
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
