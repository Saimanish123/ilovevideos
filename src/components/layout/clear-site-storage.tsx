"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions, DialogContent } from "@/components/ui/dialog";
import { formatBytes } from "@/lib/format";
import { clearRecent } from "@/lib/recent-tools";
import { type Inventory, listWords, measureSiteStorage } from "@/lib/storage/inventory";
import { clearLocal } from "@/lib/storage/local";
import { clearOpfs } from "@/lib/storage/opfs";

const PHRASE = "Clear what this site stored";

/**
 * /privacy's clear control (ADR-0131), right under "What this browser keeps". Before: what is kept
 * and how much, measured from the storage itself. Clear (asked first) removes local storage, the
 * private file storage (a file another open tab is writing stays) and Cache Storage, then says what
 * was removed. The browser's own estimate is not shown: it lags behind what was removed.
 */
export function ClearSiteStorage() {
  const headingId = useId();
  const [kept, setKept] = useState<Inventory>();
  const [removed, setRemoved] = useState<Inventory>();
  const [clearing, setClearing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const buttonId = useId();
  const measure = useCallback(() => measureSiteStorage().then(setKept), []);
  useEffect(() => {
    void measure();
  }, [measure]);

  const clear = async () => {
    setConfirm(false);
    setClearing(true);
    const before = await measureSiteStorage();
    clearRecent();
    clearLocal();
    try {
      window.sessionStorage.clear();
    } catch {
      // Blocked: nothing there.
    }
    await clearOpfs();
    try {
      for (const key of await caches.keys()) await caches.delete(key);
    } catch {
      // No Cache Storage here.
    }
    setRemoved(before);
    setClearing(false);
    await measure();
    document.getElementById(buttonId)?.focus();
  };

  const empty = kept !== undefined && kept.parts.length === 0;
  const line = clearing
    ? "Clearing"
    : removed
      ? removed.parts.length
        ? `Removed ${formatBytes(removed.bytes)}: ${listWords(removed.parts)}.`
        : "There was nothing to remove."
      : kept === undefined
        ? ""
        : empty
          ? "This site keeps nothing in this browser."
          : `This site keeps ${formatBytes(kept.bytes)} here: ${listWords(kept.parts)}.`;

  return (
    <section className="mt-12" aria-labelledby={headingId}>
      <h2 id={headingId} className="text-h2">
        {PHRASE}
      </h2>
      <p className="tabular mt-4 min-h-6 text-body text-fg-muted" role="status" aria-live="polite">
        {line}
      </p>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <Button
          id={buttonId}
          variant="destructive"
          size="md"
          className="mt-4"
          disabled={clearing || (empty && !removed)}
          onClick={() => {
            // Measured again now, so "keeps" and "Removed" come from the same moment.
            void measure();
            setConfirm(true);
          }}
        >
          {PHRASE}
        </Button>
        <DialogContent
          title={`${PHRASE}?`}
          description="Recent tools, settings, kept results, interrupted recordings and the offline copy of the site are removed from this browser."
          showClose={false}
        >
          <DialogActions>
            <Button variant="secondary" size="md" onClick={() => setConfirm(false)}>
              Keep it
            </Button>
            <Button variant="destructive" size="md" onClick={() => void clear()}>
              Clear
            </Button>
          </DialogActions>
        </DialogContent>
      </Dialog>
    </section>
  );
}
