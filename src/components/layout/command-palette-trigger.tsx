"use client";

import { Search } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { OPEN_SEARCH_EVENT, type OpenSearchDetail } from "@/lib/open-search";
import { OPEN_SHORTCUTS_EVENT } from "@/lib/page-shortcuts";

const loadPalette = () => import("./command-palette");
const CommandPalette = lazy(() => loadPalette().then((m) => ({ default: m.CommandPalette })));
const ShortcutsDialog = lazy(() =>
  import("./shortcuts-dialog").then((m) => ({ default: m.ShortcutsDialog })),
);

/** A key typed into a field belongs to the field: "/" and "?" are text there. */
function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.tagName === "TEXTAREA" || target.tagName === "SELECT") return true;
  if (target.tagName !== "INPUT") return false;
  const type = (target as HTMLInputElement).type;
  return !["checkbox", "radio", "button", "submit", "reset", "file", "range"].includes(type);
}

/**
 * The header's search button and the ⌘K / Ctrl+K shortcut (feature catalog L4). Only this button
 * ships with the page: the palette's code and the tool index load the first time it opens (or when
 * the pointer or focus reaches the button, so a click opens without a wait).
 *
 * ⌘K from the keyboard gives no such head start, and the first load takes a moment. Until the palette
 * is there, keys typed are held here: they become its starting query instead of being lost, and they
 * do not reach the page underneath (a tool's own shortcuts, such as R to rotate).
 *
 * The other site-wide keys live here too: "/" opens the palette (as on most sites with search), "?"
 * opens the list of every shortcut and gesture (also from the footer link). Neither acts while a
 * field has focus or a dialog is open.
 */
export function CommandPaletteTrigger() {
  const [open, setOpen] = useState(false);
  // The palette is mounted from the first opening on, so it keeps its index and restores focus.
  const [wanted, setWanted] = useState(false);
  // What another part of the page opened search with (the home hero): text or files.
  const [seed, setSeed] = useState<OpenSearchDetail & { at: number }>();
  const [mac, setMac] = useState<boolean>();
  const [loaded, setLoaded] = useState(false);
  const [help, setHelp] = useState(false);
  const [helpWanted, setHelpWanted] = useState(false);
  const typed = useRef("");
  // Where the pointer last went down: an opening within a second of it came from a click or a tap, and
  // only those animate, out of that point (ADR-0157). ⌘K, "/" and typing open at once (design system §6.3).
  const press = useRef({ at: -1e4, x: 0, y: 0 });
  const [from, setFrom] = useState<{ x: number; y: number }>();
  const opened = useCallback(() => {
    const p = press.current;
    setFrom(performance.now() - p.at < 1000 ? { x: p.x, y: p.y } : undefined);
  }, []);

  useEffect(() => {
    if (wanted && !loaded) void loadPalette().then(() => setLoaded(true));
  }, [wanted, loaded]);

  // Closed before it loaded: nothing typed carries over to the next opening.
  useEffect(() => {
    if (!open && !loaded) typed.current = "";
  }, [open, loaded]);

  // Opened and still loading: hold printable keys, Backspace and Escape for the palette.
  useEffect(() => {
    if (!open || loaded) return;
    const hold = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // The palette is up and has focus: its own input takes the keys from here.
      if (document.activeElement?.closest('[role="dialog"]')) return;
      if (e.key === "Escape") {
        typed.current = "";
        setOpen(false);
      } else if (e.key === "Backspace") typed.current = typed.current.slice(0, -1);
      else if (e.key.length === 1) typed.current += e.key;
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", hold, true);
    return () => window.removeEventListener("keydown", hold, true);
  }, [open, loaded]);

  const prefetch = useCallback(() => {
    void loadPalette().then((m) => m.loadToolIndex().catch(() => undefined));
  }, []);

  useEffect(() => {
    const platform =
      (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
        ?.platform ?? navigator.platform;
    setMac(/mac|iphone|ipad/i.test(platform));
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && !e.altKey && !e.shiftKey && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setFrom(undefined);
        setWanted(true);
        setOpen((o) => !o);
        return;
      }
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
      if (typing(e.target) || document.querySelector('[role="dialog"]')) return;
      if (e.key === "/") {
        e.preventDefault();
        setFrom(undefined);
        setWanted(true);
        setOpen(true);
      } else if (e.key === "?") {
        e.preventDefault();
        setHelpWanted(true);
        setHelp(true);
      }
    };
    const onHelp = () => {
      setHelpWanted(true);
      setHelp(true);
    };
    document.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_SHORTCUTS_EVENT, onHelp);
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<OpenSearchDetail>).detail ?? {};
      // Letters typed while the palette's code loads are added to what the hero sent.
      typed.current = detail.query ?? "";
      setSeed({ ...detail, at: Date.now() });
      // Text typed on the hero opens it from the keyboard: at once.
      if (detail.query) setFrom(undefined);
      else opened();
      setWanted(true);
      setOpen(true);
    };
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen);
    const onPress = (e: PointerEvent) => {
      press.current = { at: performance.now(), x: e.clientX, y: e.clientY };
    };
    window.addEventListener("pointerdown", onPress, { capture: true, passive: true });
    return () => {
      window.removeEventListener("pointerdown", onPress, { capture: true });
      document.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_SHORTCUTS_EVENT, onHelp);
      window.removeEventListener(OPEN_SEARCH_EVENT, onOpen);
    };
  }, [opened]);

  return (
    <>
      {/* On home, the hero's own search field stands in for this one while it is on screen
          (hero-search.tsx sets data-hero-search on <html>): hidden, not removed, so nothing moves;
          it fades back once the hero scrolls away. */}
      <span className="inline-flex transition-[opacity,visibility] duration-(--duration-fast) ease-(--ease-out) motion-reduce:transition-none [html[data-hero-search]_&]:invisible [html[data-hero-search]_&]:opacity-0">
        <button
          type="button"
          onClick={() => {
            opened();
            setWanted(true);
            setOpen(true);
          }}
          onPointerEnter={prefetch}
          onFocus={prefetch}
          aria-label="Search tools"
          aria-haspopup="dialog"
          aria-keyshortcuts="Meta+K Control+K"
          // Phones: a 44px icon button. From sm up it reads as a search field, so search is visible
          // without knowing the shortcut (ADR-0123); the width is fixed, so the ⌘K hint shifts nothing.
          className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full px-3 text-fg-muted text-sm transition-colors duration-(--duration-instant) hover:bg-bg-subtle hover:text-fg focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 sm:w-56 sm:justify-start sm:border sm:border-border sm:bg-bg-raised sm:hover:border-border-strong sm:hover:bg-bg-raised sm:hover:text-fg-muted"
        >
          <Search size={20} strokeWidth={1.5} aria-hidden className="shrink-0" />
          <span className="hidden sm:inline">Search tools</span>
          {mac !== undefined && (
            <kbd
              aria-hidden
              className="ml-auto hidden rounded-full border border-border px-2 font-sans text-xs pointer-fine:sm:inline"
            >
              {mac ? "⌘K" : "Ctrl K"}
            </kbd>
          )}
        </button>
      </span>
      {wanted && (
        <Suspense fallback={null}>
          <CommandPalette
            open={open}
            onOpenChange={setOpen}
            initialQuery={typed.current}
            seed={seed}
            from={from}
          />
        </Suspense>
      )}
      {helpWanted && (
        <Suspense fallback={null}>
          <ShortcutsDialog open={help} onOpenChange={setHelp} mod={mac === false ? "Ctrl" : "⌘"} />
        </Suspense>
      )}
    </>
  );
}
