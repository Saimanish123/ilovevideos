import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { devRoutesEnabled } from "@/lib/dev-routes";
import { SupportProbe } from "./support-probe";

/**
 * Measures what this browser provides for the engines (src/lib/browser-support, ADR-0145), on the
 * page and in a worker, for tests/e2e/capabilities.spec.ts. Dev only, like /dev/ui: a normal
 * production build returns 404, robots block /dev/, and it is noindex.
 */
export const metadata: Metadata = {
  title: "Browser support probe",
  robots: { index: false, follow: false },
};

export default async function DevSupportPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (!devRoutesEnabled()) notFound();
  return <SupportProbe />;
}
