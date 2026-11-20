"use client";

import { type ComponentType, useCallback, useEffect, useRef, useState } from "react";
import type { KeptResult } from "@/lib/storage/kept-results";
import { anyKeptListed, keptListedFor } from "@/lib/storage/keys";

type PanelProps = { kept: KeptResult; onDismiss: () => void };
const loadStore = () => import("@/lib/storage/kept-results");

/**
 * A page's last result across a reload (ADR-0131). On mount, one synchronous read of the local
 * index; only when it lists something do the store and its panel load (never on a first visit).
 * `keep` copies a finished result in the background; `forget` removes it (Start over).
 * `pending`: the index lists one for this page and it is still loading, so the drop zone keeps the
 * room the page's inline script reserved before first paint.
 */
export function useKeptResult(slug: string, enabled: boolean) {
  const [kept, setKept] = useState<{ result: KeptResult; Panel: ComponentType<PanelProps> }>();
  // Once anything was kept or listed, Start over has something to remove.
  const touched = useRef(false);
  // Read on the client's first render (never rendered into markup, so no hydration difference).
  const [pending, setPending] = useState(
    () => enabled && typeof window !== "undefined" && keptListedFor(slug),
  );

  useEffect(() => {
    if (!enabled || !anyKeptListed()) return;
    touched.current = true;
    let live = true;
    void Promise.all([loadStore(), import("./kept-result")])
      .then(async ([store, ui]) => {
        await store.sweepExpired();
        const result = await store.loadKeptResult(slug);
        if (live && result) setKept({ result, Panel: ui.KeptResultPanel });
      })
      .catch(() => undefined)
      .finally(() => {
        if (live) setPending(false);
      });
    return () => {
      live = false;
    };
  }, [slug, enabled]);

  const keep = useCallback(
    (files: { blob: Blob; name: string }[], zipName?: string) => {
      if (!enabled) return;
      touched.current = true;
      void loadStore()
        .then((store) => store.keepResult(slug, files, zipName))
        .catch(() => undefined);
    },
    [slug, enabled],
  );

  const forget = useCallback(() => {
    setKept(undefined);
    setPending(false);
    if (!touched.current) return;
    void loadStore()
      .then((store) => {
        store.cancelKeep(slug);
        return store.forgetResult(slug);
      })
      .catch(() => undefined);
  }, [slug]);

  return { kept, keep, forget, pending };
}
