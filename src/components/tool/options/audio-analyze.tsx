"use client";

import { Download } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { baseName } from "@/lib/format";
import {
  analysisCsv,
  analysisLine,
  bpmWords,
  type MusicAnalysis,
} from "@/tools/engines/audio-analyze/result";
import type { EngineClient, EngineFailure } from "@/tools/workers/client";
import { NextStep } from "../result-card";
import type { OptionsPanelProps, OptionsSpec, StageInput } from "./types";

/** Per file, by input id: being read, measured, or why not. */
type Row =
  | { kind: "working"; ratio: number }
  | { kind: "done"; analysis: MusicAnalysis }
  | { kind: "failed"; message: string }
  | { kind: "stopped" };

export interface AnalyzeView {
  results: Record<number, Row>;
  /** Which file's details the panel shows (input id); the first by default. */
  shown?: number;
  /** Stop was pressed: files not yet read wait until "Analyse the rest". */
  stopped?: boolean;
}

const MAX_SONGS = 50;

/** Runs the analysis of every input that has none yet, one at a time, in the engine worker. */
function useAnalyses(inputs: StageInput[], value: AnalyzeView, onChange: (v: AnalyzeView) => void) {
  const latest = useRef(value);
  latest.current = value;
  const change = useRef(onChange);
  change.current = onChange;
  const busy = useRef(false);
  const client = useRef<EngineClient | null>(null);
  const controller = useRef<AbortController | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(
    () => () => {
      controller.current?.abort();
      client.current?.dispose();
    },
    [],
  );

  const stopped = value.stopped === true;
  useEffect(() => {
    if (stopped) controller.current?.abort();
  }, [stopped]);

  useEffect(() => {
    void tick;
    if (busy.current || latest.current.stopped) return;
    const next = inputs.find((i) => {
      const r = latest.current.results[i.id];
      return !r || r.kind === "stopped";
    });
    if (!next) return;
    busy.current = true;
    const set = (row: Row) => {
      // Progress can arrive faster than renders: build on the last value sent, not the last render.
      latest.current = {
        ...latest.current,
        results: { ...latest.current.results, [next.id]: row },
      };
      change.current(latest.current);
    };
    set({ kind: "working", ratio: 0 });
    void (async () => {
      try {
        if (!client.current) {
          const { EngineClient } = await import("@/tools/workers/client");
          client.current = new EngineClient();
        }
        const c = new AbortController();
        controller.current = c;
        const r = await client.current.run(
          "audio-analyze",
          next.file,
          {},
          {
            info: next.info,
            signal: c.signal,
            onProgress: (p) => set({ kind: "working", ratio: p.ratio }),
          },
        );
        set({ kind: "done", analysis: JSON.parse(await r.blob.text()) as MusicAnalysis });
      } catch (e) {
        const err = e as EngineFailure;
        set(
          err.code === "cancelled"
            ? { kind: "stopped" }
            : { kind: "failed", message: err.message || "This file could not be read." },
        );
      } finally {
        busy.current = false;
        setTick((t) => t + 1);
      }
    })();
  }, [inputs, tick, stopped]);
}

function Readout({ a, file }: { a: MusicAnalysis; file: File }) {
  const { tempo, key } = a;
  const tempoId = useId();
  const keyId = useId();
  const tuning = key.name && Math.abs(key.tuningCents) >= 10 ? key.tuningCents : 0;
  const facts: [string, string][] = key.name
    ? [
        ["Relative key", key.relative ?? ""],
        [
          "Confidence",
          `${key.confidence === "high" ? "High" : key.confidence === "medium" ? "Medium" : "Low"}${
            key.confidence !== "high" && key.next ? `; next most likely ${key.next}` : ""
          }`,
        ],
        ...(tuning !== 0
          ? ([
              [
                "Tuning",
                `${Math.abs(tuning)} cents ${tuning > 0 ? "sharp" : "flat"} of A = 440 Hz`,
              ],
            ] as [string, string][])
          : []),
      ]
    : [];
  return (
    <div className="flex flex-col gap-6" data-testid="key-bpm-result">
      <section aria-labelledby={tempoId}>
        <p id={tempoId} className="font-medium text-fg-muted text-sm">
          Tempo
        </p>
        {tempo.bpm !== undefined ? (
          <>
            <p className="tabular mt-1 text-h2">{bpmWords(tempo.bpm)}</p>
            <p className="tabular mt-1 text-fg-muted text-sm">
              {tempo.range
                ? `Average; it moves between ${bpmWords(tempo.range.min)} and ${bpmWords(tempo.range.max)}. Also reads as ${bpmWords(tempo.half ?? 0)} or ${bpmWords(tempo.double ?? 0)}.`
                : `Also reads as ${bpmWords(tempo.half ?? 0)} or ${bpmWords(tempo.double ?? 0)}.`}
            </p>
          </>
        ) : (
          <>
            <p className="mt-1 text-h3">No steady beat</p>
            <p className="mt-1 text-fg-muted text-sm">
              Speech, free-tempo and ambient recordings have no beat grid to count.
            </p>
          </>
        )}
      </section>
      <section aria-labelledby={keyId}>
        <p id={keyId} className="font-medium text-fg-muted text-sm">
          Key
        </p>
        {key.name ? (
          <>
            <p className="mt-1 text-h2">
              {key.name}
              <span className="tabular ml-3 text-fg-muted text-h3">{key.camelot}</span>
            </p>
            <dl className="mt-2 flex flex-col gap-1 text-sm">
              {facts.map(([term, detail]) => (
                <div key={term} className="flex gap-4">
                  <dt className="w-28 shrink-0 text-fg-muted">{term}</dt>
                  <dd className="tabular min-w-0">{detail}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : (
          <>
            <p className="mt-1 text-h3">No clear key</p>
            <p className="mt-1 text-fg-muted text-sm">
              There is too little pitched sound to tell, as in speech or drums alone.
            </p>
          </>
        )}
      </section>
      <NextStep slug="change-audio-pitch" label="Change the key" file={file} />
    </div>
  );
}

function AnalyzePanel({ value, onChange, media }: OptionsPanelProps<AnalyzeView>) {
  const inputs = media.inputs ?? [];
  useAnalyses(inputs, value, onChange);
  const shownId =
    value.shown !== undefined && inputs.some((i) => i.id === value.shown)
      ? value.shown
      : inputs[0]?.id;
  const shown = inputs.find((i) => i.id === shownId);
  const row = shownId !== undefined ? value.results[shownId] : undefined;
  const done = inputs.flatMap((i) => {
    const r = value.results[i.id];
    return r?.kind === "done" ? [{ name: i.file.name, analysis: r.analysis }] : [];
  });
  const finished = inputs.filter((i) => {
    const k = value.results[i.id]?.kind;
    return k === "done" || k === "failed";
  }).length;
  const running = !value.stopped && finished < inputs.length;

  const download = () => {
    const blob = new Blob([analysisCsv(done)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${inputs.length === 1 ? baseName(inputs[0]?.file.name ?? "song") : "songs"}-key-bpm.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="flex flex-col gap-6">
      {row?.kind === "done" && shown ? (
        <Readout a={row.analysis} file={shown.file} />
      ) : row?.kind === "failed" ? (
        <p className="text-sm">{row.message}</p>
      ) : (
        // Progress is on the file's row; this only says what will appear here.
        <p className="text-fg-muted text-sm">
          {row?.kind === "stopped"
            ? "Not analysed"
            : "Tempo and key appear here when the song is read."}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-3">
          {inputs.length > 1 && (
            <Button onClick={download} disabled={done.length === 0}>
              <Download size={16} strokeWidth={1.5} aria-hidden />
              Download results (CSV)
            </Button>
          )}
          {running && inputs.length > 1 && (
            <Button onClick={() => onChange({ ...value, stopped: true })}>Stop</Button>
          )}
          {value.stopped && finished < inputs.length && (
            <Button onClick={() => onChange({ ...value, stopped: false })}>Analyse the rest</Button>
          )}
        </div>
        {inputs.length > 1 && (
          <p className="tabular text-fg-muted text-xs">
            {done.length === 0
              ? "Available once the first song is analysed."
              : `${finished} of ${inputs.length} analysed`}
          </p>
        )}
        {/* Announced once, when every song is read; the rows carry the progress. */}
        <p className="sr-only" aria-live="polite">
          {!running && finished === inputs.length && inputs.length > 0
            ? `All ${inputs.length} analysed`
            : ""}
        </p>
      </div>
    </div>
  );
}

export const audioAnalyzeSpec: OptionsSpec<AnalyzeView> = {
  verb: "Find key and BPM",
  Panel: AnalyzePanel,
  multiple: {
    min: 1,
    max: MAX_SONGS,
    noun: "song",
    collapseAfter: 6,
    unordered: true,
    // Each row selects the song whose details the panel shows.
    selected: (value, inputs) => {
      const i = inputs.findIndex((x) => x.id === value.shown);
      return i >= 0 ? i : 0;
    },
    select: (value, index, inputs) => ({ ...value, shown: inputs[index]?.id }),
  },
  noAction: true,
  defaults: () => ({ results: {} }),
  inputNotes: (value, inputs) =>
    inputs.map((i) => {
      const r = value.results[i.id];
      if (!i.info.audio?.length) return "No sound track.";
      if (!r) return value.stopped ? "Not analysed" : "Waiting";
      if (r.kind === "working") return `Listening, ${Math.round(r.ratio * 100)}%`;
      if (r.kind === "failed") return r.message;
      if (r.kind === "stopped") return "Not analysed";
      return analysisLine(r.analysis);
    }),
};
