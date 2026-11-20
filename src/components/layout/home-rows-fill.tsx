"use client";

import { useLayoutEffect } from "react";
import { fillHomeRows } from "@/lib/recent-tools";

/**
 * On a client-side visit to home no inline script runs, so the personal rows are filled here,
 * before paint (ADR-0155). On a full page load the inline script has filled them
 * already and this does nothing.
 */
export function HomeRowsFill() {
  useLayoutEffect(() => {
    if (document.getElementById("row-continue-list")?.childElementCount) return;
    try {
      const tools = document.getElementById("tools");
      fillHomeRows(document, window.localStorage, JSON.parse(tools?.dataset.related ?? "[]"));
    } catch {
      // Storage blocked: the editorial page stays.
    }
  }, []);
  return null;
}
