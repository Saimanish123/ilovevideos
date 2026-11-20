"use client";

import { createContext, useContext } from "react";
import { needsFfmpeg } from "@/tools/engines/crop/plan";
import type { MediaInfo } from "@/tools/engines/types";
import type { CompareSpec, OptionsSpec } from "../options/types";

/** What the done state can compare: the source, its facts, the result the preview plays, and how. */
export interface CompareSource {
  source: File;
  info: MediaInfo;
  result: File;
  spec: CompareSpec;
}

/** Speeds outside this cannot be followed: the source would play at 1/4 or 4× its rate, or beyond. */
export const MIN_SCALE = 0.25;
export const MAX_SCALE = 4;

/**
 * Whether and how the done state compares, for one finished run (ADR-0134). Undefined when the
 * page opts out (`compare: false`, or its function says so), when there is no single result to set
 * against a single source (several inputs or outputs), or when the source cannot play here: a
 * picture only a fallback decoder reads (AVI, WMV, MPEG-2; ProRes) has nothing to show.
 */
export function compareFor(
  spec: Pick<OptionsSpec<unknown>, "compare">,
  options: unknown,
  info: MediaInfo,
  source: File,
  result: File | undefined,
  run: { inputs?: number; outputs?: number },
): CompareSource | undefined {
  if (!result || spec.compare === false) return undefined;
  if ((run.inputs ?? 0) > 1 || (run.outputs ?? 1) > 1) return undefined;
  const resultIsSound = result.type.startsWith("audio/");
  const resultIsVideo = result.type.startsWith("video/");
  let chosen: CompareSpec | false;
  if (typeof spec.compare === "function") chosen = spec.compare(options, info);
  else if (resultIsSound) chosen = { what: "sound" };
  else if (resultIsVideo && info.video) chosen = { what: "picture" };
  else chosen = false;
  if (!chosen) return undefined;
  const scale = chosen.timeScale ?? 1;
  if (!(scale >= MIN_SCALE && scale <= MAX_SCALE)) return undefined;
  if (chosen.what === "picture") {
    if (!resultIsVideo || !info.video || needsFfmpeg(info, source.name)) return undefined;
  } else if (!info.audio?.length || !(resultIsSound || resultIsVideo)) return undefined;
  return { source, info, result, spec: chosen };
}

const CompareContext = createContext<CompareSource | undefined>(undefined);

/** Set by the stage around the done state's preview. */
export const CompareProvider = CompareContext.Provider;

/**
 * The compare for this preview, when it is showing the result the stage set up (a hero that plays
 * the source, or a different file, gets nothing).
 */
export function useCompareFor(file: File | undefined): CompareSource | undefined {
  const c = useContext(CompareContext);
  return c && file && c.result === file ? c : undefined;
}
