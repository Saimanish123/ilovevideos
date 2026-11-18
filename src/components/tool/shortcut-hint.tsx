import type { Shortcut } from "./options/types";

/**
 * The page's keyboard shortcuts (spec.shortcuts) behind one quiet disclosure, the same shape as the
 * result's "The same operation with ffmpeg". Hidden on touch-only devices, which have no keys.
 * `keys` is printed token by token, each in its own key cap ("Shift ←" is two caps).
 */
export function ShortcutHint({ items }: { items: Shortcut[] }) {
  if (items.length === 0) return null;
  return (
    <details className="text-sm pointer-coarse:hidden" data-testid="shortcut-hint">
      <summary className="flex min-h-11 cursor-pointer items-center text-fg-muted hover:text-fg">
        Keyboard shortcuts
      </summary>
      <dl className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-4 gap-y-2">
        {items.map((s) => (
          <div key={`${s.keys}-${s.label}`} className="contents">
            <dt className="flex gap-1">
              {s.keys.split(" ").map((k, i) => (
                <kbd
                  key={`${k}-${i.toString()}`}
                  className="inline-flex min-w-6 items-center justify-center rounded-sm border border-border bg-bg-subtle px-1.5 font-sans text-fg text-xs"
                >
                  {k}
                </kbd>
              ))}
            </dt>
            <dd className="text-fg-muted">{s.label}</dd>
          </div>
        ))}
        <div className="contents">
          <dt className="flex gap-1">
            <kbd className="inline-flex min-w-6 items-center justify-center rounded-sm border border-border bg-bg-subtle px-1.5 font-sans text-fg text-xs">
              ?
            </kbd>
          </dt>
          <dd className="text-fg-muted">Every shortcut, including the preview's and the site's</dd>
        </div>
      </dl>
    </details>
  );
}
