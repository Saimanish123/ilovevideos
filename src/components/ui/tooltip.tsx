"use client";

import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import type { ReactElement, ReactNode } from "react";

/**
 * Tooltip on Base UI. A visual label for sighted pointer and keyboard users only: the trigger must
 * carry its own `aria-label`, and nothing a user needs may live only in a tooltip (Base UI disables
 * tooltips on touch). Use it for icon-only buttons and for the reason a control is disabled
 * (principles §1.10), with the reason also stated inline where space allows.
 *
 * Motion: scale 0.97 → 1 with opacity from the anchor (`--transform-origin`), `dur-fast` in and
 * `dur-instant` out. Once one tooltip is open, neighbours open with no delay and no animation
 * (`data-instant`). Wrap the app, or a toolbar, in `TooltipProvider` to share that delay.
 */

export const TooltipProvider = BaseTooltip.Provider;

export function Tooltip({
  content,
  children,
  side = "top",
}: {
  content: ReactNode;
  /** The trigger element. It is rendered as-is, so it keeps its own semantics and label. */
  children: ReactElement;
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger render={children} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner side={side} sideOffset={8} className="z-50">
          <BaseTooltip.Popup className="max-w-64 origin-(--transform-origin) rounded-md bg-bg-raised px-3 py-2 text-fg text-xs shadow-2 transition-[scale,opacity] duration-(--duration-fast) ease-(--ease-out) data-ending-style:scale-97 data-ending-style:opacity-0 data-ending-style:duration-(--duration-instant) data-instant:transition-none data-starting-style:scale-97 data-starting-style:opacity-0">
            {content}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}
