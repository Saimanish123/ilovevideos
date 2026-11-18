import { Link } from "@/lib/i18n/navigation";
import { site } from "@/lib/site";
import { CommandPaletteTrigger } from "./command-palette-trigger";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 h-14 border-b border-border bg-bg/90 backdrop-blur-sm">
      <div className="mx-auto flex h-full w-full max-w-(--container-content) items-center justify-between px-4 md:px-8">
        <Link
          href="/"
          className="-mx-2 inline-flex min-h-11 items-center rounded-md px-2 text-h3 tracking-tight focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
        >
          {site.name}
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-1">
          {/* Search (⌘K): the palette's code loads on first open (command-palette-trigger). */}
          <CommandPaletteTrigger />
          <Link
            href="/#tools"
            className="inline-flex min-h-11 items-center rounded-md px-3 text-fg-muted text-sm transition-colors duration-(--duration-instant) hover:bg-bg-subtle hover:text-fg focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
          >
            All tools
          </Link>
        </nav>
      </div>
    </header>
  );
}
