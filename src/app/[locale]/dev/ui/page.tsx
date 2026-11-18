import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { devRoutesEnabled } from "@/lib/dev-routes";
import { KitchenSink } from "./kitchen-sink";

/**
 * Kitchen sink for the UI kit (design system §10). Dev only: it renders under `next dev` or a build
 * made with ENABLE_DEV_ROUTES=1 (the Playwright visual baseline); a production build returns 404.
 * Blocked in robots.txt (/dev/), never in the sitemap, and noindex in case a link ever leaks.
 */
export const metadata: Metadata = {
  title: "UI kit",
  robots: { index: false, follow: false },
};

export default async function DevUiPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (!devRoutesEnabled()) notFound();
  return <KitchenSink />;
}
