"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import type { StripMetadataOptions } from "@/tools/engines/strip-metadata";
import { countTags, describeTags, type TagLine } from "@/tools/engines/strip-metadata/tags";
import type { MediaInfo } from "@/tools/engines/types";
import type { HeroProps, OptionsSpec } from "./types";

/**
 * A movie-header time this close to now was written by the muxer when the copy was made (it always
 * stamps "now"), so it is not the capture time and says nothing about the recording.
 */
const WRITTEN_NOW_MS = 15 * 60 * 1000;
const writtenNow = (iso: string | undefined) =>
  !!iso && Math.abs(Date.parse(iso) - Date.now()) < WRITTEN_NOW_MS;

/** "location", "the device", "the date": the most telling thing removed, for the verdict. */
function headline(lines: TagLine[]): string | undefined {
  const has = (label: string) => lines.some((l) => l.label === label);
  if (has("Location (GPS)")) return "location";
  if (has("Device make") || has("Device model")) return "the device";
  if (has("Creation date")) return "the date";
  if (has("Author")) return "the author";
  return undefined;
}

const tagWords = (n: number) => (n === 1 ? "1 tag" : `${n} tags`);

export const stripMetadataSpec: OptionsSpec<StripMetadataOptions> = {
  verb: "Remove metadata",
  defaults: () => ({}),
  // The findings are the job, so they take the preview's place; when done, the hero re-reads the copy.
  Hero: MetadataHero,
  previewResult: true,
  nextStep: { slug: "video-info", label: "Check every field of the clean copy" },
  summary: (_o, info) => {
    const { lines } = describeTags(info.tags);
    const n = countTags(info.tags);
    if (n === 0)
      return "No tags this tool can read. It still writes a copy without any container tags; the streams are copied as they are.";
    const what = headline(lines);
    return `Removes ${tagWords(n)}${what ? `, including ${what}` : ""}. Video and audio are copied as they are, so nothing is lost.`;
  },
  result: (_o, info) => {
    const { lines } = describeTags(info.tags);
    const n = countTags(info.tags);
    const what = headline(lines);
    if (n === 0)
      return {
        title: "No tags found: a clean copy was written",
        detail: "The streams were copied bit for bit. The list shows what the copy carries.",
        change: false,
      };
    return {
      title: `Removed ${tagWords(n)}${what ? ` including ${what}` : ""}`,
      detail: "The streams were copied bit for bit. The list shows what is left in the copy.",
      change: false,
    };
  },
  Panel() {
    return (
      <div className="flex flex-col gap-3 text-sm">
        <p className="font-medium">Kept</p>
        <p className="text-fg-muted">
          The video and sound, copied bit for bit. Rotation, duration and codec settings stay,
          because players need them to show the video at all.
        </p>
      </div>
    );
  },
};

/**
 * The page's hero (spec.Hero): what the file says about itself, where it was filmed first, each
 * with its value when it is short text. When done it reads the clean copy again and lists what is
 * left, which is usually only the recording time the writer stamps as "now".
 */
function MetadataHero({ file, info, phase, showing }: HeroProps<StripMetadataOptions>) {
  const result = showing === "result";
  const after = useInspected(result ? file : undefined);
  if (!info || phase === "inspecting")
    return (
      <Card>
        <p className="text-fg-muted text-sm">Reading the file's tags</p>
      </Card>
    );
  if (result) {
    if (after.status === "reading")
      return (
        <Card>
          <p className="text-fg-muted text-sm" aria-live="polite">
            Reading the clean copy
          </p>
        </Card>
      );
    const tags = after.info?.tags;
    const stamped = writtenNow(tags?.recordedAt);
    const { lines, other } = describeTags(
      tags && stamped ? { ...tags, recordedAt: undefined } : tags,
    );
    return (
      <Card>
        <h2 className="text-h3">Left in the clean copy</h2>
        {after.status === "failed" ? (
          <p className="mt-3 text-fg-muted text-sm">
            The copy could not be read back here. The video info page lists every field it carries.
          </p>
        ) : lines.length === 0 && other === 0 ? (
          <p className="mt-3 text-sm" data-testid="metadata-after">
            No tags. Nothing in it says where, on what or by whom it was filmed.
          </p>
        ) : (
          <TagList lines={lines} other={other} testId="metadata-after" />
        )}
        {stamped && tags?.recordedAt && (
          <p className="mt-3 text-fg-muted text-sm">
            The recording time now reads {formatStamp(tags.recordedAt)}: the moment this copy was
            written, not when it was filmed. MP4 and MOV files always have a field for it.
          </p>
        )}
      </Card>
    );
  }
  const { lines, other } = describeTags(info.tags);
  const sensitive = lines.some((l) => l.sensitive);
  return (
    <Card>
      <h2 className="text-h3">
        {lines.length + other === 0 ? "No tags found" : "Found in this file"}
      </h2>
      {lines.length + other === 0 ? (
        <p className="mt-3 text-fg-muted text-sm">
          This file carries no location, device, date, author or software tags that this tool can
          read. Removing metadata still writes a copy without any container tags.
        </p>
      ) : (
        <>
          <p className="mt-1 text-fg-muted text-sm">
            {sensitive
              ? "Every line below is removed."
              : "Nothing here says where, when or on what it was filmed. Every line below is removed."}
          </p>
          <TagList lines={lines} other={other} testId="metadata-found" />
        </>
      )}
      {phase === "processing" && (
        <p className="mt-3 text-fg-muted text-sm" aria-live="polite">
          Writing the clean copy
        </p>
      )}
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section
      aria-label="Metadata"
      className="rounded-lg border border-border bg-bg p-4 md:min-h-64 md:p-6"
    >
      {children}
    </section>
  );
}

function TagList({ lines, other, testId }: { lines: TagLine[]; other: number; testId: string }) {
  return (
    <ul
      data-testid={testId}
      className="mt-4 flex flex-col divide-y divide-border rounded-md border border-border text-sm"
    >
      {lines.map((l) => (
        <li
          key={l.label}
          className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2"
        >
          <span className={cn(l.sensitive && "font-medium")}>{l.label}</span>
          {l.value && <span className="tabular min-w-0 break-words text-fg-muted">{l.value}</span>}
        </li>
      ))}
      {other > 0 && (
        <li className="flex min-h-11 items-center px-3 py-2 text-fg-muted">
          {other === 1 ? "One other tag" : `${other} other tags`}
        </li>
      )}
    </ul>
  );
}

/** "30 Sep 2026, 19:52" in the reader's locale. */
const formatStamp = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/** Reads a file with the media inspector in its own short-lived worker (the done state's copy). */
function useInspected(file: File | undefined): {
  status: "idle" | "reading" | "done" | "failed";
  info?: MediaInfo;
} {
  const [state, setState] = useState<{
    status: "idle" | "reading" | "done" | "failed";
    info?: MediaInfo;
  }>({ status: "idle" });
  useEffect(() => {
    if (!file) return;
    let live = true;
    setState({ status: "reading" });
    let dispose: (() => void) | undefined;
    void (async () => {
      try {
        const { EngineClient } = await import("@/tools/workers/client");
        const client = new EngineClient();
        dispose = () => client.dispose();
        const info = await client.inspect(file);
        if (live) setState({ status: "done", info });
      } catch {
        if (live) setState({ status: "failed" });
      } finally {
        dispose?.();
      }
    })();
    return () => {
      live = false;
      dispose?.();
    };
  }, [file]);
  return state;
}
