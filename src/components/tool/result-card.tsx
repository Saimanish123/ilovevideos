"use client";

import { ArrowRight, Check, Minus } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatBytes, formatPercentChange } from "@/lib/format";
import { setHandoff } from "@/lib/handoff";
import { Link } from "@/lib/i18n/navigation";
import { FileName } from "./file-card";
import type { NextStepLink, ResultVerdict } from "./options/types";

/** Result with real before → after numbers (design system §8.6). Download is the only primary. */
export function ResultCard({
  blob,
  filename,
  beforeBytes,
  meta,
  ffmpegCommand,
  onStartOver,
  verdict,
  onAdjust,
  nextStep,
  sourceFile,
  showChange = true,
  audioPreview = true,
}: {
  blob: Blob;
  filename: string;
  beforeBytes: number;
  meta?: string;
  ffmpegCommand?: string;
  onStartOver: () => void;
  /** The tool's own verdict (spec.result): replaces "Done" with the job's outcome. */
  verdict?: ResultVerdict;
  /**
   * Back to the ready state with the same file and options, to tweak and run again. Secondary when
   * the verdict missed (it is the likely next move), quiet otherwise.
   */
  onAdjust?: () => void;
  /** The likely next step (spec.nextStep), one sibling link under the actions. */
  nextStep?: NextStepLink;
  /** The source file, for a next step that hands on the original (`nextStep.with`). */
  sourceFile?: File;
  /** Off when "before" is several inputs (merge): their total against the output is not a saving. */
  showChange?: boolean;
  /** Off when the page's hero (spec.Hero) already plays the audio output. */
  audioPreview?: boolean;
}) {
  // Created in an effect (not useMemo) so StrictMode's double invoke cannot revoke a URL still in use.
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  // A still image is not a smaller version of the video, so the percentage would mislead (principles §1.7).
  const isStill = /^image\/(png|jpeg|webp)$/.test(blob.type);
  // Before → after compares like with like; a still, or a verdict that says so, is its own thing.
  const compare = !isStill && verdict?.before !== false;
  const change =
    !showChange || isStill || verdict?.change === false
      ? ""
      : formatPercentChange(beforeBytes, blob.size);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-fg text-bg-raised">
          {verdict?.missed ? (
            <Minus size={16} strokeWidth={1.5} aria-hidden />
          ) : (
            <Check size={16} strokeWidth={1.5} aria-hidden />
          )}
        </span>
        <div className="min-w-0">
          <p className="text-h3">{verdict?.title ?? "Done"}</p>
          <p className="tabular mt-1 text-fg-muted text-sm">
            {compare ? (
              <>
                {formatBytes(beforeBytes)} → {formatBytes(blob.size)}
                {change && ` (${change})`}
                {meta && ` · ${meta}`}
              </>
            ) : (
              // A different kind of file (a still from a video): its own facts, no before → after.
              [meta, formatBytes(blob.size)].filter(Boolean).join(" · ")
            )}
          </p>
          {verdict?.detail && <p className="mt-2 text-sm">{verdict.detail}</p>}
        </div>
      </div>
      <div className="rounded-md bg-bg-subtle px-4 py-3 text-sm">
        <FileName name={filename} />
      </div>
      {url && audioPreview && blob.type.startsWith("audio/") && (
        // biome-ignore lint/a11y/useMediaCaption: the result is the user's own sound track; there is no transcript to offer
        <audio
          controls
          preload="metadata"
          src={url}
          aria-label={`Preview of ${filename}`}
          className="w-full"
        />
      )}
      {/* One column at every width: the primary keeps the full-width slot the run button had, and the
          two quiet ways back sit under it instead of wrapping into a ragged row. */}
      <div className="flex flex-col gap-3">
        {url ? (
          <a
            href={url}
            download={filename}
            data-action="download"
            className={buttonVariants({ variant: "primary", size: "lg", className: "w-full" })}
          >
            Download
          </a>
        ) : (
          <Button variant="primary" size="lg" className="w-full" disabled>
            Download
          </Button>
        )}
        {onAdjust && (
          <Button
            variant={verdict?.missed ? "secondary" : "ghost"}
            size="lg"
            className="w-full"
            onClick={onAdjust}
          >
            Change settings
          </Button>
        )}
        <Button variant="ghost" size="lg" className="w-full" onClick={onStartOver}>
          Start over
        </Button>
      </div>
      {nextStep && (
        <NextStep
          slug={nextStep.slug}
          label={nextStep.label}
          file={
            nextStep.with === "source"
              ? sourceFile
              : new File([blob], filename, { type: blob.type })
          }
        />
      )}
      {ffmpegCommand && (
        <details className="text-sm">
          <summary className="flex min-h-11 cursor-pointer items-center text-fg-muted hover:text-fg">
            The same operation with ffmpeg
          </summary>
          <pre className="mt-2 overflow-x-auto rounded-md bg-bg-subtle p-3 font-mono text-xs">
            {ffmpegCommand}
          </pre>
        </details>
      )}
    </div>
  );
}

/**
 * One link to the tool most people use next (spec.nextStep). Shared with the multi-file result.
 * With `file`, the link hands that output to the next tool, which opens with it already loaded.
 */
export function NextStep({ slug, label, file }: { slug: string; label: string; file?: File }) {
  return (
    <Link
      href={`/${slug}`}
      onClick={file ? () => setHandoff(file) : undefined}
      className="inline-flex min-h-11 items-center gap-2 self-start rounded-sm text-sm underline decoration-1 underline-offset-3 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
    >
      {label}
      <ArrowRight size={16} strokeWidth={1.5} aria-hidden />
    </Link>
  );
}
