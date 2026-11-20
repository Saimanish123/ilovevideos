"use client";

import { useEffect } from "react";
import { cn } from "@/lib/cn";
import { formatBytes } from "@/lib/format";
import { readLayout } from "@/tools/engines/faststart/boxes";
import { fileReader, takesFaststart } from "@/tools/engines/faststart/index";
import type { OptionsSpec } from "./types";
import { unfixable } from "./types";

/**
 * What the file's layout is, read on the page from box headers when the file arrives. Kept in the
 * value so the stage re-renders `blocked` when it is known; the engine's schema drops it.
 */
interface Found {
  kind: "front" | "end" | "fragmented" | "no-index" | "other";
  /** Media bytes before the index (index at the end). */
  media?: number;
  /** Size of the index. */
  index?: number;
}
type FaststartValue = { found?: Found };

async function inspectLayout(file: File): Promise<Found> {
  if (!takesFaststart(file.name)) return { kind: "other" };
  try {
    const l = await readLayout(fileReader(file), file.size);
    if (l.kind === "end") return { kind: "end", media: l.mdatBytes, index: l.moov.size };
    const moov = l.boxes.find((b) => b.type === "moov");
    return { kind: l.kind, index: moov?.size };
  } catch {
    return { kind: "no-index" };
  }
}

/** Two rows of blocks: where the index sits now and where it goes. Widths are to scale, with a floor. */
function LayoutBar({ found, sizeBytes }: { found: Found; sizeBytes: number }) {
  const media = found.media ?? sizeBytes;
  const index = found.index ?? 0;
  const indexPct = Math.max(6, Math.min(40, (index / Math.max(1, sizeBytes)) * 100));
  const row = (label: string, order: "index-last" | "index-first") => (
    <div className="flex items-center gap-3">
      <span className="w-12 shrink-0 text-fg-muted text-xs">{label}</span>
      <div className="flex h-6 min-w-0 flex-1 gap-1" aria-hidden>
        {order === "index-first" && (
          <div className="rounded-sm bg-fg" style={{ width: `${indexPct}%` }} />
        )}
        <div className="flex-1 rounded-sm bg-border-strong" />
        {order === "index-last" && (
          <div className="rounded-sm bg-fg" style={{ width: `${indexPct}%` }} />
        )}
      </div>
    </div>
  );
  return (
    <div className="flex flex-col gap-2">
      {row("Now", found.kind === "end" ? "index-last" : "index-first")}
      {found.kind === "end" && row("After", "index-first")}
      <p className="flex items-center gap-4 text-fg-muted text-xs">
        <span className="flex items-center gap-2">
          <span className="inline-block size-3 rounded-sm bg-fg" aria-hidden />
          <span className="tabular">{index > 0 ? `Index (${formatBytes(index)})` : "Index"}</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block size-3 rounded-sm bg-border-strong" aria-hidden />
          <span className="tabular">{`Media (${formatBytes(media)})`}</span>
        </span>
      </p>
    </div>
  );
}

const headline = (f: Found | undefined) =>
  !f
    ? "Reading the file's layout"
    : f.kind === "end"
      ? "The index is at the end"
      : f.kind === "front"
        ? "Already fast start"
        : f.kind === "fragmented"
          ? "Fragmented MP4: already streams"
          : f.kind === "no-index"
            ? "No index found"
            : "Not an MP4 or MOV file";

export const faststartSpec: OptionsSpec<FaststartValue> = {
  verb: "Optimise",
  previewResult: true,
  // A stream copy: identical picture and sound (ADR-0134).
  compare: false,
  nextStep: { slug: "video-info", label: "Check the result" },
  defaults: () => ({}),
  route: () => "page",
  blocked: (o, info) => {
    const f = o.found;
    if (!f) return undefined;
    if (f.kind === "front")
      return {
        reason:
          "The index is already in front of the media, so this file starts playing while it downloads. There is nothing to move.",
        settled: true,
      };
    if (f.kind === "fragmented")
      return {
        reason:
          "This is a fragmented MP4: each fragment carries its own index, so it already streams as it downloads.",
        settled: true,
      };
    if (f.kind === "no-index")
      return unfixable(
        "This file has no index (no moov box): it may be an unfinished recording. Try the original file from the camera or app.",
      );
    if (f.kind === "other")
      return {
        reason: `Fast start applies to MP4 and MOV. Convert this ${info.container} file to MP4: the converter writes the index at the front.`,
        action: { slug: "video-converter", label: "Convert to MP4" },
      };
    return undefined;
  },
  summary: (o) => {
    const f = o.found;
    if (f?.kind !== "end") return undefined;
    return `Moves the ${formatBytes(f.index ?? 0)} index in front of ${formatBytes(f.media ?? 0)} of media. Nothing is decoded or re-encoded: every packet, track, chapter and tag stays byte for byte, and the file size does not change.`;
  },
  result: (o) => ({
    title: "Ready to stream: index at the front",
    detail:
      o.found?.kind === "end"
        ? "A browser can now start playing it after the first few hundred kilobytes instead of fetching the end of the file first. The media bytes are unchanged."
        : "The file was already laid out for streaming and is unchanged.",
    change: false,
  }),
  Panel({ value, onChange, info, media }) {
    useEffect(() => {
      let cancelled = false;
      void inspectLayout(media.file).then((found) => {
        if (!cancelled) onChange({ ...value, found });
      });
      return () => {
        cancelled = true;
      };
    }, [media.file]);
    const f = value.found;
    return (
      <div className="flex flex-col gap-6" aria-live="polite">
        <div>
          <p className={cn("text-h3", !f && "text-fg-muted")} data-testid="faststart-state">
            {headline(f)}
          </p>
          <p className="mt-1 text-fg-muted text-sm">
            {f?.kind === "end"
              ? `A player has to reach the end of the file, past ${formatBytes(f.media ?? 0)} of media, before it knows how to play it. Browsers that can ask for byte ranges fetch the end first, an extra request before playback; players and servers that cannot must download the whole file.`
              : f?.kind === "front"
                ? "The index comes first, so playback can start after the first part arrives."
                : f?.kind === "fragmented"
                  ? "Streaming services and screen recorders often write MP4 this way."
                  : f?.kind === "other"
                    ? "Other containers keep their index differently."
                    : " "}
          </p>
        </div>
        {f && (f.kind === "end" || f.kind === "front") && (
          <LayoutBar found={f} sizeBytes={info.sizeBytes} />
        )}
      </div>
    );
  },
};
