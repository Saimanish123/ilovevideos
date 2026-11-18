"use client";

import { useEffect, useRef, useState } from "react";
import { formatBytes } from "@/lib/format";
import { setHandoffFiles } from "@/lib/handoff";
import { Link, useRouter } from "@/lib/i18n/navigation";

export type ShareKind = "video" | "audio" | "gif" | "image" | "subtitle";
interface Choice {
  slug: string;
  title: string;
  subtitle: string;
}
export type ShareGroups = Record<ShareKind, { one: Choice[]; several: Choice[] }>;

const SUBTITLE = /\.(srt|vtt|ass|ssa|sbv)$/i;
const VIDEO_EXT = /\.(mkv|m2ts|mts|ts|mov|mp4|webm|avi|wmv|flv|3gp|m4v|mpg|mpeg|vob|ogv)$/i;
const AUDIO_EXT = /\.(mp3|m4a|aac|wav|flac|ogg|opus|aiff?|wma)$/i;

/** What kind of file this is, from its type and, where the share sent none, its name. */
export function kindOf(file: { name: string; type: string }): ShareKind | undefined {
  const t = file.type.toLowerCase();
  if (t === "image/gif" || /\.gif$/i.test(file.name)) return "gif";
  if (t.startsWith("video/") || VIDEO_EXT.test(file.name)) return "video";
  if (t.startsWith("audio/") || AUDIO_EXT.test(file.name)) return "audio";
  if (SUBTITLE.test(file.name) || t === "text/vtt" || t === "application/x-subrip")
    return "subtitle";
  if (t.startsWith("image/")) return "image";
  return undefined;
}

const nouns: Record<ShareKind, [string, string]> = {
  video: ["video", "videos"],
  audio: ["audio file", "audio files"],
  gif: ["GIF", "GIFs"],
  image: ["picture", "pictures"],
  subtitle: ["subtitle file", "subtitle files"],
};

/** "a-very-long-holiday-video-from-the-beach-2026.mp4" → "a-very-long-holiday-vid…2026.mp4". */
export function middleTruncate(name: string, max = 40): string {
  if (name.length <= max) return name;
  const tail = Math.min(14, Math.floor(max / 3));
  return `${name.slice(0, max - tail - 1)}…${name.slice(-tail)}`;
}

/**
 * The tools for a shared file (cache `share-inbox`, filled by the service worker). The kind and
 * count come in the address the worker redirects to, so the list renders at first paint and only
 * the summary well (two lines, fixed height) waits for the files. Choosing a tool hands the files
 * on (lib/handoff) and opens it with them loaded; a choice made before they are read waits for
 * them. Files of another kind than the first are left out and named.
 */
export function ShareChooser({
  groups,
  kind: given,
  count = 1,
}: {
  groups: ShareGroups;
  /** From the worker's redirect; absent when the page is opened by hand. */
  kind?: ShareKind;
  count?: number;
}) {
  const [files, setFiles] = useState<File[]>();
  const router = useRouter();
  const waiting = useRef<string | null>(null);
  useEffect(() => {
    void (async () => {
      let read: File[] = [];
      try {
        const inbox = await caches.open("share-inbox");
        const keys = await inbox.keys();
        for (const key of [...keys].sort((a, b) =>
          a.url.localeCompare(b.url, "en", { numeric: true }),
        )) {
          const r = await inbox.match(key);
          if (!r) continue;
          const name = decodeURIComponent(r.headers.get("X-File-Name") ?? "shared");
          const blob = await r.blob();
          read.push(new File([blob], name, { type: r.headers.get("Content-Type") ?? blob.type }));
        }
        // Read once: the shared copies are not kept on the device after this page has them.
        await Promise.all(keys.map((k) => inbox.delete(k)));
      } catch {
        read = [];
      }
      setFiles(read);
    })();
  }, []);

  // The address's kind until the files are read, then theirs: an offline, cached /share can carry
  // an earlier share's kind.
  const kind = files ? files.map(kindOf).find(Boolean) : given;
  const usable = files && kind ? files.filter((f) => kindOf(f) === kind) : [];

  // A tool chosen before the files were read: hand them on as soon as they are.
  useEffect(() => {
    const slug = waiting.current;
    if (!slug || !files || usable.length === 0) return;
    waiting.current = null;
    setHandoffFiles(usable);
    router.push(`/${slug}`);
  }, [files, usable, router]);

  if (files && files.length === 0)
    return (
      <p className="text-body">
        Nothing was received. Share the file again, or{" "}
        <Link href="/" className="underline decoration-1 underline-offset-3">
          open a tool
        </Link>{" "}
        and choose it there.
      </p>
    );
  if (!kind)
    return files ? (
      <p className="text-body">
        The tools here do not open{" "}
        {files.length === 1 ? "this kind of file" : "these kinds of file"}.{" "}
        <span className="text-fg-muted">
          They open videos, audio files, GIFs, pictures and subtitle files.
        </span>
      </p>
    ) : (
      <p className="text-fg-muted text-sm" aria-live="polite">
        Reading the shared file
      </p>
    );

  const several = files ? usable.length > 1 : count > 1;
  const choices = several ? groups[kind].several : groups[kind].one;
  const left = files ? files.length - usable.length : 0;
  const total = usable.reduce((n, f) => n + f.size, 0);

  return (
    <div className="flex flex-col gap-6">
      {/* Two lines at a fixed height, filled once the files are read. */}
      <div className="flex h-18 flex-col justify-center rounded-md bg-bg-subtle px-4 text-sm">
        <p className="truncate font-medium" title={several ? undefined : usable[0]?.name}>
          {!files
            ? several
              ? `${count} ${nouns[kind][1]}`
              : `1 ${nouns[kind][0]}`
            : several
              ? `${usable.length} ${nouns[kind][1]}`
              : middleTruncate(usable[0]?.name ?? "")}
        </p>
        <p className="tabular mt-1 text-fg-muted" aria-live="polite">
          {files
            ? `${formatBytes(total)}${left > 0 ? ` · ${left} other ${left === 1 ? "file" : "files"} left out` : ""}`
            : "Reading"}
        </p>
      </div>
      <ul aria-label="Tools for this file" className="grid gap-3 md:grid-cols-2">
        {choices.map((c) => (
          <li key={c.slug}>
            <Link
              href={`/${c.slug}`}
              onClick={(e) => {
                if (files) {
                  setHandoffFiles(usable);
                  return;
                }
                e.preventDefault();
                waiting.current = c.slug;
              }}
              className="flex min-h-11 flex-col rounded-lg border border-border bg-bg-raised p-4 transition-colors duration-(--duration-instant) hover:border-border-strong focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
            >
              <span className="font-medium text-body">{c.title}</span>
              <span className="mt-1 text-fg-muted text-sm">{c.subtitle}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
