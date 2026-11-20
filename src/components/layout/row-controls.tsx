"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useRouter } from "@/lib/i18n/navigation";

/**
 * The live part of one home row (ADR-0154), loaded after the page is interactive and never moving
 * anything:
 * - Edge fades: `data-more-start` and `data-more-end` on the list, from the scroll position (a passive
 *   listener and one animation frame, no React render per scroll event); `row-fade` in tokens.css
 *   turns them into mask stops.
 * - Previous and next, for a mouse only, over the fades, centred on the card pictures. Each scrolls
 *   one view of cards; no loop: a button fades out at its end, and both when the row fits.
 * - Arrow keys between cards: Left and Right move focus to the neighbouring card, Home and End to the
 *   first and last; Tab leaves the row.
 * - `copies`: the Continue and Because rows hold copies of server-rendered cards made before React
 *   ran, so their links are plain anchors; a plain click is routed in the app instead of a reload.
 */
export function RowControls({
  listId,
  label,
  copies = false,
}: {
  listId: string;
  label: string;
  copies?: boolean;
}) {
  const router = useRouter();
  const prev = useRef<HTMLButtonElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  const [top, setTop] = useState<number>();

  useEffect(() => {
    const list = document.getElementById(listId);
    if (!list) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const overflow = list.scrollWidth > list.clientWidth + 1;
      const start = !overflow || list.scrollLeft <= 1;
      const end = !overflow || list.scrollLeft + list.clientWidth >= list.scrollWidth - 1;
      list.toggleAttribute("data-more-start", !start);
      list.toggleAttribute("data-more-end", !end);
      prev.current?.toggleAttribute("data-hidden", start);
      next.current?.toggleAttribute("data-hidden", end);
      // Centre the buttons on the card pictures (the first child of each card link).
      const picture = list.querySelector("li a > :first-child") as HTMLElement | null;
      if (picture)
        setTop(
          picture.getBoundingClientRect().top -
            list.getBoundingClientRect().top +
            picture.offsetHeight / 2,
        );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    list.addEventListener("scroll", schedule, { passive: true });
    const resize = new ResizeObserver(schedule);
    resize.observe(list);

    // One tab stop per row (roving tabindex): Tab enters the row on its current card and leaves it;
    // the arrow keys move inside it. The current card is the last one focused, the first at start.
    const links = () => [...list.querySelectorAll<HTMLAnchorElement>(":scope > li > a")];
    const rove = (current: HTMLAnchorElement | undefined) => {
      const all = links();
      const keep = current && all.includes(current) ? current : all[0];
      for (const a of all) a.tabIndex = a === keep ? 0 : -1;
    };
    rove(undefined);
    const onFocus = (e: FocusEvent) => {
      const a = (e.target as HTMLElement).closest("a");
      if (a && list.contains(a)) rove(a as HTMLAnchorElement);
    };
    list.addEventListener("focusin", onFocus);
    // Copies arrive in the personal rows after mount on a client-side visit: keep one stop there too.
    const watch = new MutationObserver(() => rove(links().find((a) => a.tabIndex === 0)));
    watch.observe(list, { childList: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const all = links();
      const at = all.indexOf(document.activeElement as HTMLAnchorElement);
      if (at < 0) return;
      const to =
        e.key === "ArrowRight"
          ? at + 1
          : e.key === "ArrowLeft"
            ? at - 1
            : e.key === "Home"
              ? 0
              : e.key === "End"
                ? all.length - 1
                : -1;
      const target = all[to];
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End")
        return;
      e.preventDefault();
      if (!target) return;
      rove(target);
      target.focus({ preventScroll: true });
      // A keyboard move is not animated: the card is simply there.
      target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
    };
    list.addEventListener("keydown", onKey);

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
        return;
      const a = (e.target as HTMLElement).closest("a");
      const href = a?.getAttribute("href");
      if (!a || !href?.startsWith("/")) return;
      e.preventDefault();
      router.push(href);
    };
    if (copies) list.addEventListener("click", onClick);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      list.removeEventListener("scroll", schedule);
      list.removeEventListener("keydown", onKey);
      list.removeEventListener("focusin", onFocus);
      watch.disconnect();
      list.removeEventListener("click", onClick);
      resize.disconnect();
    };
  }, [listId, copies, router]);

  const go = (dir: 1 | -1) => {
    const list = document.getElementById(listId);
    if (!list) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    list.scrollBy({ left: dir * list.clientWidth * 0.8, behavior: reduce ? "auto" : "smooth" });
  };
  const button = cn(
    buttonVariants({ variant: "chip", size: "icon" }),
    "pointer-events-auto absolute -translate-y-1/2 transition-[opacity,visibility,border-color] duration-(--duration-fast) ease-(--ease-out) data-hidden:invisible data-hidden:opacity-0 data-hidden:duration-(--duration-instant) motion-reduce:transition-none",
  );
  return (
    <div
      className="pointer-events-none absolute inset-0 hidden pointer-fine:block"
      style={top === undefined ? { visibility: "hidden" } : undefined}
    >
      <button
        ref={prev}
        type="button"
        aria-label={`Previous ${label}`}
        aria-controls={listId}
        data-hidden=""
        onClick={() => go(-1)}
        className={cn(button, "left-3 md:left-4")}
        style={{ top }}
      >
        <ChevronLeft size={20} strokeWidth={1.5} aria-hidden />
      </button>
      <button
        ref={next}
        type="button"
        aria-label={`Next ${label}`}
        aria-controls={listId}
        data-hidden=""
        onClick={() => go(1)}
        className={cn(button, "right-3 md:right-4")}
        style={{ top }}
      >
        <ChevronRight size={20} strokeWidth={1.5} aria-hidden />
      </button>
    </div>
  );
}
