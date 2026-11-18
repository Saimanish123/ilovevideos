"use client";

import { useEffect, useRef } from "react";
import { UnitField } from "@/components/tool/regions/percent-field";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import {
  type DateChange,
  describeInstant,
  describeShift,
  formatQtDate,
  MP4_EPOCH,
  parseQtDate,
  setInstant,
} from "@/tools/engines/edit-metadata/dates";
import type { EditableTags, EditMetadataOptions } from "@/tools/engines/edit-metadata/fields";
import type { HeroProps, OptionsPanelProps } from "../options/types";
import { useEditable } from "./use-editable";

/**
 * The change-creation-date page (edit-metadata engine, preset `task: "date"`, ADR-0096): the panel
 * that sets or shifts the date, and the hero that shows the recording date before and after, read
 * back from the new copy when done.
 */
export type DateOptions = EditMetadataOptions & {
  task?: "date" | "cover";
  /** UI only: the file's own date as the "set" fields started, so an untouched form is no change. */
  from?: string;
  /** UI only: the shift direction, kept while the amount is still 0. */
  earlier?: boolean;
  /** UI only: the file's date as it was, for the done card. */
  was?: string;
};

/** UTC offsets in use somewhere (minutes east of UTC). */
const OFFSETS = [
  -720, -660, -600, -570, -540, -480, -420, -360, -300, -240, -210, -180, -150, -120, -60, 0, 60,
  120, 180, 210, 240, 270, 300, 330, 345, 360, 390, 420, 480, 525, 540, 570, 600, 630, 660, 720,
  765, 780, 840,
];

/** "UTC+2", "UTC+5:30", "UTC−3", "UTC". */
export const zoneLabel = (m: number) => {
  if (m === 0) return "UTC";
  const sign = m < 0 ? "−" : "+";
  const a = Math.abs(m);
  return `UTC${sign}${Math.floor(a / 60)}${a % 60 ? `:${String(a % 60).padStart(2, "0")}` : ""}`;
};

/** The zone list: this device's zone first, named, then every offset in use. */
function zoneOptions(local: string) {
  const at = Date.parse(local) || Date.now();
  const own = localOffset(at);
  return [
    { value: String(own), label: `Your time zone, ${zoneLabel(own)}` },
    ...OFFSETS.filter((m) => m !== own).map((m) => ({ value: String(m), label: zoneLabel(m) })),
  ];
}

/** The recording time a file states: Apple's key first (it carries the zone), else the movie header. */
export function recordedOf(
  tags: EditableTags | undefined,
): { utcMs: number; offsetMin?: number; source: "key" | "header" } | undefined {
  const key = tags?.recorded?.key ? parseQtDate(tags.recorded.key) : undefined;
  if (key) return { ...key, source: "key" };
  const h = tags?.recorded?.header;
  if (h && h > 0) return { utcMs: (h - MP4_EPOCH) * 1000, source: "header" };
  return undefined;
}

/** This browser's offset from UTC at that instant (summer time included), in minutes east. */
const localOffset = (utcMs: number) => -new Date(utcMs).getTimezoneOffset();

/** "YYYY-MM-DDTHH:MM:SS" wall-clock time of an instant at an offset. */
const wallClock = (utcMs: number, offsetMin: number) => formatQtDate(utcMs, offsetMin).slice(0, 19);

/** The instant after the change, from the file's own instant. */
export function afterChange(
  before: { utcMs: number } | undefined,
  c: DateChange | undefined,
): number | undefined {
  if (!c) return undefined;
  if (c.mode === "set") return setInstant(c);
  return before ? before.utcMs + c.seconds * 1000 : undefined;
}

export function DatePanel({ value, onChange, media, disabled }: OptionsPanelProps<DateOptions>) {
  const batch = (media.batch?.length ?? 0) > 1;
  const read = useEditable(media.file);
  const tags = read.status === "done" ? read.tags : undefined;
  const before = recordedOf(tags);
  const c = value.dates;
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  // Set as soon as the user changes anything, so the file's own date (read a moment later, in an
  // effect that may run before their change is rendered) never overwrites their choice.
  const touched = useRef(false);
  const change = (next: DateOptions) => {
    touched.current = true;
    onChange(next);
  };

  // Start "set" at the file's own date and zone, so only what the user changes moves.
  useEffect(() => {
    if (read.status !== "done") return;
    const { value: v, onChange: set } = latest.current;
    const b = recordedOf(read.tags);
    const was = b ? when(b.utcMs, b.offsetMin ?? localOffset(b.utcMs)) : "No recording date";
    // After the user has changed anything, their change wins; the Was row is then left out.
    if (touched.current || v.dates?.mode !== "set" || v.dates.local) return;
    const at = b?.utcMs ?? Date.now();
    const offsetMin = b?.offsetMin ?? localOffset(at);
    const local = wallClock(at, offsetMin);
    set({ ...v, was, from: `${local}/${offsetMin}`, dates: { mode: "set", local, offsetMin } });
  }, [read]);

  const mode = c?.mode ?? "set";
  const shift = c?.mode === "shift" ? c.seconds : 0;
  const parts = {
    sign: shift < 0 || (shift === 0 && value.earlier) ? -1 : 1,
    d: Math.floor(Math.abs(shift) / 86400),
    h: Math.floor((Math.abs(shift) % 86400) / 3600),
    m: Math.floor((Math.abs(shift) % 3600) / 60),
  };
  const setShift = (p: typeof parts) =>
    change({
      ...value,
      earlier: p.sign < 0,
      dates: { mode: "shift", seconds: p.sign * (p.d * 86400 + p.h * 3600 + p.m * 60) },
    });

  return (
    <div className="flex flex-col gap-6">
      <Field
        label="Change"
        labelId="date-mode"
        hint={
          batch
            ? "Several files: a shift moves each file's own date; a set date goes into every file."
            : "Shift fixes a camera clock that was wrong by a fixed amount."
        }
      >
        <Segmented<"set" | "shift">
          name="date-mode"
          aria-labelledby="date-mode"
          value={mode}
          onChange={(m) => {
            if (m === "shift") change({ ...value, dates: { mode: "shift", seconds: 0 } });
            else {
              const at = before?.utcMs ?? Date.now();
              const offsetMin = before?.offsetMin ?? localOffset(at);
              change({
                ...value,
                dates: { mode: "set", local: wallClock(at, offsetMin), offsetMin },
              });
            }
          }}
          options={[
            { value: "set", label: "Set a date" },
            { value: "shift", label: "Shift by" },
          ]}
        />
      </Field>
      {c?.mode === "set" ? (
        <>
          <Field
            label="Date and time"
            htmlFor="date-local"
            hint="The time on the clock where it was filmed."
          >
            <Input
              id="date-local"
              type="datetime-local"
              step={1}
              min="1970-01-01T00:00"
              max="2039-12-31T23:59:59"
              disabled={disabled}
              value={c.local}
              onChange={(e) => {
                const local = e.target.value;
                if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(local))
                  change({ ...value, dates: { ...c, local } });
              }}
            />
          </Field>
          <Field
            label="Time zone"
            htmlFor="date-zone"
            hint="Where it was filmed; apps convert to the viewer's zone."
          >
            <Select
              id="date-zone"
              value={String(c.offsetMin)}
              onValueChange={(z) => change({ ...value, dates: { ...c, offsetMin: Number(z) } })}
              options={zoneOptions(c.local)}
            />
          </Field>
        </>
      ) : (
        <>
          <Field label="Direction" labelId="shift-sign">
            <Segmented<"later" | "earlier">
              name="shift-sign"
              aria-labelledby="shift-sign"
              value={parts.sign < 0 ? "earlier" : "later"}
              onChange={(s) => setShift({ ...parts, sign: s === "earlier" ? -1 : 1 })}
              options={[
                { value: "later", label: "Later" },
                { value: "earlier", label: "Earlier" },
              ]}
            />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            {(
              [
                ["d", "Days", 36500],
                ["h", "Hours", 876000],
                ["m", "Minutes", 52560000],
              ] as const
            ).map(([k, label, max]) => (
              <Field key={k} label={label} htmlFor={`shift-${k}`}>
                <UnitField
                  id={`shift-${k}`}
                  label={label}
                  value={parts[k]}
                  min={0}
                  max={max}
                  onCommit={(n) => setShift({ ...parts, [k]: n })}
                />
              </Field>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** "4 May 2024, 10:20:30 UTC+2". */
const when = (utcMs: number, offsetMin: number) =>
  describeInstant(utcMs, offsetMin).replace(/ UTC.*$/, ` ${zoneLabel(offsetMin)}`);

/**
 * The hero: two labelled rows, Now and After (the new value carries the weight); when done, Now is
 * read back from the new copy and a muted Was row keeps the old date.
 */
export function DateCard({ file, value, phase, showing }: HeroProps<DateOptions>) {
  const result = showing === "result";
  const read = useEditable(file);
  const tags = read.status === "done" ? read.tags : undefined;
  const now = recordedOf(tags);
  const after = result ? undefined : afterChange(now, value?.dates);
  const zone =
    value?.dates?.mode === "set"
      ? value.dates.offsetMin
      : (now?.offsetMin ?? (now ? localOffset(now.utcMs) : 0));
  const nowZone = now ? (now.offsetMin ?? localOffset(now.utcMs)) : 0;
  const source = !now
    ? undefined
    : now.source === "key"
      ? "Written by the phone that filmed it, with its time zone."
      : "Stored without a time zone; shown in yours.";
  const reading = read.status === "reading" || phase === "inspecting";
  const row = "grid grid-cols-[4rem_minmax(0,1fr)] items-baseline gap-x-3";
  return (
    <section
      aria-label="Recording date"
      className={`rounded-md bg-bg-subtle p-4 md:p-6 ${reading ? "min-h-32" : ""}`}
      data-testid={result ? "dates-after" : "dates-before"}
    >
      <div role="status" aria-live="polite" className="flex flex-col gap-3">
        {reading ? (
          <p className="text-fg-muted text-sm">Reading the dates</p>
        ) : (
          <>
            <div className={row}>
              <span className="text-fg-muted text-sm">
                {result ? "Now" : after !== undefined ? "Now" : "Recorded"}
              </span>
              <p
                className={`tabular break-words ${after === undefined ? "text-h3" : "text-body"}`}
                data-testid="recorded-now"
              >
                {now ? when(now.utcMs, nowZone) : "No recording date"}
              </p>
            </div>
            {after !== undefined && (
              <div className={row}>
                <span className="text-fg-muted text-sm">After</span>
                <p className="tabular break-words text-h3" data-testid="recorded-after">
                  {when(after, zone)}
                </p>
              </div>
            )}
            {result && value?.was !== undefined && (
              <div className={row}>
                <span className="text-fg-muted text-sm">Was</span>
                <p className="tabular break-words text-fg-muted text-sm">{value.was}</p>
              </div>
            )}
            {source && !result && <p className="text-fg-muted text-xs">{source}</p>}
            {read.status === "failed" && <p className="text-sm">{read.message}</p>}
          </>
        )}
      </div>
    </section>
  );
}

/** The change in one sentence for the summary line. */
export function describeChange(c: DateChange | undefined): string {
  if (!c) return "";
  if (c.mode === "shift") return `Dates move ${describeShift(c.seconds)}`;
  return c.local ? `Date set to ${when(setInstant(c), c.offsetMin)}` : "";
}
