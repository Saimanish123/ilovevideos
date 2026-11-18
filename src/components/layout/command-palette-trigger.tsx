"use client";

import { Search } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
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
  const [mac, setMac] = useState<boolean>();
  const [loaded, setLoaded] = useState(false);
  const [help, setHelp] = useState(false);
  const [helpWanted, setHelpWanted] = useState(false);
  const typed = useRef("");

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
        setWanted(true);
        setOpen((o) => !o);
        return;
      }
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
      if (typing(e.target) || document.querySelector('[role="dialog"]')) return;
      if (e.key === "/") {
        e.preventDefault();
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
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_SHORTCUTS_EVENT, onHelp);
    };
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setWanted(true);
          setOpen(true);
        }}
        onPointerEnter={prefetch}
        onFocus={prefetch}
        aria-label="Search tools"
        aria-haspopup="dialog"
        aria-keyshortcuts="Meta+K Control+K"
        className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md px-3 text-fg-muted text-sm transition-colors duration-(--duration-instant) hover:bg-bg-subtle hover:text-fg focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
      >
        <Search size={20} strokeWidth={1.5} aria-hidden />
        <span className="hidden sm:inline">Search</span>
        {mac !== undefined && (
          <kbd
            aria-hidden
            className="hidden rounded-sm border border-border px-1 font-sans text-xs pointer-fine:sm:inline"
          >
            {mac ? "⌘K" : "Ctrl K"}
          </kbd>
        )}
      </button>
      {wanted && (
        <Suspense fallback={null}>
          <CommandPalette open={open} onOpenChange={setOpen} initialQuery={typed.current} />
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
