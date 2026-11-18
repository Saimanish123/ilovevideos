"use client";

import { Drawer } from "@base-ui/react/drawer";
import type { ReactNode } from "react";

/**
 * Bottom sheet on Base UI's Drawer (design system §8.8): the mobile counterpart of `Dialog`. Swipe
 * down to dismiss; a 32×4px `border-strong` handle shows that it can be dragged. Same uses as the
 * dialog only: confirming a discard, shortcuts help. Never marketing.
 *
 * Motion: slides up from its own height on `ease-drawer` at `dur-slow`; the swipe tracks the finger
 * 1:1 (`--drawer-swipe-movement-y`, no transition while swiping) and the release is scaled by the
 * swipe's strength, never longer than `dur-fast` for a flick. Reduced motion collapses to a fade.
 *
 * Usage mirrors Dialog: <Sheet open onOpenChange><SheetTrigger/><SheetContent title>…</SheetContent></Sheet>
 */

export const Sheet = Drawer.Root;
export const SheetTrigger = Drawer.Trigger;
export const SheetClose = Drawer.Close;

export function SheetContent({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Drawer.Portal>
      <Drawer.Backdrop className="fixed inset-0 z-50 min-h-dvh bg-overlay opacity-[calc(1-var(--drawer-swipe-progress))] transition-opacity duration-(--duration-slow) ease-(--ease-drawer) data-ending-style:opacity-0 data-ending-style:duration-(--duration-fast) data-starting-style:opacity-0 data-swiping:duration-0 supports-[-webkit-touch-callout:none]:absolute" />
      <Drawer.Viewport className="fixed inset-0 z-50 flex items-end justify-center">
        <Drawer.Popup className="max-h-(--container-sheet-max-h) w-full max-w-160 overflow-y-auto overscroll-contain rounded-t-lg bg-bg-raised px-6 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] text-fg shadow-2 outline-none [transform:translateY(var(--drawer-swipe-movement-y))] transition-[transform,opacity] duration-(--duration-slow) ease-(--ease-drawer) data-ending-style:[transform:translateY(100%)] data-ending-style:duration-[calc(var(--drawer-swipe-strength)*var(--duration-fast))] data-starting-style:[transform:translateY(100%)] data-starting-style:opacity-0 data-ending-style:opacity-0 data-swiping:select-none data-swiping:duration-0">
          <div aria-hidden className="mx-auto h-1 w-8 rounded-full bg-border-strong" />
          <Drawer.Content className="mt-4">
            <Drawer.Title className="text-h3">{title}</Drawer.Title>
            {description && (
              <Drawer.Description className="mt-1 text-fg-muted text-sm">
                {description}
              </Drawer.Description>
            )}
            {children && <div className="mt-4">{children}</div>}
          </Drawer.Content>
        </Drawer.Popup>
      </Drawer.Viewport>
    </Drawer.Portal>
  );
}
