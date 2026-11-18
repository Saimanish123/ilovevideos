import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { ThemeProvider } from "next-themes";
import { NotFoundBody } from "@/components/layout/not-found-body";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { GeistMono, GeistSans } from "@/lib/fonts";
import { routing } from "@/lib/i18n/routing";
import { site } from "@/lib/site";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: `Page not found · ${site.name}`,
  robots: { index: false, follow: true },
};

/**
 * A URL that matches no route (`experimental.globalNotFound`): the root layout is a pass-through and
 * `<html>` belongs to the `[locale]` layout, so this page brings its own document, fonts, theme and
 * providers, and shows the same header, body and footer as `[locale]/not-found.tsx`.
 */
export default function GlobalNotFound() {
  const locale = routing.defaultLocale;
  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body className="flex min-h-dvh flex-col antialiased">
        <ThemeProvider attribute="data-theme" forcedTheme="light" enableSystem={false}>
          <NextIntlClientProvider locale={locale}>
            <SiteHeader />
            <main id="main" className="flex-1">
              <NotFoundBody />
            </main>
            <SiteFooter locale={locale} />
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
