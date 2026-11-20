import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { devRoutesEnabled } from "@/lib/dev-routes";
import { VisionBench } from "./vision-bench";

/**
 * Parity and speed bench for the WebGL 2 vision kit (src/tools/engines/vision), driven by
 * tests/e2e/vision.spec.ts. Dev only, like /dev/ui: a normal production build returns 404, robots
 * block /dev/, and it is noindex.
 */
export const metadata: Metadata = {
  title: "Vision kit bench",
  robots: { index: false, follow: false },
};

export default async function DevVisionPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (!devRoutesEnabled()) notFound();
  return <VisionBench />;
}
