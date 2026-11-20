"use client";

import { Search } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { openSearch } from "@/lib/open-search";

/**
 * The home hero's actions (ADR-0155; owner, 2026-11-19: no single tool as the hero's button). A large
 * field-like button opens the site search, the palette or the phone sheet, with what was typed carried
 * over; "Or choose a file", or a file dropped anywhere on the hero, opens the same search with that
 * file's suggestions (file-suggest.tsx). The search code still loads only on use: this island only
 * sends an event the header's trigger listens to.
 */
export function HeroSearch({
  placeholder,
  short,
  chooseLabel,
}: {
  placeholder: string;
  /** The placeholder below 640px, where the long one would be cut. */
  short: string;
  chooseLabel: string;
}) {
  const inputId = useId();
  const root = useRef<HTMLDivElement>(null);
  const typed = useRef("");
  const [over, setOver] = useState(false);

  // While this field is on screen the header's search button steps back (one search box at a time);
  // the inline script in the hero sets the attribute before first paint.
  useEffect(() => {
    const field = root.current;
    const html = document.documentElement;
    if (!field) return;
    const seen = new IntersectionObserver(([entry]) =>
      html.toggleAttribute("data-hero-search", !!entry?.isIntersecting),
    );
    seen.observe(field);
    return () => {
      seen.disconnect();
      html.removeAttribute("data-hero-search");
    };
  }, []);

  // A file dropped anywhere on the hero section, not only on a small target.
  useEffect(() => {
    const hero = root.current?.closest("section");
    if (!hero) return;
    const onOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault();
      setOver(true);
    };
    const onLeave = (e: DragEvent) => {
      if (!hero.contains(e.relatedTarget as Node | null)) setOver(false);
    };
    const onDrop = (e: DragEvent) => {
      const files = [...(e.dataTransfer?.files ?? [])];
      if (!files.length) return;
      e.preventDefault();
      setOver(false);
      openSearch({ files });
    };
    hero.addEventListener("dragover", onOver);
    hero.addEventListener("dragleave", onLeave);
    hero.addEventListener("drop", onDrop);
    return () => {
      hero.removeEventListener("dragover", onOver);
      hero.removeEventListener("dragleave", onLeave);
      hero.removeEventListener("drop", onDrop);
    };
  }, []);

  return (
    <div ref={root} className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => openSearch()}
        onFocus={() => {
          typed.current = "";
        }}
        onKeyDown={(e) => {
          // Typing on the field starts the search with the text so far; letters typed before the
          // search field takes focus keep arriving here and are added to it.
          if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey && e.key !== " ") {
            e.preventDefault();
            typed.current += e.key;
            openSearch({ query: typed.current });
          }
        }}
        className={cn(
          "flex h-14 w-full min-w-0 max-w-140 items-center gap-3 rounded-full border bg-bg-raised px-5 text-left text-body text-fg-muted transition-colors duration-(--duration-instant) hover:border-border-strong focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
          over ? "border-fg" : "border-border",
        )}
      >
        <Search size={20} strokeWidth={1.5} aria-hidden className="shrink-0" />
        <span className="truncate sm:hidden">{short}</span>
        <span className="hidden truncate sm:inline">{placeholder}</span>
      </button>
      <label
        htmlFor={inputId}
        className={cn(
          buttonVariants({ variant: "secondary", size: "pill" }),
          "h-14 shrink-0 cursor-pointer px-6 has-focus-visible:outline-2 has-focus-visible:outline-ring has-focus-visible:outline-offset-2",
        )}
      >
        {chooseLabel}
        <input
          id={inputId}
          type="file"
          multiple
          className="sr-only"
          onChange={(e) => {
            const files = [...(e.currentTarget.files ?? [])];
            e.currentTarget.value = "";
            if (files.length) openSearch({ files });
          }}
        />
      </label>
    </div>
  );
}
