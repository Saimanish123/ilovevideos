"use client";

import { AudioLines, ImageIcon } from "lucide-react";
import { setHandoff } from "@/lib/handoff";
import { Link } from "@/lib/i18n/navigation";
import type { EditMetadataOptions, TagValues } from "@/tools/engines/edit-metadata/fields";
import type { MediaInfo } from "@/tools/engines/types";
import type { HeroProps } from "../options/types";
import { useFilmstrip } from "../timeline/use-filmstrip";
import { useBytesUrl, useEditable } from "./use-editable";

/** "1 Aug 2026" in the reader's locale. */
const day = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/** The values shown: the edit where there is one, else the file's own. */
export function shownValues(file: TagValues, set: TagValues | undefined): TagValues {
  const out: TagValues = { ...file };
  for (const [k, v] of Object.entries(set ?? {}) as [keyof TagValues, string | undefined][])
    if (v !== undefined) out[k] = v.trim();
  return out;
}

/**
 * The page's hero (spec.Hero): the file as a player's "now playing" card shows it, with the edit
 * applied as it is typed: the cover (or, for a video without one, a frame of it), the title, then
 * artist, album and year. Under it, what the file also says about itself and keeps: where, on what
 * and when it was recorded. When done it reads the new copy back, so the card is the proof.
 */
export function TagCard({ file, info, value, phase, showing }: HeroProps<EditMetadataOptions>) {
  const result = showing === "result";
  const read = useEditable(file);
  const tags = read.status === "done" ? read.tags : undefined;
  // The edit is shown on the source; the result shows only what the copy itself says.
  const values = result ? (tags?.values ?? {}) : shownValues(tags?.values ?? {}, value?.set);
  const newCover = !result && value?.cover ? value.cover.blob : undefined;
  const keptCover = !result && value?.cover === null ? undefined : tags?.cover;
  const coverUrl = useBytesUrl(newCover ?? keptCover?.data, keptCover?.mime);
  const video = info?.video !== undefined;
  const [frame] = useFilmstrip(file, video && !coverUrl ? (info?.durationSec ?? 0) : 0, 1);
  const line = [values.artist, values.album, values.date?.slice(0, 4)].filter(Boolean).join(" · ");
  const name = file.name.replace(/\.[^.]+$/, "");

  return (
    <section
      aria-label="Tags"
      className="min-h-64 rounded-md bg-bg-subtle p-4 md:p-6"
      data-testid={result ? "tags-after" : "tags-before"}
    >
      <p className="text-fg-muted text-sm" aria-live="polite">
        {read.status === "reading" || phase === "inspecting"
          ? "Reading the tags"
          : result
            ? "Read back from the new copy"
            : phase === "processing"
              ? "Writing the tags"
              : "As players will show it"}
      </p>
      <div className="mt-4 flex items-start gap-4">
        <div className="relative size-24 shrink-0 overflow-hidden rounded-md bg-bg-stage md:size-32">
          {coverUrl ? (
            <img src={coverUrl} alt="Cover art" className="h-full w-full object-cover" />
          ) : frame ? (
            <img src={frame} alt="" className="h-full w-full object-cover opacity-60" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-gray-300">
              {video ? (
                <ImageIcon size={24} strokeWidth={1.5} aria-hidden />
              ) : (
                <AudioLines size={24} strokeWidth={1.5} aria-hidden />
              )}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <p className="break-words text-h3">
            {values.title || <span className="text-fg-muted">{name}</span>}
          </p>
          {!values.title && (
            <p className="mt-1 text-fg-muted text-xs">No title tag: players show the file name.</p>
          )}
          {line && <p className="mt-1 break-words text-fg-muted text-sm">{line}</p>}
          {values.genre && <p className="mt-1 text-fg-muted text-sm">{values.genre}</p>}
          {!coverUrl && tags?.format !== "mov" && (
            <p className="mt-1 text-fg-muted text-xs">No cover art.</p>
          )}
        </div>
      </div>
      {values.comment && <p className="mt-4 line-clamp-3 break-words text-sm">{values.comment}</p>}
      {read.status === "failed" && <p className="mt-4 text-sm">{read.message}</p>}
      <Kept info={info} file={file} />
    </section>
  );
}

/** What else the file says about itself, which this tool leaves as it is. */
function Kept({ info, file }: { info?: MediaInfo; file: File }) {
  const t = info?.tags;
  const lines = [
    t?.location && { label: "Location (GPS)", value: t.location },
    (t?.make || t?.model) && {
      label: "Device",
      value: [t?.make, t?.model].filter(Boolean).join(" "),
    },
    t?.recordedAt && { label: "Recorded", value: day(t.recordedAt) },
    t?.software && { label: "Software", value: t.software },
  ].filter((l): l is { label: string; value: string } => !!l);
  if (lines.length === 0) return null;
  return (
    <div className="mt-6 border-border border-t pt-4 text-sm">
      <p className="font-medium">Kept as it is</p>
      <ul className="mt-2 flex flex-col gap-1">
        {lines.map((l) => (
          <li key={l.label} className="flex flex-wrap justify-between gap-x-3">
            <span>{l.label}</span>
            <span className="tabular min-w-0 break-words text-fg-muted">{l.value}</span>
          </li>
        ))}
      </ul>
      {t?.location && (
        <p className="mt-2 text-fg-muted text-xs">
          The location travels with the file.{" "}
          <Link
            href="/remove-metadata-from-video"
            onClick={() => setHandoff(file)}
            className="rounded-sm font-medium text-fg underline decoration-1 underline-offset-3 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
          >
            Remove metadata
          </Link>{" "}
          writes a copy without it.
        </p>
      )}
    </div>
  );
}
