"use client";

import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { FileName } from "@/components/tool/file-card";
import { discovery } from "@/content/site/discovery";
import {
  kindOf,
  type PairSources,
  type SuggestionRow,
  suggestForFile,
} from "@/lib/file-suggestions";
import { setHandoff, setHandoffFiles } from "@/lib/handoff";
import { Link } from "@/lib/i18n/navigation";
import type { MediaInfo } from "@/tools/engines/types";
import { EngineClient } from "@/tools/workers/client";

type State = { kind: "reading" } | { kind: "done"; rows: SuggestionRow[]; unreadable: boolean };

/**
 * Reads the first chosen file with the same inspector the tool pages use (in a worker, on this
 * device) and shows what its facts suggest (lib/file-suggestions). A link hands the file on, so the
 * tool opens with it loaded; "merge" hands on every file. Loaded only once a file is chosen.
 */
export function FileSuggest({
  files,
  pairs,
  onNavigate,
  className = "mt-6 border-border border-t pt-4",
}: {
  files: File[];
  pairs: PairSources;
  /** Called when a suggestion is followed (the search sheet closes itself). */
  onNavigate?: () => void;
  /** The block's spacing; the search sheet sets its own. */
  className?: string;
}) {
  const [state, setState] = useState<State>({ kind: "reading" });
  const first = files[0];

  useEffect(() => {
    if (!first) return;
    let alive = true;
    setState({ kind: "reading" });
    const same = files.filter((f) => kindOf(f) === kindOf(first));
    const finish = (info: MediaInfo | undefined) => {
      if (!alive) return;
      const rows = suggestForFile(first, info, pairs, same.length);
      setState({ kind: "done", rows, unreadable: !info && kindOf(first) === "media" });
    };
    if (kindOf(first) !== "media") {
      finish(undefined);
      return;
    }
    const client = new EngineClient();
    client.inspect(first).then(finish, () => finish(undefined));
    return () => {
      alive = false;
      client.dispose();
    };
  }, [files, first, pairs]);

  if (!first) return null;
  const same = files.filter((f) => kindOf(f) === kindOf(first));
  const actions = state.kind === "done" ? state.rows.flatMap((r) => r.actions).length : 0;
  // One live line for screen readers; the list itself is not announced.
  const announce =
    state.kind === "reading"
      ? discovery.fileReading
      : actions > 0
        ? `${actions} ${actions === 1 ? "suggestion" : "suggestions"} for ${first.name}`
        : state.unreadable
          ? discovery.fileUnreadable
          : discovery.fileNone;

  return (
    <div className={className}>
      <p role="status" className="sr-only">
        {announce}
      </p>
      <div className="text-sm">
        <FileName name={first.name} />
      </div>
      {state.kind === "reading" ? (
        <p className="mt-3 text-fg-muted text-sm">{discovery.fileReading}</p>
      ) : state.rows.length === 0 ? (
        <p className="mt-3 text-fg-muted text-sm">
          {state.unreadable ? discovery.fileUnreadable : discovery.fileNone}
        </p>
      ) : (
        <ul className="mt-2 flex flex-col">
          {state.rows.map((row, i) => (
            // The suggestions arrive in place of "Reading", 30 ms apart, six at most (ADR-0157).
            <li
              key={row.reason}
              className="arrive grid gap-x-6 pt-2 md:grid-cols-[var(--container-label)_1fr] md:pt-0"
              style={{ transitionDelay: `calc(${Math.min(i, 5)} * var(--motion-step-group))` }}
            >
              <p className="tabular text-fg-muted text-sm md:pt-3">{row.reason}</p>
              <ul className="flex flex-wrap gap-x-6">
                {row.actions.map((a) => (
                  <li key={a.slug}>
                    <Link
                      href={`/${a.slug}`}
                      onClick={() => {
                        if (a.all && same.length > 1) setHandoffFiles(same);
                        else setHandoff(first);
                        onNavigate?.();
                      }}
                      className="inline-flex min-h-11 items-center gap-2 rounded-sm font-medium text-sm underline decoration-1 underline-offset-3 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
                    >
                      {a.label}
                      <ArrowRight size={16} strokeWidth={1.5} aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
