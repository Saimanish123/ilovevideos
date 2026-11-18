"use client";

import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Dialog on Base UI (design system §8.8). Used only for confirming a discard, keyboard shortcuts
 * help and the command palette; never for marketing. Elevation 2, `radius-lg`, max width 480px.
 *
 * Motion: scale 0.96 → 1 with opacity at `dur-slow` on `ease-out`, exit at `dur-fast` (exits are
 * shorter than enters). Centred, so the origin stays at the centre (modals are exempt from anchoring).
 * Pass `instant` for a surface opened from the keyboard many times a day (the ⌘K palette): keyboard-
 * initiated actions do not animate (design system §6.3). Reduced motion collapses to a fade through
 * the global rule in globals.css.
 *
 * Usage:
 *   <Dialog open={open} onOpenChange={setOpen}>
 *     <DialogTrigger render={<Button />}>Open</DialogTrigger>
 *     <DialogContent title="Discard this file?" description="The result is not saved.">…</DialogContent>
 *   </Dialog>
 * `DialogPrimitive` is Base UI's Dialog for anything this wrapper does not cover.
 */

export const Dialog = BaseDialog.Root;
export const DialogTrigger = BaseDialog.Trigger;
export const DialogClose = BaseDialog.Close;
export const DialogPrimitive = BaseDialog;

export function DialogContent({
  title,
  hideTitle = false,
  description,
  children,
  placement = "center",
  instant = false,
  showClose = true,
  className,
  initialFocus,
}: {
  /** Accessible name of the dialog. Always required; set `hideTitle` to keep it for screen readers only. */
  title: string;
  hideTitle?: boolean;
  description?: ReactNode;
  children?: ReactNode;
  /** `top` sits the popup 96px from the top, for a palette whose list grows downwards. */
  placement?: "center" | "top";
  /** No enter or exit transition (keyboard-opened surfaces). */
  instant?: boolean;
  showClose?: boolean;
  className?: string;
  /** Element to focus on open; defaults to the first tabbable element. */
  initialFocus?: BaseDialog.Popup.Props["initialFocus"];
}) {
  const motion = instant
    ? ""
    : "transition-[scale,opacity] duration-(--duration-slow) ease-(--ease-out) data-ending-style:duration-(--duration-fast) data-starting-style:scale-96 data-starting-style:opacity-0 data-ending-style:scale-96 data-ending-style:opacity-0";
  return (
    <BaseDialog.Portal>
      <BaseDialog.Backdrop
        className={cn(
          "fixed inset-0 z-50 min-h-dvh bg-overlay supports-[-webkit-touch-callout:none]:absolute",
          !instant &&
            "transition-opacity duration-(--duration-slow) ease-(--ease-out) data-ending-style:opacity-0 data-ending-style:duration-(--duration-fast) data-starting-style:opacity-0",
        )}
      />
      <BaseDialog.Popup
        initialFocus={initialFocus}
        className={cn(
          "fixed inset-x-4 z-50 mx-auto flex max-h-(--container-dialog-max-h) max-w-120 flex-col overflow-hidden rounded-lg bg-bg-raised text-fg shadow-2 outline-none",
          placement === "center" ? "top-1/2 -translate-y-1/2" : "top-24",
          motion,
          className,
        )}
      >
        <div
          className={cn(
            "flex items-start justify-between gap-4 px-6",
            hideTitle ? "sr-only" : "pt-6",
          )}
        >
          <div className="min-w-0">
            <BaseDialog.Title className="text-h3">{title}</BaseDialog.Title>
            {description && (
              <BaseDialog.Description className="mt-1 text-fg-muted text-sm">
                {description}
              </BaseDialog.Description>
            )}
          </div>
          {showClose && !hideTitle && (
            <BaseDialog.Close
              aria-label="Close"
              className="-mt-3 -mr-3 flex size-11 shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors duration-(--duration-instant) hover:bg-bg-subtle hover:text-fg focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
            >
              <X size={20} strokeWidth={1.5} aria-hidden />
            </BaseDialog.Close>
          )}
        </div>
        {children && (
          <div className={cn("min-h-0 overflow-y-auto", hideTitle ? "" : "px-6 pt-4 pb-6")}>
            {children}
          </div>
        )}
      </BaseDialog.Popup>
    </BaseDialog.Portal>
  );
}

/** Footer row for a dialog's actions: secondary first, the one primary last (right on desktop). */
export function DialogActions({ children }: { children: ReactNode }) {
  return (
    <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">{children}</div>
  );
}
