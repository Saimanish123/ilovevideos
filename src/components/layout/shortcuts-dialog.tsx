"use client";

import { Fragment, useSyncExternalStore } from "react";
import { PLAYER_SHORTCUTS } from "@/components/tool/shortcuts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Sheet, SheetClose, SheetContent } from "@/components/ui/sheet";
import { getPageShortcuts, subscribePageShortcuts } from "@/lib/page-shortcuts";

/** `gesture`: the first column names a touch or pointer action instead of key caps. */
type Row = { keys: string; label: string; gesture?: boolean };
type Group = { title: string; rows: readonly Row[]; note?: string };

const NARROW = "(max-width: 767px)";
const subscribeNarrow = (onChange: () => void) => {
  const mq = window.matchMedia(NARROW);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
};

/**
 * Every keyboard shortcut and touch gesture in one list ("?", or the footer link). Loaded on first
 * open, like the command palette. A dialog from md up, opened without animation because it is opened
 * from the keyboard (§6.3); a bottom sheet on phones (§8.8), where it is mostly reached from the
 * footer. One grid holds every group, so the key column lines up across all of them.
 * `mod` is "⌘" on Apple devices and "Ctrl" elsewhere.
 */
export function ShortcutsDialog({
  open,
  onOpenChange,
  mod,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mod: string;
}) {
  const page = useSyncExternalStore(subscribePageShortcuts, getPageShortcuts, getPageShortcuts);
  const narrow = useSyncExternalStore(
    subscribeNarrow,
    () => window.matchMedia(NARROW).matches,
    () => false,
  );
  const playerKeys = new Set<string>(PLAYER_SHORTCUTS.map((s) => s.keys));
  const own = page.items.filter((s) => !playerKeys.has(s.keys));
  const groups: Group[] = [
    ...(own.length > 0 ? [{ title: "This page", rows: own }] : []),
    {
      title: "Everywhere",
      rows: [
        { keys: `${mod} K`, label: "Search tools" },
        { keys: "/", label: "Search tools" },
        { keys: "?", label: "This list" },
        { keys: "Esc", label: "Close a dialog or panel" },
      ],
    },
    {
      title: "On a tool page",
      rows: [
        { keys: `${mod} O`, label: "Choose a file" },
        { keys: `${mod} V`, label: "Paste a file" },
        { keys: `${mod} Enter`, label: "Run the page's action" },
        { keys: `${mod} S`, label: "Save the result" },
        { keys: "Esc", label: "Cancel a run" },
      ],
    },
    {
      title: "Preview",
      note: page.player
        ? "When the workspace has focus. A key this page uses itself keeps its meaning here."
        : "On pages with a video or audio preview, when the workspace has focus.",
      rows: PLAYER_SHORTCUTS,
    },
    {
      title: "Touch and pointer",
      rows: [
        { keys: "Tap or click", label: "The preview: play or pause", gesture: true },
        {
          keys: "Double-tap",
          label: "The left or right side of the preview: back or forward 5 seconds",
          gesture: true,
        },
        { keys: "Double-click", label: "The preview: full screen", gesture: true },
        { keys: "Drag", label: "A clip's picture in a list: change the order", gesture: true },
        { keys: "Swipe down", label: "A panel that slides up: close it", gesture: true },
      ],
    },
  ];
  const title = "Keyboard shortcuts and gestures";

  if (narrow)
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent title={title}>
          {/* The sheet scrolls; a focusable region inside lets the keyboard land and scroll it. */}
          <section
            // biome-ignore lint/a11y/noNoninteractiveTabindex: the scrolling sheet needs a keyboard stop (axe scrollable-region-focusable)
            tabIndex={0}
            aria-label="Shortcuts list"
            className="rounded-sm focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
          >
            <List groups={groups} />
          </section>
          {/* A way out besides swiping, and the next tab stop after the list (§8.8). */}
          <SheetClose render={<Button variant="secondary" className="mt-6 w-full" />}>
            Done
          </SheetClose>
        </SheetContent>
      </Sheet>
    );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} instant>
        {/* The list can outgrow the screen: a focusable region, so the keyboard can scroll it. */}
        <section
          // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling region must be reachable by keyboard (axe scrollable-region-focusable)
          tabIndex={0}
          aria-label="Shortcuts list"
          className="-m-1 max-h-(--dialog-scroll-max-h) overflow-y-auto rounded-sm p-1 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
        >
          <List groups={groups} />
        </section>
      </DialogContent>
    </Dialog>
  );
}

function List({ groups }: { groups: Group[] }) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-4 gap-y-2 text-sm">
      {groups.map((g, i) => (
        <Fragment key={g.title}>
          <h3 className={i === 0 ? "col-span-2 font-medium" : "col-span-2 mt-4 font-medium"}>
            {g.title}
          </h3>
          {g.note && <p className="col-span-2 -mt-1 text-fg-muted text-xs">{g.note}</p>}
          <dl className="contents">
            {g.rows.map((r) => (
              <div key={`${r.keys}-${r.label}`} className="contents">
                <dt className="flex flex-wrap gap-1">
                  {r.gesture ? (
                    <span className="font-medium text-fg">{r.keys}</span>
                  ) : (
                    r.keys.split(" ").map((k, j) => (
                      <kbd
                        key={`${k}-${j.toString()}`}
                        className="inline-flex min-w-6 items-center justify-center rounded-sm border border-border bg-bg-subtle px-1.5 font-sans text-fg text-xs"
                      >
                        {k}
                      </kbd>
                    ))
                  )}
                </dt>
                <dd className="text-fg-muted">{r.label}</dd>
              </div>
            ))}
          </dl>
        </Fragment>
      ))}
    </div>
  );
}
