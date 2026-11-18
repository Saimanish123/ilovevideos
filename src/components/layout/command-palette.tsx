"use client";

import { Autocomplete } from "@base-ui/react/autocomplete";
import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useRouter } from "@/lib/i18n/navigation";
import { searchTools, type ToolIndexEntry } from "@/lib/tool-search";

let indexRequest: Promise<ToolIndexEntry[]> | undefined;

/**
 * The search index, fetched once per page load from this origin (`app/tool-index.json`, a static
 * file) and kept in memory. A failed request is forgotten so Try again asks again. The query is
 * matched on this device; it is never part of any request.
 */
export function loadToolIndex(): Promise<ToolIndexEntry[]> {
  indexRequest ??= fetch("/tool-index.json")
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<ToolIndexEntry[]>;
    })
    .catch((e) => {
      indexRequest = undefined;
      throw e;
    });
  return indexRequest;
}

/**
 * Command palette over every tool (feature catalog L4, design system §8.10). A Base UI Dialog holding
 * an inline Base UI Autocomplete: the input keeps focus, arrow keys move the highlight, Enter opens
 * the highlighted tool, Escape closes, focus is trapped while open and goes back where it was.
 * Opened with ⌘K or Ctrl+K hundreds of times a day, so it does not animate (design system §6.3).
 * This module is loaded only when the palette is first opened.
 */
export function CommandPalette({
  open,
  onOpenChange,
  initialQuery = "",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What was typed while this module loaded on the first opening (command-palette-trigger). */
  initialQuery?: string;
}) {
  const router = useRouter();
  const [index, setIndex] = useState<ToolIndexEntry[]>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState(initialQuery);

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

  // Each opening starts from an empty query.
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  // A typed query shows at most 8 matches (Baymard: about 10 on desktop, fewer on phones), so the
  // list never scrolls; the empty query still lists every tool until the discovery redesign.
  const results = useMemo(() => (index ? searchTools(index, query, 8) : []), [index, query]);
  const trimmed = query.trim();

  const go = (entry: ToolIndexEntry) => {
    onOpenChange(false);
    router.push(`/${entry.slug}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Search tools" hideTitle instant placement="top" className="max-w-xl">
        <Autocomplete.Root
          inline
          open
          items={results}
          filter={null}
          value={query}
          onValueChange={(v) => setQuery(v)}
          itemToStringValue={(e: ToolIndexEntry) => e.title}
          autoHighlight="always"
          keepHighlight
        >
          <div className="flex items-center gap-3 border-border border-b px-4">
            <Search size={20} strokeWidth={1.5} aria-hidden className="shrink-0 text-fg-muted" />
            <Autocomplete.Input
              aria-label="Search tools"
              placeholder="Search tools, formats or jobs"
              className="h-14 min-w-0 flex-1 bg-transparent text-body text-fg outline-none placeholder:text-fg-muted"
            />
          </div>

          <Autocomplete.Status className="sr-only">
            {!index
              ? failed
                ? "The tool list could not be loaded."
                : "Loading the tool list"
              : results.length === 0
                ? "No tool matches."
                : `${results.length} ${results.length === 1 ? "tool" : "tools"}`}
          </Autocomplete.Status>

          <div className="max-h-96 min-h-0 overflow-y-auto overscroll-contain p-2">
            {!index &&
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
            {index && (
              <Autocomplete.Empty className="px-3 py-4 text-sm empty:hidden">
                {`No tool matches “${trimmed}”. Try a format, such as MP4, or a job, such as compress.`}
              </Autocomplete.Empty>
            )}
            <Autocomplete.List aria-label={trimmed ? "Matching tools" : "All tools"}>
              {(entry: ToolIndexEntry) => (
                <Autocomplete.Item
                  key={entry.slug}
                  value={entry}
                  onClick={() => go(entry)}
                  className="flex min-h-11 cursor-default select-none items-center justify-between gap-4 rounded-md px-3 text-sm data-highlighted:bg-bg-subtle"
                >
                  <span className="min-w-0 truncate font-medium">{entry.title}</span>
                  <span className="shrink-0 text-fg-muted text-xs">{entry.category}</span>
                </Autocomplete.Item>
              )}
            </Autocomplete.List>
          </div>

          {/* Keys only mean something with a keyboard; touch screens get the list alone. */}
          <div className="flex items-center gap-4 border-border border-t px-4 py-2 text-fg-muted text-xs pointer-coarse:hidden">
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
      </DialogContent>
    </Dialog>
  );
}

function Key({ children }: { children: string }) {
  return (
    <kbd className="inline-flex min-w-5 items-center justify-center rounded-sm border border-border bg-bg-subtle px-1 font-mono text-fg text-xs">
      {children}
    </kbd>
  );
}
