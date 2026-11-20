"use client";

import { createContext, type ReactNode, useContext, useEffect } from "react";
import { rememberTool } from "@/lib/recent-tools";
import type { NextStepLink } from "./options/types";

/**
 * What a tool page knows that its stage's spec does not (ADR-0126): which page this is and the
 * registry's "Then" candidates for what it makes. Set by the static page shell, read by the result
 * card, so no stage or spec had to change. Also records the page in this browser's recent tools
 * (ADR-0124) once it is open.
 */
/** A "Then" candidate; `title` is the target page's own title, to spot a spec label that only repeats it. */
export type ThenStep = NextStepLink & { title?: string };
const ThenContext = createContext<{ slug: string; steps: ThenStep[] } | null>(null);

export function ToolPageContext({
  slug,
  title,
  steps,
  children,
}: {
  slug: string;
  title: string;
  steps: ThenStep[];
  children: ReactNode;
}) {
  useEffect(() => {
    rememberTool(slug, title);
  }, [slug, title]);
  return <ThenContext.Provider value={{ slug, steps }}>{children}</ThenContext.Provider>;
}

/** At most three: the page's own next step first, then the registry's, never this page twice. */
export function thenStepsFor(
  nextStep: NextStepLink | undefined,
  context: { slug: string; steps: ThenStep[] } | null,
  missed: boolean,
): NextStepLink[] {
  // A spec label that is only the page's title ("Compress video") reads better as the row's words
  // ("Make it smaller"); a specific one ("Compress this part to share it") is kept.
  const same = nextStep && context?.steps.find((s) => s.slug === nextStep.slug);
  const own =
    nextStep && same?.title && nextStep.label === same.title
      ? { ...nextStep, label: same.label }
      : nextStep;
  const out: NextStepLink[] = own ? [own] : [];
  // A result that missed its goal has one way forward (the page's own); more would scatter it.
  if (missed || !context) return out;
  for (const s of context.steps) {
    if (out.length >= 3) break;
    if (s.slug === context.slug || out.some((o) => o.slug === s.slug)) continue;
    out.push({ slug: s.slug, label: s.label });
  }
  return out;
}

/** The page's context, for the result card's "Then" row (result-card.tsx). */
export function useThenContext() {
  return useContext(ThenContext);
}
