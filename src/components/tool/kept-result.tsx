"use client";

import { Download, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/format";
import type { KeptResult } from "@/lib/storage/kept-results";
import { canZip, makeZip, uniqueNames } from "@/lib/zip";

/** "14:02" today, "yesterday 22:10" otherwise (results are kept for 24 hours). */
export function keptWhen(savedAt: number, now = Date.now()): string {
  const d = new Date(savedAt);
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return new Date(now).toDateString() === d.toDateString() ? time : `yesterday ${time}`;
}

/** A file name as its stem and its extension, so a narrow row cuts the stem and keeps ".mp4". */
export function splitName(name: string): [string, string] {
  const dot = name.lastIndexOf(".");
  return dot > 0 && name.length - dot <= 6 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
}

const link =
  "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-sm text-sm underline decoration-1 underline-offset-3 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2";

/**
 * A page's last result after a reload (ADR-0131): one row under the drop zone's way in. On phones it
 * follows the prompt in the zone's tall, top-aligned space (in view, nothing below it moves); from
 * md it sits at the zone's foot in room reserved before first paint (`data-kept`), so the centred
 * prompt does not move either.
 * Download is a quiet link (the drop zone stays the page's action); the cross removes it.
 */
export function KeptResultPanel({ kept, onDismiss }: { kept: KeptResult; onDismiss: () => void }) {
  const { meta, files } = kept;
  const single = files.length === 1 ? files[0] : undefined;
  const total = files.reduce((n, f) => n + f.size, 0);
  const [url, setUrl] = useState<string>();
  const entries = useMemo(() => {
    const names = uniqueNames(files.map((f) => f.name));
    return files.map((f, i) => ({ name: names[i] ?? f.name, blob: f as Blob }));
  }, [files]);
  useEffect(() => {
    let u: string | undefined;
    let live = true;
    if (single) {
      u = URL.createObjectURL(single);
      setUrl(u);
    } else if (canZip(entries))
      void makeZip(entries).then(
        (zip) => {
          if (!live) return;
          u = URL.createObjectURL(zip);
          setUrl(u);
        },
        () => undefined,
      );
    return () => {
      live = false;
      if (u) URL.revokeObjectURL(u);
      setUrl(undefined);
    };
  }, [single, entries]);
  const download = single?.name ?? meta.zipName ?? "results.zip";
  const [stem, ext] = single ? splitName(single.name) : [`${files.length} files`, ""];
  const label = single ? "Download" : "Download all";

  return (
    <div
      data-kept-result=""
      // Read from storage after the zone is drawn, into room kept for it: fades in (ADR-0157).
      className="arrive mt-6 flex w-full max-w-sm flex-wrap items-center gap-x-3 border-border border-t pt-4 text-left sm:flex-nowrap md:absolute md:inset-x-8 md:bottom-6 md:mx-auto md:mt-0 md:w-auto"
    >
      {/* Below sm the name gets the full width; Download and the cross go under it. */}
      <div className="w-full min-w-0 sm:w-auto sm:flex-1">
        <p className="font-medium text-sm">Your last result</p>
        <p className="tabular flex min-w-0 text-fg-muted text-xs">
          <span className="truncate">{stem}</span>
          <span className="shrink-0 whitespace-pre">{`${ext} · ${formatBytes(total)} · ${keptWhen(meta.savedAt)}`}</span>
        </p>
      </div>
      {url ? (
        <a href={url} download={download} className={link}>
          <Download size={16} strokeWidth={1.5} aria-hidden />
          {label}
        </a>
      ) : (
        <span className={`${link} text-fg-muted no-underline`} aria-disabled="true">
          <Download size={16} strokeWidth={1.5} aria-hidden />
          {label}
        </span>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="ml-auto shrink-0 sm:ml-0"
        aria-label="Remove your last result"
        onClick={onDismiss}
      >
        <X size={20} strokeWidth={1.5} aria-hidden />
      </Button>
    </div>
  );
}
