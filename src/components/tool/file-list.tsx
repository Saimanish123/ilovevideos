"use client";

import { AudioLines, Check, ChevronDown, ChevronUp, FileX, Minus, Plus, X } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatBytes, formatDimensions, formatDuration, formatPercentChange } from "@/lib/format";
import type { MediaInfo } from "@/tools/engines/types";
import { FileName } from "./file-card";
import { useFilmstrip } from "./timeline/use-filmstrip";

/** One row: an inspected input, or (in a batch) a file that could not be read and has no `info`. */
export interface ListInput {
  id: number;
  file: File;
  info?: MediaInfo;
}

/**
 * A batch row's state (feature catalog L1). Waiting and working carry real progress; done carries the
 * output and its own Download; skipped, failed and cancelled carry the specific sentence.
 */
export type QueueStatus =
  | { kind: "waiting" }
  | { kind: "working"; ratio: number; label: string }
  | {
      kind: "done";
      blob: Blob;
      filename: string;
      /** The tool's verdict for this file (spec.result), e.g. "Fits under 10 MB: 9.1 MB". */
      title?: string;
      missed?: boolean;
      /** False hides the percentage (conversions where the size is meant to change). */
      showChange?: boolean;
    }
  | { kind: "skipped"; reason: string }
  | { kind: "failed"; reason: string }
  /** Could not be read when added: said before anything runs, never counted as a run failure. */
  | { kind: "unreadable"; reason: string }
  | { kind: "cancelled" };

/**
 * The ordered input list of a multi-file tool (merge), and the batch queue of a single-file tool
 * (`queue`: unordered, one status and one Download per row). Each row has a thumbnail, duration and
 * facts. Reorder three ways: drag the thumbnail (it is the handle,
 * `touch-none` so a thumb drag does not scroll), arrow keys on the focused handle, or the up and
 * down buttons. Rows follow the pointer 1:1 by swapping places; nothing animates. 44px targets.
 */
export function FileList({
  inputs,
  notes,
  disabled = false,
  active,
  reading = [],
  notices = [],
  accept,
  max,
  noun = "clip",
  roles,
  onMove,
  onRemove,
  onAdd,
  queue,
  collapseAfter,
  unordered = false,
  selected,
  onSelect,
}: {
  inputs: ListInput[];
  /** One optional note per row, e.g. why this clip forces a re-encode. */
  notes?: (string | undefined)[];
  disabled?: boolean;
  /** Row being processed; earlier rows show as done. */
  active?: number;
  /**
   * Files still being read, in the order they will join the list. Each holds a row of the real
   * row's size from the moment it is chosen, so rows that arrive one by one move nothing below.
   */
  reading?: File[];
  /** Files that could not be added, one sentence each. */
  notices?: string[];
  accept: string;
  max: number;
  noun?: string;
  /** Role per row (spec.multiple.roles): unordered inputs, no reordering, no running total. */
  roles?: (string | undefined)[];
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
  onAdd: (files: File[]) => void;
  /** Batch queue: one status per row, same order as inputs. Rows are then unordered. */
  queue?: (QueueStatus | undefined)[];
  /**
   * Show only this many rows of a longer list behind "Show all n" (merge audio, up to 50 files).
   * Off by default. The list opens by itself when a row is moved past the shown ones or is the one
   * being worked on.
   */
  collapseAfter?: number;
  /** Order means nothing here (an analysis per file): no reordering, Remove only. */
  unordered?: boolean;
  /** Index of the row whose details the page shows (`aria-current`), with `onSelect`. */
  selected?: number;
  /** Makes each row the selector of the page's details: its picture is a button, the row clickable. */
  onSelect?: (index: number) => void;
}) {
  const rows = useRef(new Map<number, HTMLLIElement>());
  const handles = useRef(new Map<number, HTMLButtonElement>());
  const [dragging, setDragging] = useState<number>();
  const [announce, setAnnounce] = useState("");
  const [refocus, setRefocus] = useState<{
    id: number;
    which: "handle" | "up" | "down" | "remove";
  }>();
  const inputId = useId();
  const [over, setOver] = useState(false);
  const [expanded, setExpanded] = useState(false);
  // "Show all" unmounts itself: focus goes to the first row it revealed, not to <body>.
  const [revealFocus, setRevealFocus] = useState<number>();
  useEffect(() => {
    if (revealFocus === undefined) return;
    const id = inputs[revealFocus]?.id;
    const row = id === undefined ? undefined : rows.current.get(id);
    row?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    setRevealFocus(undefined);
  }, [revealFocus, inputs]);
  const limit =
    collapseAfter !== undefined &&
    !expanded &&
    inputs.length > collapseAfter + 1 &&
    (active === undefined || active < collapseAfter)
      ? collapseAfter
      : inputs.length;

  // A moved row is re-inserted in the DOM; put focus back on the control that moved it.
  useEffect(() => {
    if (!refocus) return;
    const row = rows.current.get(refocus.id);
    const el =
      refocus.which === "handle"
        ? handles.current.get(refocus.id)
        : refocus.which === "remove"
          ? row?.querySelector<HTMLButtonElement>("[data-remove]:not(:disabled)")
          : (row?.querySelector<HTMLButtonElement>(
              `[data-move="${refocus.which}"]:not(:disabled)`,
            ) ?? row?.querySelector<HTMLButtonElement>("[data-move]:not(:disabled)"));
    el?.focus();
    setRefocus(undefined);
  }, [refocus]);

  const move = (from: number, to: number, which?: "handle" | "up" | "down") => {
    if (to < 0 || to >= inputs.length || from === to) return;
    const item = inputs[from];
    if (!item) return;
    if (to >= limit) setExpanded(true);
    onMove(from, to);
    setAnnounce(`${item.file.name} moved to position ${to + 1} of ${inputs.length}.`);
    if (which) setRefocus({ id: item.id, which });
  };

  const startDrag = (index: number) => (e: React.PointerEvent) => {
    if (disabled || inputs.length < 2) return;
    e.preventDefault();
    const id = inputs[index]?.id;
    if (id === undefined) return;
    setDragging(id);
    let cur = index;
    const order = inputs.map((i) => i.id);
    const onMovePointer = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      // Swap with a neighbour once the pointer passes its middle.
      const above = order[cur - 1];
      const below = order[cur + 1];
      const up = above !== undefined ? rows.current.get(above)?.getBoundingClientRect() : undefined;
      const down =
        below !== undefined ? rows.current.get(below)?.getBoundingClientRect() : undefined;
      let to = cur;
      if (up && ev.clientY < up.top + up.height / 2) to = cur - 1;
      else if (down && ev.clientY > down.top + down.height / 2) to = cur + 1;
      if (to !== cur) {
        const [moved] = order.splice(cur, 1);
        if (moved !== undefined) order.splice(to, 0, moved);
        onMove(cur, to);
        cur = to;
      }
    };
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      window.removeEventListener("pointermove", onMovePointer);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      setDragging(undefined);
      const item = inputs[index];
      if (item && cur !== index)
        setAnnounce(`${item.file.name} moved to position ${cur + 1} of ${inputs.length}.`);
    };
    // Window listeners, not pointer capture: the row is re-inserted in the DOM as it moves.
    window.addEventListener("pointermove", onMovePointer);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  const total = inputs.reduce((s, i) => s + (i.info?.durationSec || 0), 0);
  // Pictures (a slideshow) have no running time of their own.
  const pictures = inputs.length > 0 && inputs.every((i) => i.info?.container === "image");
  // Totals count what can be processed; a file that could not be read is named on its row.
  const readable = inputs.filter((i) => i.info !== undefined);
  const unreadable = inputs.length - readable.length;
  const bytes = readable.reduce((s, i) => s + i.file.size, 0);
  const pending = reading.length;
  const room = max - inputs.length - pending;
  const plural = (n: number) => `${n} ${noun}${n === 1 ? "" : "s"}`;

  return (
    <section
      aria-label={`${noun[0]?.toUpperCase()}${noun.slice(1)}s`}
      className={cn(
        "flex flex-col gap-3 rounded-lg",
        over && "outline-2 outline-fg outline-offset-4",
      )}
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled) onAdd(Array.from(e.dataTransfer.files));
      }}
    >
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      {notices.length > 0 && (
        <div role="status" className="rounded-md bg-bg-subtle px-4 py-3 text-sm">
          {notices.map((n) => (
            <p key={n}>{n}</p>
          ))}
        </div>
      )}
      <ol
        className="flex flex-col gap-2"
        aria-label={`${noun[0]?.toUpperCase()}${noun.slice(1)}s${roles || queue || unordered ? "" : " in order"}`}
      >
        {inputs.slice(0, limit).map((item, i) => (
          <Row
            key={item.id}
            item={item}
            index={i}
            count={inputs.length}
            note={notes?.[i]}
            role={roles?.[i]}
            ordered={!roles && !queue && !unordered}
            queued={queue !== undefined}
            queueStatus={queue?.[i]}
            current={onSelect ? selected === i : undefined}
            onSelect={onSelect ? () => onSelect(i) : undefined}
            noun={noun}
            disabled={disabled}
            dragging={dragging === item.id}
            status={
              active === undefined
                ? undefined
                : i < active
                  ? "done"
                  : i === active
                    ? "now"
                    : undefined
            }
            rowRef={(el) => {
              if (el) rows.current.set(item.id, el);
              else rows.current.delete(item.id);
            }}
            handleRef={(el) => {
              if (el) handles.current.set(item.id, el);
              else handles.current.delete(item.id);
            }}
            onPointerDown={startDrag(i)}
            onHandleKey={(e) => {
              if (e.key === "ArrowUp") {
                e.preventDefault();
                move(i, i - 1, "handle");
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                move(i, i + 1, "handle");
              } else if ((e.key === "Delete" || e.key === "Backspace") && !disabled) {
                // The list's usual delete key; focus moves to the next row's handle, or the last one.
                e.preventDefault();
                const next = inputs[i + 1] ?? inputs[i - 1];
                onRemove(i);
                // One clip left has nothing to reorder (its handle is disabled): its Remove takes focus.
                if (next)
                  setRefocus({ id: next.id, which: inputs.length > 2 ? "handle" : "remove" });
              }
            }}
            onUp={() => move(i, i - 1, "up")}
            onDown={() => move(i, i + 1, "down")}
            onRemove={() => onRemove(i)}
          />
        ))}
        {reading.map((file, i) => (
          <ReadingRow
            // A file chosen twice is two rows; its place in the queue tells them apart.
            key={`${i}-${file.name}`}
            file={file}
            ordered={!roles && !queue && !unordered}
            queued={queue !== undefined}
            roled={roles !== undefined}
          />
        ))}
      </ol>
      {limit < inputs.length && (
        <Button
          variant="ghost"
          size="sm"
          className="min-h-11 self-start"
          onClick={() => {
            setExpanded(true);
            setRevealFocus(limit);
          }}
        >
          Show all {inputs.length} {noun}s
        </Button>
      )}
      {/* Stacked on phones whatever the line's length, so the row keeps its height as files are
          read and the total grows or shrinks (a wrap that comes and goes moves everything below). */}
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <p className="tabular text-fg-muted text-sm" aria-live="polite">
          {queue
            ? `${plural(readable.length)} · ${formatBytes(bytes)} in total${
                unreadable
                  ? ` · ${unreadable} ${unreadable === 1 ? "file" : "files"} cannot be read`
                  : ""
              }`
            : roles
              ? `${formatBytes(bytes)} in ${inputs.length} ${inputs.length === 1 ? "file" : "files"}`
              : pictures
                ? `${plural(inputs.length)} · ${formatBytes(bytes)} in total`
                : `${plural(inputs.length)} · ${formatDuration(total)} in total · ${formatBytes(bytes)}`}
          {pending > 0 && ` · reading ${pending} more`}
        </p>
        {!disabled && room > 0 && (
          <label
            htmlFor={inputId}
            className={cn(
              buttonVariants({ variant: "secondary", size: "md" }),
              "min-h-11 cursor-pointer has-focus-visible:outline-2 has-focus-visible:outline-ring has-focus-visible:outline-offset-2",
            )}
          >
            <Plus size={16} strokeWidth={1.5} aria-hidden />
            Add {roles ? noun : `${noun}s`}
            <input
              id={inputId}
              type="file"
              multiple
              accept={accept}
              className="sr-only"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                if (files.length) onAdd(files);
              }}
            />
          </label>
        )}
      </div>
    </section>
  );
}

function Row({
  item,
  index,
  count,
  note,
  role,
  ordered,
  queued = false,
  queueStatus,
  noun,
  disabled,
  dragging,
  status,
  rowRef,
  handleRef,
  onPointerDown,
  onHandleKey,
  onUp,
  onDown,
  onRemove,
  current,
  onSelect,
}: {
  item: ListInput;
  index: number;
  count: number;
  note?: string;
  /** Unordered inputs: the row's job ("Video", "New audio") instead of a position. */
  role?: string;
  ordered: boolean;
  /** A batch row: no handle, a status line, and a Download once done. */
  queued?: boolean;
  queueStatus?: QueueStatus;
  noun: string;
  disabled: boolean;
  dragging: boolean;
  status?: "done" | "now";
  rowRef: (el: HTMLLIElement | null) => void;
  handleRef: (el: HTMLButtonElement | null) => void;
  onPointerDown: (e: React.PointerEvent) => void;
  onHandleKey: (e: React.KeyboardEvent) => void;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
  /** This row's details are the ones shown (with `onSelect`). */
  current?: boolean;
  /** The row selects the page's details. */
  onSelect?: () => void;
}) {
  const { file, info } = item;
  const v = info?.video;
  const done = queueStatus?.kind === "done" ? queueStatus : undefined;
  const facts = done
    ? [
        `${formatBytes(file.size)} → ${formatBytes(done.blob.size)}${
          done.showChange !== false && formatPercentChange(file.size, done.blob.size)
            ? ` (${formatPercentChange(file.size, done.blob.size)})`
            : ""
        }`,
      ]
    : [
        // A picture (a slideshow's input) has no length.
        info && info.container !== "image" && formatDuration(info.durationSec),
        v && formatDimensions(v.width, v.height),
        formatBytes(file.size),
      ].filter(Boolean);
  // Rows are `bg-subtle`: the quiet variant's hover shows on them (ghost's would not).
  const iconButton = cn(buttonVariants({ variant: "quiet", size: "md" }), "h-11 w-11 shrink-0 p-0");
  const picture = <Thumb file={file} info={info} />;
  const showRemove = !disabled && !done;
  const actions = ordered || showRemove || done;
  // A queue row's or a selectable row's single action stays on its line on a phone.
  const inline = (queued || onSelect !== undefined) && !done;
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: a mouse convenience; the row's picture is a button that does the same from the keyboard
    <li
      ref={rowRef}
      className={cn(
        "grid gap-x-3 gap-y-1 rounded-md bg-bg-subtle p-2 text-sm",
        // A queue row can carry a long reason: the picture stays at the top beside the name.
        queued ? "items-start" : "items-center",
        // One icon action (a queue row's Remove) stays on the row's line on a phone; the reorder
        // buttons and a text Download move to a line of their own there.
        inline
          ? "grid-cols-[auto_minmax(0,1fr)_auto]"
          : "grid-cols-[auto_minmax(0,1fr)] sm:grid-cols-[auto_minmax(0,1fr)_auto]",
        dragging && "bg-bg-raised outline-1 outline-border-strong",
        onSelect && "cursor-pointer",
        current && "outline-1 outline-border-strong",
      )}
      // Mouse convenience; the picture is the keyboard and screen-reader control.
      onClick={
        onSelect
          ? (e) => {
              // A control on the row (Remove) does its own job; only the row's own area selects it.
              if ((e.target as Element).closest("button, a")) return;
              onSelect();
            }
          : undefined
      }
    >
      {queued ? (
        // A batch row is not reordered: the picture is only a picture.
        <div className="relative h-12 w-20 shrink-0 overflow-hidden rounded-sm bg-bg-stage">
          {picture}
        </div>
      ) : (
        <button
          ref={handleRef}
          type="button"
          disabled={onSelect ? disabled : disabled || count < 2 || !ordered}
          aria-label={
            ordered
              ? `${noun[0]?.toUpperCase()}${noun.slice(1)} ${index + 1}, ${file.name}. Drag, or use the up and down arrow keys, to reorder; Delete removes it.`
              : onSelect
                ? `Show details for ${file.name}`
                : `${role ?? file.name}: ${file.name}`
          }
          aria-current={current ? "true" : undefined}
          aria-roledescription={ordered ? "sortable item" : undefined}
          onClick={onSelect}
          onPointerDown={ordered ? onPointerDown : undefined}
          onKeyDown={ordered ? onHandleKey : undefined}
          className={cn(
            "relative h-12 w-20 shrink-0 overflow-hidden rounded-sm bg-bg-stage focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:cursor-default",
            // Only a reorderable row's picture is a drag handle (and so must not scroll the page).
            ordered ? "cursor-grab touch-none active:cursor-grabbing" : "cursor-pointer",
          )}
        >
          {picture}
          {ordered && (
            <span className="tabular absolute top-0.5 left-0.5 rounded-sm bg-bg-stage px-1 text-gray-50 text-xs">
              {index + 1}
            </span>
          )}
        </button>
      )}
      <div className="min-w-0">
        {role && <p className="font-medium text-xs">{role}</p>}
        <FileName name={file.name} />
        <p className="tabular mt-0.5 text-fg-muted text-xs">{facts.join(" · ")}</p>
        {note && <p className="mt-0.5 text-xs">{note}</p>}
        {status === "done" && (
          <p className="mt-0.5 flex items-center gap-1 text-fg-muted text-xs">
            <Check size={16} strokeWidth={1.5} aria-hidden /> Done
          </p>
        )}
        {status === "now" && <p className="mt-0.5 text-xs">Working on this {noun}</p>}
        {queueStatus && <QueueLine status={queueStatus} />}
      </div>
      {actions && (
        <div
          className={cn(
            "flex justify-end gap-1",
            inline ? "self-start" : "col-span-2 sm:col-span-1",
          )}
        >
          {ordered && (
            <>
              <button
                type="button"
                data-move="up"
                className={iconButton}
                aria-label={`Move ${file.name} up`}
                disabled={disabled || index === 0}
                onClick={onUp}
              >
                <ChevronUp size={16} strokeWidth={1.5} aria-hidden />
              </button>
              <button
                type="button"
                data-move="down"
                className={iconButton}
                aria-label={`Move ${file.name} down`}
                disabled={disabled || index === count - 1}
                onClick={onDown}
              >
                <ChevronDown size={16} strokeWidth={1.5} aria-hidden />
              </button>
            </>
          )}
          {done ? (
            <DownloadLink blob={done.blob} filename={done.filename} />
          ) : (
            (ordered || showRemove) && (
              <button
                type="button"
                className={iconButton}
                aria-label={`Remove ${file.name}`}
                data-remove
                disabled={disabled}
                onClick={onRemove}
              >
                <X size={16} strokeWidth={1.5} aria-hidden />
              </button>
            )
          )}
        </div>
      )}
    </li>
  );
}

/**
 * A file still being read: the real row's grid, picture box, name and a reserved actions slot, so the
 * row it becomes takes exactly its place.
 */
function ReadingRow({
  file,
  ordered,
  queued,
  roled,
}: {
  file: File;
  ordered: boolean;
  queued: boolean;
  /** Rows of a `roles` list carry a role line above the name; its height is held here too. */
  roled: boolean;
}) {
  return (
    <li
      className={cn(
        "grid gap-x-3 gap-y-1 rounded-md bg-bg-subtle p-2 text-sm",
        queued
          ? "grid-cols-[auto_minmax(0,1fr)_auto] items-start"
          : "grid-cols-[auto_minmax(0,1fr)] items-center sm:grid-cols-[auto_minmax(0,1fr)_auto]",
      )}
    >
      <div className="h-12 w-20 shrink-0 rounded-sm bg-bg-stage" />
      <div className="min-w-0">
        {roled && (
          <p aria-hidden className="invisible font-medium text-xs">
            Role
          </p>
        )}
        <FileName name={file.name} />
        <p className="tabular mt-0.5 text-fg-muted text-xs">Reading · {formatBytes(file.size)}</p>
      </div>
      {/* The row's buttons arrive with it; until then their line keeps its height. */}
      <div
        aria-hidden
        className={cn("flex justify-end gap-1", queued ? "self-start" : "col-span-2 sm:col-span-1")}
      >
        <div className={cn("h-11", ordered ? "w-35" : "w-11")} />
      </div>
    </li>
  );
}

/** A batch row's state in one line: an icon for the outcome, then the specific words. */
function QueueLine({ status }: { status: QueueStatus }) {
  const line = "mt-0.5 flex items-start gap-1 text-xs";
  const icon = (I: typeof Check) => (
    <I size={16} strokeWidth={1.5} aria-hidden className="shrink-0" />
  );
  switch (status.kind) {
    case "waiting":
      return <p className={cn(line, "text-fg-muted")}>Waiting</p>;
    case "working":
      return (
        <p className={line}>
          <span className="min-w-0">
            {status.label} ·{" "}
            <span className="tabular">
              {Math.round(Math.max(0, Math.min(1, status.ratio)) * 100)}%
            </span>
          </span>
        </p>
      );
    case "done":
      return (
        <p className={line}>
          {icon(status.missed ? Minus : Check)}
          <span className="min-w-0">{status.title ?? "Done"}</span>
        </p>
      );
    case "skipped":
      return <Reason icon={icon(Minus)} label="Skipped." reason={status.reason} />;
    case "failed":
      return <Reason icon={icon(X)} label="Failed." reason={status.reason} />;
    case "unreadable":
      return <Reason icon={icon(X)} label="Cannot read." reason={status.reason} />;
    case "cancelled":
      return (
        <p className={cn(line, "text-fg-muted")}>
          {icon(Minus)}
          <span>Cancelled before it ran</span>
        </p>
      );
  }
}

/**
 * A row's reason in one line that opens in place: the full sentence is one tap away, and a row whose
 * reason arrives with it (a file skipped or unreadable as soon as it is read) stays one line tall.
 */
function Reason({ icon, label, reason }: { icon: ReactNode; label: string; reason: string }) {
  return (
    <details className="group mt-0.5 text-xs">
      <summary className="flex cursor-pointer list-none items-center gap-1 rounded-sm focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden">
        {icon}
        <span className="min-w-0 truncate group-open:whitespace-normal">
          <span className="font-medium">{label}</span> {reason}
        </span>
      </summary>
    </details>
  );
}

/** A done row's own Download. The object URL lives as long as the row shows the output. */
function DownloadLink({ blob, filename }: { blob: Blob; filename: string }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  if (!url) return null;
  return (
    <a
      href={url}
      download={filename}
      aria-label={`Download ${filename}`}
      className={cn(buttonVariants({ variant: "secondary", size: "md" }), "min-h-11")}
    >
      Download
    </a>
  );
}

/** The row's first frame; a glyph for sound-only inputs and for files that could not be read. */
function Thumb({ file, info }: { file: File; info?: MediaInfo }) {
  if (info?.container === "image") return <PictureThumb file={file} />;
  return <FrameThumb file={file} info={info} />;
}

/** A picture's own pixels (a slideshow input), scaled by the browser. */
function PictureThumb({ file }: { file: File }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url ? (
    <img src={url} alt="" draggable={false} className="h-full w-full object-cover" />
  ) : null;
}

function FrameThumb({ file, info }: { file: File; info?: MediaInfo }) {
  const v = info?.video;
  const slot = useDecodeSlot(v !== undefined);
  const [thumb] = useFilmstrip(file, slot.granted ? (info?.durationSec ?? 0) : 0, 1);
  const { release } = slot;
  useEffect(() => {
    if (thumb) release();
  }, [thumb, release]);
  if (v)
    return thumb ? (
      <img src={thumb} alt="" draggable={false} className="h-full w-full object-cover" />
    ) : null;
  const Glyph = info ? AudioLines : FileX;
  return (
    <span className="flex h-full w-full items-center justify-center text-gray-300">
      <Glyph size={20} strokeWidth={1.5} aria-hidden />
    </span>
  );
}

/**
 * At most two rows decode a thumbnail at once, so a batch of fifty files does not open fifty video
 * decoders on a phone. A slot is given back when the frame arrives, after four seconds (a file the
 * browser cannot decode never sends one), or when the row goes away.
 */
const MAX_DECODERS = 2;
let decoding = 0;
const waiters: (() => void)[] = [];

function useDecodeSlot(wanted: boolean): { granted: boolean; release: () => void } {
  const [granted, setGranted] = useState(false);
  const held = useRef(false);
  const [release] = useState(() => () => {
    if (!held.current) return;
    held.current = false;
    decoding--;
    waiters.shift()?.();
  });
  useEffect(() => {
    if (!wanted) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const take = () => {
      // The row went away while it waited: pass the turn on.
      if (!alive) {
        waiters.shift()?.();
        return;
      }
      decoding++;
      held.current = true;
      setGranted(true);
      timer = setTimeout(release, 4000);
    };
    if (decoding < MAX_DECODERS) take();
    else waiters.push(take);
    return () => {
      alive = false;
      clearTimeout(timer);
      release();
    };
  }, [wanted, release]);
  return { granted, release };
}
