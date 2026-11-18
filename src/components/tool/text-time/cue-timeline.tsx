"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { MoreOptions } from "@/components/tool/regions/more-options";
import { usePlayhead } from "@/components/tool/regions/use-playhead";
import { TimelineTrack, useSeek, useTimeAt } from "@/components/tool/timeline/timeline-track";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatTimecode } from "@/lib/format";
import { plain } from "@/tools/engines/subtitles/markup";
import type { Cue } from "@/tools/engines/subtitles/model";

/** Most cue spans drawn on the strip; past this they would merge into one band anyway. */
const MAX_SPANS = 600;

/**
 * The subtitles on the video's time: the filmstrip with each cue's span marked along its bottom and
 * a playhead that follows the preview, Previous and Next, and the cue list behind "Cues (n)", closed
 * by default. The strip scrubs; Previous and Next jump between cues; a row in the list jumps to its
 * cue, and the row of the cue on screen is marked and kept in view. Seeking lands just inside a
 * cue so its text is on the picture. Drawn in the light end of the gray ramp on the dark strip.
 */
export function CueTimeline({
  file,
  video,
  duration,
  cues,
  phrases = false,
  disabled = false,
}: {
  file: File;
  video: React.RefObject<HTMLVideoElement | null>;
  duration: number;
  cues: Cue[];
  /** The cues are short phrases of the file's cues: say "Phrase", so counts match the file card. */
  phrases?: boolean;
  disabled?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const snap = useCallback((t: number) => Math.min(duration, Math.max(0, t)), [duration]);
  const timeAt = useTimeAt(trackRef, duration, snap);
  const seek = useSeek(video);
  const now = usePlayhead(video);
  const ms = Math.round(now * 1000);
  const current = cues.findIndex((c) => c.start <= ms && c.end > ms);
  const pct = (t: number) => (duration > 0 ? Math.min(100, Math.max(0, (t / duration) * 100)) : 0);
  // Inside the cue: a frame or so after its start, so the picture shows it.
  const go = (c: Cue) => seek(Math.min(duration, c.start / 1000 + 0.02));
  const prev = [...cues].reverse().find((c) => c.start < ms - 50);
  const next = cues.find((c) => c.start > ms + 30);
  const noun = phrases ? "Phrase" : "Cue";
  const word = noun.toLowerCase();
  // What Previous and Next say once they have moved (not announced during playback).
  const [said, setSaid] = useState("");
  const jump = (c: Cue) => {
    go(c);
    setSaid(`${noun} ${cues.indexOf(c) + 1} of ${cues.length}`);
  };

  useEffect(() => {
    if (current < 0) return;
    const row = listRef.current?.querySelector<HTMLElement>(`[data-cue="${current}"]`);
    const list = listRef.current;
    if (!row || !list) return;
    // Keep the current row in view inside the list only (never scroll the page).
    const top = row.offsetTop - list.offsetTop;
    if (top < list.scrollTop || top + row.offsetHeight > list.scrollTop + list.clientHeight)
      list.scrollTop = top - list.clientHeight / 3;
  }, [current]);

  return (
    <div className="flex flex-col gap-3">
      <TimelineTrack
        file={file}
        video={video}
        duration={duration}
        disabled={disabled}
        trackRef={trackRef}
        timeAt={timeAt}
        strip={
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1.5" aria-hidden>
            {cues.slice(0, MAX_SPANS).map((c) => (
              <span
                key={`${c.start}-${c.end}-${c.line}`}
                className="absolute inset-y-0 rounded-sm bg-gray-50"
                style={{
                  left: `${pct(c.start / 1000)}%`,
                  width: `max(2px, ${pct(c.end / 1000) - pct(c.start / 1000)}%)`,
                }}
              />
            ))}
          </div>
        }
      />
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="min-h-11"
          aria-label={`Previous ${word}`}
          disabled={disabled || !prev}
          onClick={() => prev && jump(prev)}
        >
          <ChevronLeft size={16} strokeWidth={1.5} aria-hidden />
          <span aria-hidden>
            Previous<span className="max-sm:hidden"> {word}</span>
          </span>
        </Button>
        {/* Shown only while a cue is on the picture; read out only after Previous or Next. */}
        <span className="tabular whitespace-nowrap text-fg-muted text-xs" aria-hidden>
          {current >= 0 ? `${noun} ${current + 1} of ${cues.length}` : ""}
        </span>
        <span className="sr-only" aria-live="polite">
          {said}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="min-h-11"
          aria-label={`Next ${word}`}
          disabled={disabled || !next}
          onClick={() => next && jump(next)}
        >
          <span aria-hidden>
            Next<span className="max-sm:hidden"> {word}</span>
          </span>
          <ChevronRight size={16} strokeWidth={1.5} aria-hidden />
        </Button>
      </div>
      <MoreOptions label={`${noun}s (${cues.length.toLocaleString("en")})`}>
        <ol ref={listRef} aria-label={`${noun}s`} className="relative max-h-48 overflow-y-auto">
          {cues.map((c, i) => (
            <li key={`${c.start}-${c.end}-${c.line}`} data-cue={i}>
              <button
                type="button"
                disabled={disabled}
                aria-current={i === current || undefined}
                onClick={() => go(c)}
                className={cn(
                  "flex min-h-11 w-full items-baseline gap-3 px-3 py-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2",
                  i === current ? "bg-bg-subtle font-medium" : "hover:bg-bg-subtle",
                )}
              >
                <span className="tabular shrink-0 text-fg-muted text-xs">
                  {formatTimecode(c.start / 1000)}
                </span>
                <span className="min-w-0 flex-1 truncate" dir="auto">
                  {plain(c.text).replace(/\n/g, " ")}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </MoreOptions>
    </div>
  );
}
