"use client";

import { useEffect, useId, useState } from "react";
import { docFor, inspectSubtitles, plannedFix } from "@/components/tool/subtitles/doc-cache";
import { SubtitleHero } from "@/components/tool/subtitles/subtitle-hero";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { NumberInput } from "@/components/ui/number-input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import {
  conversionNotes,
  formatNames,
  type SubtitleFormat,
  subtitleFormats,
} from "@/tools/engines/subtitles";
import { cueClock, offsetLabel, parseTime } from "@/tools/engines/subtitles/time";
import {
  type FixReport,
  type FrameRateId,
  fixTotal,
  frameRateIds,
  frameRates,
} from "@/tools/engines/subtitles/timing";
import {
  applyEdits,
  effectiveShift,
  type Job,
  jobs,
  type SubtitlesConvertOptions,
  targetOf,
} from "@/tools/engines/subtitles-convert/options";
import type { MediaInfo } from "@/tools/engines/types";
import type { OptionsSpec } from "./types";

/**
 * `earlier`: the direction chosen while the amount is still 0 (UI only; the engine's schema drops it).
 * A shift of 0 has no sign, so without it "Earlier" could not be chosen before typing an amount.
 */
type O = SubtitlesConvertOptions & { earlier?: boolean };

const isJob = (v: unknown): v is Job =>
  typeof v === "string" && (jobs as readonly string[]).includes(v);
const isFormat = (v: unknown): v is SubtitleFormat =>
  typeof v === "string" && (subtitleFormats as readonly string[]).includes(v);
const isRate = (v: unknown): v is FrameRateId =>
  typeof v === "string" && (frameRateIds as string[]).includes(v);

const count = (n: number, one = "cue", many = `${one}s`) =>
  `${n.toLocaleString("en")} ${n === 1 ? one : many}`;

const targetOptions = subtitleFormats.map((f) => ({ value: f, label: formatNames[f] }));
const rateOptions = frameRateIds.map((r) => ({ value: r, label: `${r} fps` }));

const problemCount = (info: MediaInfo) => fixTotal(plannedFix(info));

/** Each kind of repair, as it will be done ("to close") and as it was done ("closed"). */
function fixParts(r: FixReport, done: boolean): string[] {
  const v = (future: string, past: string) => (done ? past : future);
  return [
    r.overlapsFixed && `${count(r.overlapsFixed, "overlap")} ${v("to close", "closed")}`,
    r.reordered && `${count(r.reordered)} ${v("to move into order", "moved into order")}`,
    r.lengthsFixed && `${count(r.lengthsFixed)} ${v("to give a length", "given a length")}`,
    r.merged && `${count(r.merged, "pair")} starting together ${v("to join", "joined")}`,
    r.duplicatesRemoved && `${count(r.duplicatesRemoved, "repeat")} ${v("to remove", "removed")}`,
    r.emptyRemoved && `${count(r.emptyRemoved, "empty cue")} ${v("to remove", "removed")}`,
  ].filter(Boolean) as string[];
}

const joinParts = (parts: string[]) =>
  parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;

/** "1 overlap to close, 1 cue to move into order and 1 empty cue to remove". */
const problemList = (info: MediaInfo) => joinParts(fixParts(plannedFix(info), false));

const ratio = (o: O) => (o.fps ? frameRates[o.fps.from] / frameRates[o.fps.to] : 1);

export const subtitlesConvertSpec: OptionsSpec<O> = {
  verb: "Convert",
  inspect: inspectSubtitles,
  Hero: SubtitleHero,
  previewResult: true,
  // A text file: nothing to play side by side (ADR-0134).
  compare: false,
  nextStep: { slug: "add-subtitles-to-video", label: "Add subtitles to a video" },
  defaults: (info, preset) => {
    const job = isJob(preset.job) ? preset.job : "convert";
    const source = docFor(info)?.format ?? "srt";
    const to =
      job !== "convert"
        ? "keep"
        : isFormat(preset.to)
          ? preset.to
          : source === "srt"
            ? "vtt"
            : "srt";
    return {
      job,
      lockTarget: preset.lockTarget === true || undefined,
      to,
      shiftMs: 0,
      fix: job === "fix",
      txtTimes: false,
      fps:
        job === "fps"
          ? {
              from: isRate(preset.fpsFrom) ? preset.fpsFrom : "23.976",
              to: isRate(preset.fpsTo) ? preset.fpsTo : "25",
            }
          : undefined,
    };
  },
  blocked: (o, info) => {
    const doc = docFor(info);
    if (!doc) return "The subtitles could not be read.";
    if (o.job === "convert" && targetOf(o, doc) === doc.format && !o.fix)
      // A pair page has no format control: that is not a problem to fix but nothing to do.
      return o.lockTarget
        ? {
            reason: `Already ${formatNames[doc.format]}. Nothing to convert.`,
            settled: true,
            action: { slug: "subtitle-converter", label: "Convert to another format" },
          }
        : `This file is already ${formatNames[doc.format]}. Choose another format.`;
    if (o.job === "shift" && effectiveShift(o, doc) === 0)
      return "Enter how far to move the subtitles, or where the first line should appear.";
    if (o.job === "fps" && (!o.fps || o.fps.from === o.fps.to))
      return "Choose two different frame rates.";
    if (o.job === "fix" && problemCount(info) === 0)
      return {
        reason: "No timing problems found: every cue starts after the one before it ends.",
        settled: true,
      };
    return undefined;
  },
  summary: (o, info) => {
    const doc = docFor(info);
    if (!doc) return undefined;
    // Nothing to do (the settled line says so): no summary of a run that will not happen.
    if (o.job === "convert" && targetOf(o, doc) === doc.format && !o.fix) return undefined;
    if (o.job === "fix" && problemCount(info) === 0) return undefined;
    const edit = applyEdits(doc, o);
    const n = count(edit.doc.cues.length);
    const to = formatNames[targetOf(o, doc)];
    if (o.job === "shift") return `${n} move ${offsetLabel(edit.shift)}. Written as ${to}.`;
    if (o.job === "fps")
      return `Every time is multiplied by ${ratio(o).toFixed(4)}. Written as ${to}.`;
    if (o.job === "fix")
      return `${count(fixTotal(edit.fixReport ?? emptyReport), "change", "changes")}, ${n} written as ${to}.`;
    const lost = conversionNotes(doc, targetOf(o, doc)).lost.length;
    return `${n} to ${to}, ${lost === 0 ? "nothing lost" : `${count(lost, "kind of detail", "kinds of detail")} dropped (listed above)`}.`;
  },
  result: (o, info) => {
    const doc = docFor(info);
    if (!doc) return undefined;
    const edit = applyEdits(doc, o);
    const to = targetOf(o, doc);
    const n = count(edit.doc.cues.length);
    if (o.job === "shift") {
      const first = edit.doc.cues[0];
      const removed = edit.shiftReport?.removed ?? 0;
      return {
        change: false,
        title: `Moved ${offsetLabel(edit.shift)}: ${n}`,
        detail: `The first line now starts at ${cueClock(first?.start ?? 0)}.${
          removed > 0 ? ` ${count(removed)} that ended before 0:00 were removed.` : ""
        }`,
      };
    }
    if (o.job === "fps" && o.fps) {
      const last = doc.cues.reduce((m, c) => Math.max(m, c.end), 0);
      return {
        change: false,
        title: `Re-timed from ${o.fps.from} to ${o.fps.to} fps: ${n}`,
        detail: `The last line now ends at ${cueClock(last * ratio(o))} instead of ${cueClock(last)}.`,
      };
    }
    if (o.job === "fix") {
      const r = edit.fixReport ?? emptyReport;
      return {
        change: false,
        title: `Fixed ${count(fixTotal(r), "timing problem")}: ${n}`,
        detail: fixDetail(r),
      };
    }
    const lost = conversionNotes(doc, to).lost;
    return {
      change: false,
      title: `Converted to ${formatNames[to]}: ${n}`,
      // The loss list was shown before converting; the verdict repeats it in the past tense.
      detail:
        lost.length === 0
          ? "Every cue came through with its text and formatting."
          : lost
              .map((l) =>
                l.replace(/ (are|is) removed/, (_m, v: string) =>
                  v === "is" ? " was removed" : " were removed",
                ),
              )
              .join(" "),
    };
  },
  Panel({ value, onChange, info, preset }) {
    const doc = docFor(info);
    if (!doc) return null;
    const to = targetOf(value, doc);
    const expected = isFormat(preset.from) ? preset.from : undefined;
    const skipped = doc.issues.filter((i) => i.kind === "skipped");
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <p className="tabular text-sm">
            <span className="font-medium">{formatNames[doc.format]}</span>
            <span className="text-fg-muted">
              {" "}
              · {count(doc.cues.length)} ·{" "}
              {doc.encoding === "utf-8"
                ? "UTF-8"
                : doc.encoding === "windows-1252"
                  ? "Windows-1252"
                  : "UTF-16"}
            </span>
          </p>
          {expected && expected !== doc.format && (
            <p className="text-fg-muted text-xs">
              This file is {formatNames[doc.format]}, not {formatNames[expected]}. It converts the
              same way.
            </p>
          )}
          {doc.renamed && !expected && <p className="text-fg-muted text-xs">{doc.renamed}</p>}
          {doc.encoding === "windows-1252" && (
            <p className="text-fg-muted text-xs">
              Not UTF-8, so it was read as Windows-1252 and will be written as UTF-8. If accented
              letters look wrong in the list, save the file as UTF-8 in a text editor first.
            </p>
          )}
          {skipped.length > 0 && (
            <p className="text-fg-muted text-xs">
              {count(skipped.length, "block")} could not be read and{" "}
              {skipped.length === 1 ? "is" : "are"} left out. {skipped[0]?.message}
            </p>
          )}
        </div>
        {value.job === "convert" && (
          <ConvertControls value={value} onChange={onChange} info={info} preset={preset} to={to} />
        )}
        {value.job === "shift" && <ShiftControls value={value} onChange={onChange} info={info} />}
        {value.job === "fps" && <FpsControls value={value} onChange={onChange} info={info} />}
        {value.job === "fix" && <FixControls info={info} />}
      </div>
    );
  },
};

const emptyReport: FixReport = {
  emptyRemoved: 0,
  duplicatesRemoved: 0,
  lengthsFixed: 0,
  reordered: 0,
  overlapsFixed: 0,
  merged: 0,
};

function fixDetail(r: FixReport): string {
  const s = joinParts(fixParts(r, true));
  if (!s) return "Nothing needed changing.";
  return `${s.charAt(0).toUpperCase()}${s.slice(1)}.`;
}

interface ControlProps {
  value: O;
  onChange: (o: O) => void;
  info: MediaInfo;
}

function ConvertControls({
  value,
  onChange,
  info,
  preset,
  to,
}: ControlProps & { preset: Record<string, unknown>; to: SubtitleFormat }) {
  const doc = docFor(info);
  if (!doc) return null;
  const locked = preset.lockTarget === true;
  const notes = conversionNotes(doc, to);
  const problems = problemCount(info);
  return (
    <>
      {locked ? (
        <p className="text-fg-muted text-sm">
          Output <span className="font-medium text-fg">{formatNames[to]}</span>
        </p>
      ) : (
        <Field
          label="Output format"
          htmlFor="subtitle-to"
          hint="SRT plays almost everywhere; WebVTT is for web players; ASS keeps styling; TXT is the words only."
        >
          <Select
            id="subtitle-to"
            value={to}
            onValueChange={(t) => onChange({ ...value, to: t })}
            options={targetOptions}
          />
        </Field>
      )}
      <div>
        <p className="font-medium text-sm">What changes</p>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm">
          {notes.lost.map((l) => (
            <li key={l}>{l}</li>
          ))}
          {notes.lost.length === 0 && to !== doc.format && (
            <li>Nothing is lost: every cue and its text come through.</li>
          )}
          {notes.kept.map((k) => (
            <li key={k} className="text-fg-muted">
              {k}
            </li>
          ))}
        </ul>
      </div>
      {to === "txt" && (
        <Checkbox
          label="Start time before each line"
          hint="For finding a line in the video later, e.g. [1:02.50]."
          checked={value.txtTimes}
          onChange={(e) => onChange({ ...value, txtTimes: e.target.checked })}
        />
      )}
      {problems > 0 && (
        <Checkbox
          label={`Also fix ${count(problems, "timing problem")}`}
          hint={`${problemList(info)}. Each one is marked in the list.`}
          checked={value.fix}
          onChange={(e) => onChange({ ...value, fix: e.target.checked })}
        />
      )}
    </>
  );
}

/** Seconds as the user types them; the options hold whole milliseconds. */
function SecondsField({
  id,
  ms,
  onCommit,
}: {
  id: string;
  ms: number;
  onCommit: (ms: number) => void;
}) {
  const shown = String(Math.abs(ms) / 1000);
  const [text, setText] = useState(shown);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(shown);
  }, [shown, editing]);
  return (
    <NumberInput
      id={id}
      min={0}
      step={0.1}
      value={text}
      onFocus={() => setEditing(true)}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value.replace(",", "."));
        if (e.target.value.trim() !== "" && Number.isFinite(n) && n >= 0)
          onCommit(Math.round(n * 1000));
      }}
      onBlur={() => setEditing(false)}
    />
  );
}

function ShiftControls({ value, onChange, info }: ControlProps) {
  const doc = docFor(info);
  const howId = useId();
  const dirId = useId();
  const [firstText, setFirstText] = useState<string>();
  const [firstError, setFirstError] = useState<string>();
  if (!doc) return null;
  const mode = value.alignFirst === undefined ? "by" : "first";
  const first = doc.cues.reduce((m, c) => Math.min(m, c.start), Number.POSITIVE_INFINITY);
  const later = value.shiftMs !== 0 ? value.shiftMs > 0 : !value.earlier;
  const amount = Math.abs(value.shiftMs);
  return (
    <>
      <Field label="How to move them" labelId={howId}>
        <Segmented
          name="shift-mode"
          aria-labelledby={howId}
          value={mode}
          onChange={(m) =>
            onChange(
              m === "by"
                ? { ...value, alignFirst: undefined }
                : { ...value, alignFirst: Math.max(0, Math.round(first + value.shiftMs)) },
            )
          }
          options={[
            { value: "by", label: "Move by" },
            { value: "first", label: "First line at" },
          ]}
        />
      </Field>
      {mode === "by" ? (
        <>
          <Field
            label="Direction"
            labelId={dirId}
            hint="Subtitles that appear after the words are spoken need to move earlier."
          >
            <Segmented
              name="shift-direction"
              aria-labelledby={dirId}
              value={later ? "later" : "earlier"}
              onChange={(d) =>
                onChange({
                  ...value,
                  earlier: d === "earlier",
                  shiftMs: d === "later" ? amount : -amount,
                })
              }
              options={[
                { value: "earlier", label: "Earlier" },
                { value: "later", label: "Later" },
              ]}
            />
          </Field>
          <Field
            label="Amount"
            htmlFor="shift-amount"
            trailing="seconds"
            hint="Tenths and thousandths work: 0.25 is a quarter of a second."
          >
            <SecondsField
              id="shift-amount"
              ms={amount}
              onCommit={(ms) => onChange({ ...value, shiftMs: later ? ms : -ms })}
            />
          </Field>
          <div className="grid grid-cols-4 gap-2">
            {[-1000, -100, 100, 1000].map((d) => (
              <Button
                key={d}
                variant="secondary"
                size="sm"
                className="min-h-11 px-2"
                onClick={() => {
                  const shiftMs = value.shiftMs + d;
                  onChange({ ...value, shiftMs, earlier: shiftMs === 0 ? !later : shiftMs < 0 });
                }}
              >
                {offsetLabel(d)}
              </Button>
            ))}
          </div>
        </>
      ) : (
        <Field
          label="First line starts at"
          htmlFor="shift-first"
          hint={
            firstError ??
            `Now at ${cueClock(first)}. Type minutes and seconds, e.g. 1:02.5; every other line moves by the same amount.`
          }
        >
          <input
            id="shift-first"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            className="tabular h-10 pointer-coarse:h-11 w-full rounded-md border border-border bg-bg-raised px-3 text-fg text-sm focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
            value={firstText ?? cueClock(value.alignFirst ?? first)}
            onChange={(e) => {
              setFirstText(e.target.value);
              const raw = e.target.value.trim();
              const t = /^\d+(?:[.,]\d+)?$/.test(raw)
                ? Math.round(Number(raw.replace(",", ".")) * 1000)
                : parseTime(raw);
              if (t === undefined) setFirstError("Write the time as minutes:seconds, e.g. 1:02.5.");
              else {
                setFirstError(undefined);
                onChange({ ...value, alignFirst: t });
              }
            }}
            onBlur={() => {
              if (!firstError) setFirstText(undefined);
            }}
          />
        </Field>
      )}
    </>
  );
}

function FpsControls({ value, onChange, info }: ControlProps) {
  const doc = docFor(info);
  if (!doc || !value.fps) return null;
  const fps = value.fps;
  const last = doc.cues.reduce((m, c) => Math.max(m, c.end), 0);
  const k = ratio(value);
  return (
    <>
      <Field label="Subtitles were timed for" htmlFor="fps-from">
        <Select
          id="fps-from"
          value={fps.from}
          onValueChange={(from) => onChange({ ...value, fps: { ...fps, from } })}
          options={rateOptions}
        />
      </Field>
      <Field
        label="The video plays at"
        htmlFor="fps-to"
        hint="Check the video's frame rate with the video info tool if you are not sure."
      >
        <Select
          id="fps-to"
          value={fps.to}
          onValueChange={(to) => onChange({ ...value, fps: { ...fps, to } })}
          options={rateOptions}
        />
      </Field>
      <Button
        variant="secondary"
        size="sm"
        className="min-h-11 self-start"
        onClick={() => onChange({ ...value, fps: { from: fps.to, to: fps.from } })}
      >
        Swap the two rates
      </Button>
      {fps.from !== fps.to && (
        <p className="tabular text-sm">
          Every time is multiplied by {k.toFixed(4)}: the last line moves from {cueClock(last)} to{" "}
          {cueClock(last * k)}, {cueClock(Math.abs(last * k - last))} {k < 1 ? "earlier" : "later"}.
        </p>
      )}
    </>
  );
}

function FixControls({ info }: { info: MediaInfo }) {
  const problems = problemCount(info);
  // The settled line under the panel says there is nothing to fix.
  if (problems === 0) return null;
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p>
        <span className="font-medium">{count(problems, "problem")} found:</span> {problemList(info)}
        .
      </p>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-fg-muted">
        <li>Cues are put in time order.</li>
        <li>A cue that runs into the next one ends when the next one starts.</li>
        <li>Cues that start together are joined into one, one line each.</li>
        <li>
          A cue that ends before it starts stays up for its reading time, about 15 characters a
          second.
        </li>
        <li>Repeated and empty cues are removed.</li>
      </ul>
    </div>
  );
}
