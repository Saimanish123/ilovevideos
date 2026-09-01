import { Link } from "@/lib/i18n/navigation";
import { site } from "@/lib/site";
import { ThemeToggle } from "./theme-toggle";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 h-14 border-b border-border bg-bg/90 backdrop-blur-sm">
      <div className="mx-auto flex h-full w-full max-w-(--container-content) items-center justify-between px-4 md:px-8">
        <Link href="/" className="text-h3 tracking-tight">
          {site.name}
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-1">
          <Link
            href="/"
            className="rounded-md px-3 py-2 text-sm text-fg-muted hover:bg-bg-subtle hover:text-fg"
          >
            All tools
          </Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
