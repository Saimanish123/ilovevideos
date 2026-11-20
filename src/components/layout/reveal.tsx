"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** A key that moves through history (⌘[ ⌘] ⌘← ⌘→, Alt+← Alt+→, Backspace where a browser still uses it). */
function historyKey(e: KeyboardEvent): boolean {
  if (e.metaKey && ["[", "]", "ArrowLeft", "ArrowRight"].includes(e.key)) return true;
  if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) return true;
  if (e.key !== "Backspace") return false;
  const t = e.target as HTMLElement | null;
  return !t?.closest?.("input, textarea, select, [contenteditable]");
}

/**
 * Set by back or forward, read by the next run: the page it lands on was seen before, so nothing hides.
 * Listened for once, in the capture phase: the router commits a back navigation inside its own
 * popstate listener, so this must hear the event first.
 */
let traversed = false;
if (typeof window !== "undefined")
  window.addEventListener(
    "popstate",
    () => {
      traversed = true;
    },
    true,
  );

/**
 * Reveal once (ADR-0153, ADR-0157): the one IntersectionObserver behind every `data-reveal` block on
 * the page (styles in globals.css). Run after each navigation. Only a block that starts wholly below
 * the viewport is hidden (`data-unseen`), so nothing already on screen, scrolled past, or reached
 * through a link to its anchor ever blinks out. The first time a block enters the viewport it shows,
 * and the observer forgets it: never again on scrolling back. If the keyboard brought it into view
 * (Tab, Page Down, Enter on an anchor) it shows at once, without motion. Back and forward hide
 * nothing: the scroll position is restored after this runs, so a measure taken now could hide a block
 * that ends up on screen.
 *
 * The same listeners mark a navigation started from the keyboard (Enter, Space or a history key) with
 * `data-keyed` on <html>, so its view transition and the new page's entrance are skipped (ADR-0158);
 * a pointer press clears it.
 */
export function Reveal() {
  const path = usePathname();
  useEffect(() => {
    let keyAt = -1e4;
    const root = document.documentElement;
    const onKey = (e: KeyboardEvent) => {
      keyAt = performance.now();
      const history = historyKey(e);
      // Back or forward to a page only within it (a hash) must not carry over to the next navigation.
      if (!history) traversed = false;
      if (e.key === "Enter" || e.key === " " || history) root.setAttribute("data-keyed", "");
    };
    const onPress = () => {
      root.removeAttribute("data-keyed");
      traversed = false;
    };
    const show = (el: Element) => {
      if (performance.now() - keyAt < 1000) el.setAttribute("data-reveal-now", "");
      el.removeAttribute("data-unseen");
      seen.unobserve(el);
    };
    const seen = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) show(e.target);
    });
    const onFocus = (e: FocusEvent) => {
      const el = (e.target as Element | null)?.closest?.("[data-unseen]");
      if (el) {
        keyAt = performance.now();
        show(el);
      }
    };
    if (traversed) traversed = false;
    else {
      const fold = window.innerHeight;
      for (const el of document.querySelectorAll("[data-reveal]:not([data-unseen])")) {
        if (el.getBoundingClientRect().top < fold) continue;
        el.setAttribute("data-unseen", "");
        seen.observe(el);
      }
    }
    addEventListener("keydown", onKey, true);
    addEventListener("pointerdown", onPress, true);
    addEventListener("focusin", onFocus);
    return () => {
      seen.disconnect();
      removeEventListener("keydown", onKey, true);
      removeEventListener("pointerdown", onPress, true);
      removeEventListener("focusin", onFocus);
      for (const el of document.querySelectorAll("[data-unseen]"))
        el.removeAttribute("data-unseen");
    };
  }, [path]);
  return null;
}
