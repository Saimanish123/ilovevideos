"use client";

import { Check, Minus, Play } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { baseName, formatBytes } from "@/lib/format";
import { canZip, makeZip, uniqueNames } from "@/lib/zip";
import type { RunResultFile } from "@/tools/workers/client";
import { FileName } from "./file-card";
import type { NextStepLink, ResultVerdict } from "./options/types";
import { ThenRow } from "./result-card";

/**
 * Result of a multi-output run (split): every file with its time range and size, a Play button
 * that puts it in the preview slot, its own Download, and one ZIP of all of them as the primary
 * action. The ZIP is assembled from the parts already in memory (store only).
 * A batch passes `list={false}`: its queue rows already carry each file and its Download.
 */
export function ResultFiles({
  files,
  sourceName,
  beforeBytes,
  meta,
  ffmpegCommand,
  shown,
  onShow,
  nextStep,
  sourceFile,
  verdict,
  onStartOver,
  onAdjust,
  list = true,
  zipName: zipNameProp,
}: {
  files: RunResultFile[];
  /** The input's name, for the ZIP's name. */
  sourceName: string;
  beforeBytes: number;
  meta?: string;
  /** The equivalent ffmpeg command, kept as an attribute for tests and support; never shown. */
  ffmpegCommand?: string;
  /** Index of the file in the preview slot, when the page previews results. */
  shown?: number;
  onShow?: (index: number) => void;
  nextStep?: NextStepLink;
  /** The source file, for a next step that hands on the original (`nextStep.with`). */
  sourceFile?: File;
  /** The tool's own verdict (spec.result), as on the single-file result. */
  verdict?: ResultVerdict;
  onStartOver: () => void;
  /** Back to the ready state with the same file and options (as on the single-file result). */
  onAdjust?: () => void;
  /** Off when the files are listed elsewhere (the batch queue): header, ZIP and actions only. */
  list?: boolean;
  /** The ZIP's name; `<source>-parts.zip` by default. */
  zipName?: string;
}) {
  // Object URLs in an effect (not useMemo) so StrictMode's double invoke cannot revoke a live URL.
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const u = files.map((f) => URL.createObjectURL(f.blob));
    setUrls(u);
    return () => {
      for (const x of u) URL.revokeObjectURL(x);
    };
  }, [files]);

  const entries = useMemo(() => {
    const names = uniqueNames(files.map((f) => f.filename));
    return files.map((f, i) => ({ name: names[i] ?? f.filename, blob: f.blob }));
  }, [files]);
  const zippable = canZip(entries);
  const [zipUrl, setZipUrl] = useState<string>();
  const [zipFailed, setZipFailed] = useState(false);
  useEffect(() => {
    if (!zippable) return;
    const controller = new AbortController();
    let url: string | undefined;
    makeZip(entries, { signal: controller.signal })
      .then((zip) => {
        url = URL.createObjectURL(zip);
        setZipUrl(url);
      })
      .catch(() => {
        if (!controller.signal.aborted) setZipFailed(true);
      });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
      setZipUrl(undefined);
    };
  }, [entries, zippable]);

  const total = files.reduce((s, f) => s + f.blob.size, 0);
  const zipName = zipNameProp ?? `${baseName(sourceName)}-parts.zip`;

  return (
    // Arrives in parts, as the single result does (ADR-0157); the shared "Then" row comes last.
    <div className="flex flex-col gap-5" data-ffmpeg-command={ffmpegCommand}>
      <div className="arrive flex items-start gap-3">
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
            {formatBytes(beforeBytes)} → {files.length} {files.length === 1 ? "file" : "files"},{" "}
            {formatBytes(total)}
            {meta && ` · ${meta}`}
          </p>
          {verdict?.detail && <p className="mt-2 text-sm">{verdict.detail}</p>}
        </div>
      </div>

      {list && (
        <ol
          className="arrive arrive-1 flex max-h-96 flex-col gap-2 overflow-y-auto"
          aria-label="Parts"
        >
          {files.map((f, i) => (
            <li
              key={f.filename}
              className="flex items-center gap-2 rounded-md bg-bg-subtle py-1 pr-2 pl-1 text-sm"
            >
              {onShow && (
                <button
                  type="button"
                  aria-pressed={shown === i}
                  aria-label={`Play ${f.filename} in the preview`}
                  onClick={() => onShow(i)}
                  className={cn(
                    buttonVariants({ variant: "ghost", size: "md" }),
                    "h-11 w-11 shrink-0 p-0",
                    shown === i && "bg-bg-raised",
                  )}
                >
                  <Play size={16} strokeWidth={1.5} aria-hidden />
                </button>
              )}
              <div className="min-w-0 flex-1">
                <FileName name={f.filename} />
                <p className="tabular mt-0.5 text-fg-muted text-xs">
                  {[f.meta, formatBytes(f.blob.size)].filter(Boolean).join(" · ")}
                </p>
              </div>
              {urls[i] ? (
                <a
                  href={urls[i]}
                  download={f.filename}
                  aria-label={`Download ${f.filename}`}
                  className={cn(buttonVariants({ variant: "secondary", size: "md" }), "min-h-11")}
                >
                  Download
                </a>
              ) : null}
            </li>
          ))}
        </ol>
      )}

      {/* One column at every width: the primary keeps the full-width slot the run button had, and the
          two quiet ways back sit under it instead of wrapping into a ragged row. */}
      <div className="arrive arrive-2 flex flex-col gap-3">
        {zippable && zipUrl ? (
          <a
            href={zipUrl}
            download={zipName}
            data-action="download"
            className={buttonVariants({ variant: "primary", size: "lg", className: "w-full" })}
          >
            Download all (ZIP)
          </a>
        ) : zippable && !zipFailed ? (
          <Button variant="primary" size="lg" className="w-full" disabled>
            Preparing the ZIP
          </Button>
        ) : null}
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
      {(!zippable || zipFailed) && (
        <p className="text-fg-muted text-sm">
          {zipFailed
            ? "The ZIP could not be assembled in this browser. Download the files one by one."
            : "Together the files are too large for one ZIP file (4 GB). Download them one by one."}
        </p>
      )}
      {/* Hands on the part in the preview (or the first), so the next tool opens with it loaded. */}
      <ThenRow
        nextStep={nextStep}
        missed={verdict?.missed === true}
        result={() => handoffFile(files[shown ?? 0] ?? files[0])}
        source={sourceFile}
      />
    </div>
  );
}

const handoffFile = (f: RunResultFile | undefined) =>
  f ? new File([f.blob], f.filename, { type: f.blob.type }) : undefined;
