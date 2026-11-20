"use client";

import { Autocomplete } from "@base-ui/react/autocomplete";
import { Dialog } from "@base-ui/react/dialog";
import { Search } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { discovery } from "@/content/site/discovery";
import { usePathname, useRouter } from "@/lib/i18n/navigation";
import { pairSourcesOf } from "@/lib/pair-sources";
import { type RecentTool, readRecent } from "@/lib/recent-tools";
import { reportSearchMiss, SETTLE_MS } from "@/lib/search-miss";
import {
  type SearchGroup,
  type SearchPayload,
  searchTools,
  type ToolIndexEntry,
} from "@/lib/tool-search";
import { useMediaQuery } from "@/lib/use-media-query";

// "Not sure which tool?" inside search: the reader loads only once a file is chosen (ADR-0125).
const FileSuggest = lazy(() => import("./file-suggest").then((m) => ({ default: m.FileSuggest })));

let indexRequest: Promise<SearchPayload> | undefined;

/**
 * The search index, fetched once per page load from this origin (`app/tool-index.json`, a static
 * file) and kept in memory. A failed request is forgotten so Try again asks again. The query is
 * matched on this device; it is not part of this request (a search that fails is counted separately,
 * below). An older index (a bare list, from a cached response) still works, without task groups.
 */
export function loadToolIndex(): Promise<SearchPayload> {
  indexRequest ??= fetch("/tool-index.json")
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<SearchPayload | ToolIndexEntry[]>;
    })
    .then((p) => (Array.isArray(p) ? { tools: p, groups: [] } : p))
    .catch((e) => {
      indexRequest = undefined;
      throw e;
    });
  return indexRequest;
}

/** One row of the list: a tool, a recent tool or a task group (a hub). */
interface Row {
  key: string;
  label: string;
  href: string;
  /** Shown at the end of the row on wide screens ("Convert"). */
  meta?: string;
}
interface RowGroup {
  value: string;
  items: Row[];
}

/** Results at once: Baymard's ~10 on desktop, fewer on phones; the list never scrolls. */
const LIMIT_WIDE = 8;
const LIMIT_PHONE = 6;
/** Three recents keep the empty state (recents, tasks, the file line) inside a 900px window. */
const RECENT_SHOWN = 3;

const toolRow = (e: ToolIndexEntry): Row => ({
  key: e.slug,
  label: e.title,
  href: `/${e.slug}`,
  meta: e.category,
});
const recentRow = (r: RecentTool): Row => ({
  key: `recent:${r.slug}`,
  label: r.title,
  href: `/${r.slug}`,
});
const groupRow = (g: SearchGroup): Row => ({ key: `task:${g.id}`, label: g.label, href: g.href });

/**
 * Motion for a pointer opening only (data-from). Desktop: opacity and scale 0.97 → 1 out of the point
 * pressed, fast, ease-out; leaves at the instant duration. Phones: the full-screen sheet slides up at
 * the slow duration on the drawer curve and back down at fast. With reduced motion the global rule
 * keeps the desktop fade and drops the movement.
 */
const popupMotion =
  "data-from:transition-[opacity,scale,translate] data-from:duration-(--duration-fast) data-from:ease-(--ease-out) sm:data-from:data-starting-style:scale-97 sm:data-from:data-starting-style:opacity-0 sm:data-from:data-ending-style:opacity-0 sm:data-from:data-ending-style:duration-(--duration-instant) max-sm:data-from:duration-(--duration-slow) max-sm:data-from:ease-(--ease-drawer) max-sm:data-from:data-starting-style:translate-y-full max-sm:data-from:data-ending-style:translate-y-full max-sm:data-from:data-ending-style:duration-(--duration-fast)";
const backdropMotion =
  "data-from:transition-opacity data-from:duration-(--duration-fast) data-from:ease-(--ease-out) data-from:data-starting-style:opacity-0 data-from:data-ending-style:opacity-0 data-from:data-ending-style:duration-(--duration-instant)";

/**
 * Search (feature catalog L4, design system §8.10, ADR-0123). A Base UI Dialog holding an inline
 * Base UI Autocomplete: the input keeps focus, arrow keys move the highlight, Enter opens the
 * highlighted row, Escape closes, focus is trapped while open and goes back where it was.
 *
 * - Desktop (from 640px): a palette near the top, up to 8 results.
 * - Phones: a full-screen sheet with a Cancel button, text-only 44px rows, up to 6 results.
 * - Nothing typed: this browser's recent tools (up to 5), then the tasks (one per hub).
 * - Nothing found: never a dead end; the tasks are listed under the message.
 *
 * Opened with ⌘K or Ctrl+K many times a day, so it does not animate then (design system §6.3). Opened
 * with a click or a tap (`from`, the point pressed; ADR-0157) it grows out of that point on desktop
 * and slides up as a sheet on phones, and leaves faster than it came. This module is loaded only when
 * search is first opened.
 */
export function CommandPalette({
  open,
  onOpenChange,
  initialQuery = "",
  seed,
  from,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What was typed while this module loaded on the first opening (command-palette-trigger). */
  initialQuery?: string;
  /** Opened from elsewhere on the page with text or files (the home hero); `at` marks each opening. */
  seed?: { query?: string; files?: File[]; at: number };
  /** Opened by a click or tap at this point (viewport px): animate out of it. From the keyboard: unset. */
  from?: { x: number; y: number };
}) {
  const router = useRouter();
  // The page search was opened on is not a recent to go to: Enter would only reload it.
  const here = usePathname().replace(/^\//, "");
  const phone = useMediaQuery("(max-width: 639px)");
  const [index, setIndex] = useState<SearchPayload>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState(initialQuery);
  const [recent, setRecent] = useState<RecentTool[]>([]);
  const [files, setFiles] = useState<File[]>();
  const popupRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Between ⌘K and the dialog moving focus into the field there is a frame or two; letters typed
  // then would land on the page and be lost. Catch them for the query and focus the field.
  useEffect(() => {
    if (!open) return;
    const early = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing || e.key.length !== 1) return;
      if (popupRef.current?.contains(document.activeElement)) return;
      e.preventDefault();
      e.stopPropagation();
      setQuery((q) => q + e.key);
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", early, true);
    return () => window.removeEventListener("keydown", early, true);
  }, [open]);
  const fileInput = useId();

  // A pointer opening grows the desktop palette out of the point pressed (the trigger). The popup
  // mounts on each opening, after this component's effects, so its ref sets the origin before paint.
  const fromRef = useRef(from);
  fromRef.current = from;
  // Closed from the keyboard (Escape, or Enter on a result), even after a pointer opening: it leaves
  // at once on desktop and on the phone sheet. The key is caught before the dialog acts on it, so the
  // motion classes are gone in the same commit that starts the exit.
  const [keyClosed, setKeyClosed] = useState(false);
  // Reset on each opening during render, so a reopening's first frame already has its motion.
  const [openSeen, setOpenSeen] = useState(open);
  if (open !== openSeen) {
    setOpenSeen(open);
    if (open) setKeyClosed(false);
  }
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") setKeyClosed(true);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);
  const animated = from !== undefined && !keyClosed;
  // On the first opening this module mounts already open, which has no starting state to animate
  // from: a pointer opening waits one commit so the sheet and palette can come in. Keys never wait.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const attachPopup = useCallback((popup: HTMLDivElement | null) => {
    popupRef.current = popup;
    const at = fromRef.current;
    if (!popup || !at) return;
    const box = popup.getBoundingClientRect();
    popup.style.transformOrigin = `${at.x - box.left}px ${at.y - box.top}px`;
  }, []);

  useEffect(() => {
    if (!open || index) return;
    let alive = true;
    setFailed(false);
    loadToolIndex().then(
      (i) => alive && setIndex(i),
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
    };
  }, [open, index, attempt]);

  // Opened with text or files from elsewhere (the hero): start from them.
  useEffect(() => {
    if (!seed) return;
    const start = seed.query;
    // Keep letters already added after it (typed while this module loaded).
    if (start) setQuery((q) => (q.startsWith(start) ? q : start));
    if (seed.files?.length) setFiles(seed.files);
  }, [seed]);

  // Each opening starts from an empty query and the recents as they are now.
  useEffect(() => {
    if (open)
      setRecent(
        readRecent()
          .filter((r) => r.slug !== here)
          .slice(0, RECENT_SHOWN),
      );
    else {
      setQuery("");
      setFiles(undefined);
    }
  }, [open, here]);

  const trimmed = query.trim();
  const groups = useMemo<RowGroup[]>(() => {
    if (!index || files) return [];
    const tasks = { value: discovery.browse, items: index.groups.map(groupRow) };
    if (!trimmed) {
      // Recents link to pages that still exist only.
      const known = new Set(index.tools.map((t) => t.slug));
      const mine = recent.filter((r) => known.has(r.slug)).map(recentRow);
      return [...(mine.length ? [{ value: discovery.recent, items: mine }] : []), tasks];
    }
    const found = searchTools(index.tools, trimmed, phone ? LIMIT_PHONE : LIMIT_WIDE).map(toolRow);
    return found.length ? [{ value: "Tools", items: found }] : [tasks];
  }, [index, trimmed, recent, phone, files]);
  const pairs = useMemo(() => pairSourcesOf((index?.tools ?? []).map((t) => t.slug)), [index]);
  const matched = !!trimmed && groups[0]?.value === "Tools";
  const count = matched ? (groups[0]?.items.length ?? 0) : 0;

  // A search that fails is counted (ADR-0152), so the intent table can learn it: one beacon when
  // the query has listed nothing for SETTLE_MS, or when search closes or the page goes away without
  // a tool opened. Each query once per session; file suggestions are not searches and send nothing.
  const opened = useRef(false);
  const pending = useRef<{ q: string; n: number }>(undefined);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (!open) return;
    pending.current = index && trimmed && !files ? { q: trimmed, n: count } : undefined;
  }, [open, index, trimmed, files, count]);
  useEffect(() => {
    if (!open || !index || !trimmed || files || matched) return;
    const t = window.setTimeout(() => reportSearchMiss(trimmed, 0), SETTLE_MS);
    return () => window.clearTimeout(t);
  }, [open, index, trimmed, files, matched]);
  useEffect(() => {
    const leave = () => {
      const p = pending.current;
      if (p && !opened.current) reportSearchMiss(p.q, p.n);
      pending.current = undefined;
    };
    if (open) {
      wasOpen.current = true;
      opened.current = false;
      window.addEventListener("pagehide", leave);
      return () => window.removeEventListener("pagehide", leave);
    }
    if (wasOpen.current) leave();
    wasOpen.current = false;
  }, [open]);

  const go = (row: Row) => {
    // A tool from the results was opened: not a miss. A task row after no match still is.
    if (matched) opened.current = true;
    onOpenChange(false);
    router.push(row.href);
  };

  return (
    <Dialog.Root open={open && (mounted || !from)} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop
          data-from={animated ? "" : undefined}
          className={`fixed inset-0 z-50 min-h-dvh bg-overlay max-sm:hidden supports-[-webkit-touch-callout:none]:absolute ${backdropMotion}`}
        />
        <Dialog.Popup
          ref={attachPopup}
          initialFocus={inputRef}
          data-from={animated ? "" : undefined}
          className={`fixed inset-0 z-50 flex flex-col overflow-hidden bg-bg-raised text-fg outline-none sm:inset-x-4 sm:top-24 sm:bottom-auto sm:mx-auto sm:max-h-(--container-palette-max-h) sm:max-w-xl sm:rounded-lg sm:shadow-2 ${popupMotion}`}
        >
          <Dialog.Title className="sr-only">{discovery.searchLabel}</Dialog.Title>
          <Autocomplete.Root
            inline
            open
            items={groups}
            filter={null}
            value={query}
            onValueChange={(v) => {
              setQuery(v);
              setFiles(undefined);
            }}
            itemToStringValue={(r: Row) => r.label}
            autoHighlight="always"
            keepHighlight
          >
            <div className="flex items-center gap-3 border-border border-b pl-4 sm:px-4">
              <Search size={20} strokeWidth={1.5} aria-hidden className="shrink-0 text-fg-muted" />
              <Autocomplete.Input
                ref={inputRef}
                aria-label={discovery.searchLabel}
                placeholder={phone ? discovery.placeholderShort : discovery.placeholder}
                enterKeyHint="go"
                className="h-14 min-w-0 flex-1 bg-transparent text-body text-fg outline-none placeholder:text-fg-muted"
              />
              {/* Phones: the sheet covers the page, so it needs a visible way back. */}
              <Dialog.Close
                className={buttonVariants({
                  variant: "ghost",
                  size: "md",
                  className: "mr-2 shrink-0 sm:hidden",
                })}
              >
                Cancel
              </Dialog.Close>
            </div>

            <Autocomplete.Status className="sr-only">
              {!index
                ? failed
                  ? "The tool list could not be loaded."
                  : "Loading the tool list"
                : !trimmed
                  ? ""
                  : count === 0
                    ? "No tool matches. Tasks are listed instead."
                    : `${count} ${count === 1 ? "tool" : "tools"}`}
            </Autocomplete.Status>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
              {!index &&
                !files &&
                (failed ? (
                  <div className="flex flex-col items-start gap-3 px-3 py-4 text-sm">
                    <p>The tool list could not be loaded. Check the connection, then try again.</p>
                    <Button variant="secondary" size="md" onClick={() => setAttempt((a) => a + 1)}>
                      Try again
                    </Button>
                  </div>
                ) : (
                  <p className="px-3 py-4 text-fg-muted text-sm">Loading the tool list</p>
                ))}
              {index && trimmed && !matched && (
                <div className="px-3 pt-2 pb-3 text-sm">
                  <p>{discovery.noMatch(trimmed)}</p>
                  <p className="mt-1 text-fg-muted">{discovery.noMatchHint}</p>
                </div>
              )}
              <Autocomplete.List aria-label={matched ? "Matching tools" : discovery.browse}>
                {(group: RowGroup) => (
                  <Autocomplete.Group key={group.value} items={group.items} className="pb-2">
                    <Autocomplete.GroupLabel
                      className={
                        group.value === "Tools"
                          ? "sr-only"
                          : "px-3 pt-2 pb-1 font-medium text-fg-muted text-xs"
                      }
                    >
                      {group.value}
                    </Autocomplete.GroupLabel>
                    <Autocomplete.Collection>
                      {(row: Row) => (
                        <Autocomplete.Item
                          key={row.key}
                          value={row}
                          onClick={() => go(row)}
                          className="flex min-h-11 cursor-default select-none items-center justify-between gap-4 rounded-md px-3 text-sm data-highlighted:bg-bg-subtle"
                        >
                          <span className="min-w-0 truncate font-medium">{row.label}</span>
                          {row.meta && (
                            <span className="shrink-0 text-fg-muted text-xs max-sm:hidden">
                              {row.meta}
                            </span>
                          )}
                        </Autocomplete.Item>
                      )}
                    </Autocomplete.Collection>
                  </Autocomplete.Group>
                )}
              </Autocomplete.List>
              {(files || (index && !trimmed)) && (
                <div className="px-3 pt-2 pb-2">
                  {files ? (
                    // The way back first, so the suggestions arriving below it move nothing.
                    <>
                      <Button
                        variant="ghost"
                        size="md"
                        onClick={() => setFiles(undefined)}
                        className="-ml-4"
                      >
                        {discovery.backToSearch}
                      </Button>
                      {index ? (
                        <Suspense
                          fallback={
                            <p className="pt-2 text-fg-muted text-sm">{discovery.fileReading}</p>
                          }
                        >
                          <FileSuggest
                            files={files}
                            pairs={pairs}
                            onNavigate={() => onOpenChange(false)}
                            className="pt-2"
                          />
                        </Suspense>
                      ) : (
                        <p className="pt-2 text-fg-muted text-sm">{discovery.fileReading}</p>
                      )}
                    </>
                  ) : (
                    <p className="flex flex-wrap items-center gap-x-2 border-border border-t pt-2 text-fg-muted text-sm">
                      {discovery.fileTitle}
                      <label
                        htmlFor={fileInput}
                        className="inline-flex min-h-11 cursor-pointer items-center rounded-sm font-medium text-fg underline decoration-1 underline-offset-3 has-focus-visible:outline-2 has-focus-visible:outline-ring has-focus-visible:outline-offset-2"
                      >
                        {discovery.fileChoose}
                        <input
                          id={fileInput}
                          type="file"
                          multiple
                          className="sr-only"
                          onChange={(e) => {
                            const picked = Array.from(e.currentTarget.files ?? []);
                            if (picked.length) setFiles(picked);
                            e.currentTarget.value = "";
                          }}
                        />
                      </label>
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Keys only mean something with a keyboard and a list: touch screens and the file
                suggestions (plain links) go without. */}
            <div
              hidden={!!files}
              className="flex items-center gap-4 border-border border-t px-4 py-2 text-fg-muted text-xs pointer-coarse:hidden max-sm:hidden"
            >
              <span className="flex items-center gap-1">
                <Key>↑</Key>
                <Key>↓</Key> to move
              </span>
              <span className="flex items-center gap-1">
                <Key>Enter</Key> to open
              </span>
              <span className="flex items-center gap-1">
                <Key>Esc</Key> to close
              </span>
            </div>
          </Autocomplete.Root>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Key({ children }: { children: string }) {
  return (
    <kbd className="inline-flex min-w-5 items-center justify-center rounded-sm border border-border bg-bg-subtle px-1 font-mono text-fg text-xs">
      {children}
    </kbd>
  );
}
