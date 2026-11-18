"use client";

import { Fragment, type ReactNode, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { Cue, Issue } from "@/tools/engines/subtitles";
import { cueClock } from "@/tools/engines/subtitles/time";

/** Normalised cue markup (<i>, <b>, <u>, "\n") as React nodes; never as HTML. */
export function CueText({ text }: { text: string }) {
  const nodes: ReactNode[] = [];
  const state = { i: false, b: false, u: false };
  let key = 0;
  for (const part of text.split(/(<\/?[ibu]>|\n)/)) {
    if (part === "") continue;
    const tag = /^<(\/?)([ibu])>$/.exec(part);
    if (tag) {
      state[tag[2] as "i" | "b" | "u"] = tag[1] !== "/";
      continue;
    }
    if (part === "\n") {
      nodes.push(<br key={key++} />);
      continue;
    }
    nodes.push(
      <span
        key={key++}
        className={cn(state.i && "italic", state.b && "font-semibold", state.u && "underline")}
      >
        {part}
      </span>,
    );
  }
  return <>{nodes}</>;
}

const PAGE = 150;

/**
 * The cue list: the primary surface of the subtitle tools. Each row shows the cue's number, its
 * times (with the old times under them when an edit moved it) and its text as it will read; rows
 * with a timing problem carry the problem in words. Long files show the first 150 cues until asked.
 */
export function CueList({
  cues,
  before,
  issues,
  label,
  problemsOnly = false,
}: {
  cues: Cue[];
  /** The same cues before the edit, keyed by source line, to show what moved. */
  before?: Map<number, Cue>;
  issues?: Issue[];
  label: string;
  problemsOnly?: boolean;
}) {
  const [all, setAll] = useState(false);
  const byLine = useMemo(() => {
    const m = new Map<number, Issue[]>();
    for (const i of issues ?? []) m.set(i.line, [...(m.get(i.line) ?? []), i]);
    return m;
  }, [issues]);
  const rows = problemsOnly ? cues.filter((c) => byLine.has(c.line)) : cues;
  const shown = all ? rows : rows.slice(0, PAGE);
  return (
    <div className="rounded-md bg-bg-subtle">
      <ol
        aria-label={label}
        // Scrollable, so it takes focus: arrow keys and Page Down scroll it (axe scrollable-region-focusable).
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a scroll container must be reachable by keyboard
        tabIndex={0}
        className="divide-y divide-border overflow-y-auto rounded-md focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
        // Same cap as the video preview, so the panel and its button stay on screen.
        style={{ maxHeight: "60vh" }}
      >
        {shown.map((c) => {
          const was = before?.get(c.line);
          const moved = was && (was.start !== c.start || was.end !== c.end);
          const problems = byLine.get(c.line);
          const n = cues.indexOf(c) + 1;
          return (
            <li
              key={`${c.line}-${n}`}
              className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-3 px-4 py-3"
            >
              <span className="tabular pt-0.5 text-fg-muted text-xs">{n.toLocaleString("en")}</span>
              <div className="min-w-0">
                <p className="tabular flex flex-wrap items-center gap-x-1 text-fg-muted text-xs">
                  <span className={cn(moved && "font-medium text-fg")}>{cueClock(c.start)}</span>
                  <span aria-hidden>–</span>
                  <span className="sr-only">to</span>
                  <span className={cn(moved && "font-medium text-fg")}>{cueClock(c.end)}</span>
                  {c.top && <span className="ml-2">· top of the picture</span>}
                  {moved && was && (
                    <span className="ml-2">
                      was {cueClock(was.start)} – {cueClock(was.end)}
                    </span>
                  )}
                </p>
                <p className="mt-1 break-words text-sm">
                  {c.text.trim() === "" ? (
                    <span className="text-fg-muted">No text</span>
                  ) : (
                    <CueText text={c.text} />
                  )}
                </p>
                {problems && (
                  <p className="mt-1 text-xs">
                    {problems.map((p, i) => (
                      <Fragment key={`${p.kind}-${i}`}>
                        {i > 0 && " "}
                        {p.message}
                      </Fragment>
                    ))}
                  </p>
                )}
              </div>
            </li>
          );
        })}
        {rows.length === 0 && (
          <li className="px-4 py-6 text-center text-fg-muted text-sm">No cues to show.</li>
        )}
      </ol>
      {rows.length > shown.length && (
        <div className="border-border border-t px-4 py-2">
          <Button variant="ghost" size="sm" className="min-h-11" onClick={() => setAll(true)}>
            Show all {rows.length.toLocaleString("en")} cues
          </Button>
        </div>
      )}
    </div>
  );
}
