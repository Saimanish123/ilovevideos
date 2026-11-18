"use client";

import { Check } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ProgressLine } from "@/components/ui/progress-line";
import type { MediaInfo, Progress } from "@/tools/engines/types";
import type { EngineClient, RunResult, RunResultFile } from "@/tools/workers/client";
import { FileList, type ListInput, type QueueStatus } from "./file-list";
import { type Blocked, blockOf, type OptionsSpec, type StageInput } from "./options/types";
import { withoutFirst } from "./reading";
import { ResultFiles } from "./result-files";
import {
  acceptFor,
  inspectFile,
  nounFor,
  phaseLabel,
  runJob,
  Shell,
  type StageTool,
  toFailure,
} from "./stage-run";

// biome-ignore lint/suspicious/noExplicitAny: heterogeneous option shapes; each spec is typed internally
type AnySpec = OptionsSpec<any>;

/** A queued file. `info` is missing when the file could not be read; `readError` then says why. */
interface Row extends ListInput {
  readError?: string;
}

interface Outcome {
  status: QueueStatus;
  output?: RunResultFile;
  ffmpegCommand?: string;
}

type Phase = "ready" | "processing" | "done";

/**
 * Batch mode of the stage (feature catalog L1, free and unlimited per ADR-0012): several files on a
 * single-file tool share one set of options, taken from the first readable file. Each file is asked
 * `spec.blocked` on its own, so one that is blocked or already settled is skipped with its reason.
 * Files run one at a time through the same `runJob` as a single file, to bound memory; a failure
 * never stops the rest; Cancel (or Escape) stops the current file and everything after it. Every row
 * gets its own status and Download, and one ZIP holds every output.
 */
export function BatchStage({
  tool,
  spec,
  verb,
  preset,
  initial,
  getClient,
  onReset,
}: {
  tool: StageTool;
  spec: AnySpec;
  verb: string;
  preset: Record<string, unknown>;
  /** The files that started the batch. */
  initial: File[];
  getClient: () => Promise<EngineClient>;
  /** Back to the idle drop zone (Start over, or the last row removed). */
  onReset: () => void;
}) {
  const noun = nounFor(tool.accepts);
  const plural = (n: number) => `${n.toLocaleString("en")} ${noun}${n === 1 ? "" : "s"}`;
  const accept = useMemo(() => acceptFor(tool.accepts), [tool.accepts]);
  const [rows, setRows] = useState<Row[]>([]);
  const [reading, setReading] = useState<File[]>([]);
  const pending = reading.length;
  const [options, setOptions] = useState<unknown>();
  const [phase, setPhase] = useState<Phase>("ready");
  const [outcomes, setOutcomes] = useState<Map<number, Outcome>>(new Map());
  const [current, setCurrent] = useState<{ id: number; step: number; progress: Progress }>();
  const nextId = useRef(1);
  const abortRef = useRef<AbortController | null>(null);
  // Panels get a preview ref; a batch has no preview, so it stays empty.
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const readable = useMemo(
    () => rows.filter((r): r is Row & { info: MediaInfo } => r.info !== undefined),
    [rows],
  );
  const first = readable[0];

  /** Reads files one after another and appends each as a row; unreadable files become failed rows. */
  const addFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setReading((r) => [...r, ...files]);
      const client = await getClient();
      for (const file of files) {
        const id = nextId.current++;
        try {
          const info = await inspectFile(spec, client, file, tool.accepts);
          setRows((r) => [...r, { id, file, info }]);
          setOptions((o: unknown) => (o === undefined ? spec.defaults(info, preset) : o));
        } catch (e) {
          const err = toFailure(e);
          // The reader's own sentence says what is wrong; the hint says what it takes instead.
          const reason = [err.message || "This file could not be read.", err.hint]
            .filter(Boolean)
            .join(" ");
          setRows((r) => [...r, { id, file, readError: reason }]);
        } finally {
          setReading((r) => withoutFirst(r, file));
        }
      }
    },
    [getClient, spec, preset],
  );

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void addFiles(initial);
  }, [addFiles, initial]);

  const removeRow = useCallback(
    (index: number) => {
      if (rows.length <= 1) onReset();
      else setRows((r) => r.filter((_, i) => i !== index));
    },
    [rows.length, onReset],
  );

  // Per-file answers under the shared options: blocked (skipped with the reason) or runnable.
  const blocks = useMemo(() => {
    const m = new Map<number, Blocked | undefined>();
    if (options === undefined) return m;
    for (const r of readable)
      m.set(r.id, blockOf(spec.blocked?.(options, r.info, undefined, r.file)));
    return m;
  }, [options, readable, spec]);
  const runnable = readable.filter((r) => blocks.get(r.id) === undefined);
  const unreadable = rows.length - readable.length;
  const allSettled =
    readable.length > 0 && unreadable === 0 && readable.every((r) => blocks.get(r.id)?.settled);

  const run = useCallback(async () => {
    if (options === undefined || runnable.length === 0) return;
    const controller = new AbortController();
    abortRef.current = controller;
    const jobs = runnable;
    const results = new Map<number, Outcome>();
    for (const r of jobs) results.set(r.id, { status: { kind: "waiting" } });
    setOutcomes(new Map(results));
    setPhase("processing");
    let cancelled = false;
    for (const [step, row] of jobs.entries()) {
      if (controller.signal.aborted) {
        cancelled = true;
        break;
      }
      const start: Progress = { phase: "loading", ratio: 0 };
      setCurrent({ id: row.id, step, progress: start });
      const label = (p: Progress) => p.detail ?? phaseLabel(p.phase);
      setOutcomes((m) =>
        new Map(m).set(row.id, { status: { kind: "working", ratio: 0, label: label(start) } }),
      );
      try {
        const result: RunResult = await runJob(
          tool.engine,
          spec,
          getClient,
          { file: row.file, info: row.info, options },
          {
            signal: controller.signal,
            onProgress: (progress) => {
              setCurrent({ id: row.id, step, progress });
              setOutcomes((m) =>
                new Map(m).set(row.id, {
                  status: { kind: "working", ratio: progress.ratio, label: label(progress) },
                }),
              );
            },
          },
        );
        const verdict = spec.result?.(options, row.info, { bytes: result.blob.size, files: 1 });
        const outcome: Outcome = {
          status: {
            kind: "done",
            blob: result.blob,
            filename: result.filename,
            title: verdict?.title,
            missed: verdict?.missed,
            showChange: verdict?.change !== false,
          },
          output: { blob: result.blob, filename: result.filename, meta: result.meta },
          ffmpegCommand: result.ffmpegCommand,
        };
        results.set(row.id, outcome);
        setOutcomes((m) => new Map(m).set(row.id, outcome));
      } catch (e) {
        const err = toFailure(e);
        if (err.code === "cancelled" || controller.signal.aborted) {
          cancelled = true;
          break;
        }
        // One file failing never stops the others (production principles, failure handling).
        const outcome: Outcome = {
          status: { kind: "failed", reason: [err.message, err.hint].filter(Boolean).join(" ") },
        };
        results.set(row.id, outcome);
        setOutcomes((m) => new Map(m).set(row.id, outcome));
      }
    }
    abortRef.current = null;
    setCurrent(undefined);
    const anyDone = [...results.values()].some((o) => o.output);
    if (cancelled) {
      for (const [id, o] of results)
        if (o.status.kind === "waiting" || o.status.kind === "working")
          results.set(id, { status: { kind: "cancelled" } });
      if (!anyDone) {
        // Nothing finished: back to ready with the same files and settings, as a single file does.
        setOutcomes(new Map());
        setPhase("ready");
        return;
      }
    }
    setOutcomes(new Map(results));
    setPhase("done");
  }, [options, runnable, spec, tool.engine, getClient]);

  const cancel = useCallback(() => abortRef.current?.abort(), []);
  const startOver = useCallback(() => {
    abortRef.current?.abort();
    onReset();
  }, [onReset]);
  // Leaving the page (or Start over) mid-run stops the current job.
  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (phase !== "processing") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, cancel]);

  // One status per row: the run's outcome, else why the file is skipped or could not be read.
  const queue = rows.map((r): QueueStatus | undefined => {
    const o = outcomes.get(r.id);
    if (o) return o.status;
    if (r.readError) return { kind: "unreadable", reason: r.readError };
    const b = blocks.get(r.id);
    if (b) return { kind: "skipped", reason: b.reason };
    return undefined;
  });

  const done = [...outcomes.entries()].filter(([, o]) => o.output);
  const outputs = done.map(([, o]) => o.output as RunResultFile);
  const processedBytes = done.reduce(
    (s, [id]) => s + (rows.find((r) => r.id === id)?.file.size ?? 0),
    0,
  );
  const firstDone = done[0];
  const firstDoneName = firstDone && rows.find((r) => r.id === firstDone[0])?.file.name;
  const count = (kind: QueueStatus["kind"]) => queue.filter((q) => q?.kind === kind).length;
  const missed = [...outcomes.values()].filter(
    (o) => o.status.kind === "done" && o.status.missed,
  ).length;

  // Real progress over the whole queue: finished files plus the current file's own ratio.
  const overall = current
    ? (current.step + Math.max(0, Math.min(1, current.progress.ratio))) / Math.max(1, outcomes.size)
    : 0;

  const list = (
    <FileList
      inputs={rows}
      queue={queue}
      disabled={phase !== "ready"}
      reading={reading}
      accept={accept}
      max={Number.POSITIVE_INFINITY}
      noun={noun}
      onMove={() => undefined}
      onRemove={removeRow}
      onAdd={addFiles}
    />
  );

  // Nothing readable yet, or nothing readable at all.
  if (!first || options === undefined) {
    return (
      <Shell>
        <div className="flex flex-col gap-6">
          {rows.length > 0 && list}
          {pending > 0 ? (
            <p className="text-fg-muted text-sm" aria-live="polite">
              {pending > 1 ? `Reading ${pending} files` : "Reading the file"}
            </p>
          ) : (
            <div className="flex flex-col gap-4" role="alert">
              <p className="text-body">
                None of these files could be read, so there is nothing to run. Each row says why.
              </p>
              <div>
                <Button variant="ghost" size="md" onClick={startOver}>
                  Start over
                </Button>
              </div>
            </div>
          )}
        </div>
      </Shell>
    );
  }

  const readyLine =
    pending > 0
      ? `Reading ${pending} more ${pending === 1 ? "file" : "files"}`
      : runnable.length === 0
        ? `Nothing to run: every ${noun} is skipped or could not be read. Each row says why.`
        : runnable.length === readable.length
          ? `${plural(runnable.length)} with these settings, one after another. Runs on this device.`
          : // Counted among what can be read: a file that cannot be read is not one of the videos.
            `${runnable.length.toLocaleString("en")} of ${plural(readable.length)} will run, one after another; each row says why the others will not. Runs on this device.`;

  const summaryDetail = [
    count("skipped") && `${count("skipped")} skipped`,
    count("failed") && `${count("failed")} failed`,
    count("unreadable") && `${count("unreadable")} could not be read`,
    count("cancelled") && `${count("cancelled")} cancelled`,
    missed && `${missed} missed ${missed === 1 ? "its" : "their"} target`,
  ].filter(Boolean);

  return (
    <Shell>
      {phase === "processing" && (
        <div className="absolute inset-x-0 top-0 overflow-hidden rounded-t-lg">
          <ProgressLine ratio={overall} label={`${verb} progress, all files`} />
        </div>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_var(--container-panel)]">
        <div className="flex flex-col gap-4">{list}</div>
        {/* As on the single stage: on phones this column dissolves into the grid so the action bar
            sticks to the viewport for the whole workspace. */}
        <div className="contents lg:flex lg:flex-col lg:gap-6">
          {phase !== "done" && (
            <>
              <fieldset
                disabled={phase === "processing"}
                className="flex flex-col gap-6 disabled:opacity-60"
              >
                <spec.Panel
                  value={options}
                  onChange={(next: unknown) => {
                    if (phase === "ready") setOptions(next);
                  }}
                  info={first.info}
                  preset={preset}
                  media={{ file: first.file, video: videoRef, batch: readable as StageInput[] }}
                />
              </fieldset>
              <p className="text-fg-muted text-sm" role="status" aria-live="polite">
                {phase === "processing" && current
                  ? `${noun[0]?.toUpperCase()}${noun.slice(1)} ${current.step + 1} of ${outcomes.size}: ${
                      current.progress.detail ?? phaseLabel(current.progress.phase)
                    }`
                  : allSettled
                    ? ""
                    : readyLine}
              </p>
              {phase === "ready" && allSettled && pending === 0 ? (
                // Every file already does the job: the answer sits where the button would be.
                <div className="-mx-6 sticky bottom-0 mt-auto flex items-start gap-3 border-border border-t bg-bg-raised px-6 py-3 lg:static lg:m-0 lg:border-0 lg:p-0">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-fg text-bg-raised">
                    <Check size={16} strokeWidth={1.5} aria-hidden />
                  </span>
                  <p className="text-body">
                    {`Every ${noun} already does the job, so nothing needs to run. Each row says why.`}
                  </p>
                </div>
              ) : (
                <div className="-mx-6 sticky bottom-0 mt-auto flex items-center gap-3 border-border border-t bg-bg-raised px-6 py-3 lg:static lg:m-0 lg:border-0 lg:p-0">
                  {phase === "ready" ? (
                    <Button
                      variant="primary"
                      size="lg"
                      className="w-full"
                      onClick={run}
                      data-action="run"
                      disabled={pending > 0 || runnable.length === 0}
                    >
                      {verb}
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      size="lg"
                      className="w-full"
                      onClick={cancel}
                      data-action="cancel"
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              )}
            </>
          )}

          {phase === "done" &&
            (outputs.length > 0 ? (
              <ResultFiles
                files={outputs}
                sourceName={first.file.name}
                beforeBytes={processedBytes}
                list={false}
                zipName={`${tool.slug}-${outputs.length}-files.zip`}
                ffmpegCommand={firstDone?.[1].ffmpegCommand}
                ffmpegLabel={
                  firstDoneName
                    ? `The same operation with ffmpeg, for ${firstDoneName}`
                    : "The same operation with ffmpeg"
                }
                verdict={{
                  title:
                    outputs.length === readable.length
                      ? `${plural(outputs.length)} ready`
                      : `${outputs.length.toLocaleString("en")} of ${plural(readable.length)} ready`,
                  detail: summaryDetail.length
                    ? `${summaryDetail.join(", ")}; each row says why.`
                    : undefined,
                }}
                onStartOver={startOver}
              />
            ) : (
              <div className="flex flex-col gap-4" role="alert">
                <p className="text-body">{`No ${noun} could be processed. Each row says why.`}</p>
                <div className="flex gap-3">
                  <Button
                    variant="primary"
                    size="md"
                    onClick={() => {
                      setOutcomes(new Map());
                      setPhase("ready");
                    }}
                  >
                    Try again
                  </Button>
                  <Button variant="ghost" size="md" onClick={startOver}>
                    Start over
                  </Button>
                </div>
              </div>
            ))}
        </div>
      </div>
    </Shell>
  );
}
