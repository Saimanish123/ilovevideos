/**
 * The key and tempo finder's result, and its words. Pure: the panel imports this without the engine.
 */
import { formatDuration } from "@/lib/format";
import type { KeyResult, TempoResult } from "../sound/dsp/music";

export interface MusicAnalysis {
  /** Seconds of sound analysed. */
  seconds: number;
  tempo: TempoResult;
  key: KeyResult;
}

/** "128 BPM", "119.7 BPM": whole numbers without a decimal. */
export function bpmWords(bpm: number): string {
  const r = Math.round(bpm * 10) / 10;
  return `${Number.isInteger(r) ? r.toFixed(0) : r.toFixed(1)} BPM`;
}

/** One line per file: "128 BPM · A minor · 8A". */
export function analysisLine(a: MusicAnalysis): string {
  const tempo = a.tempo.bpm !== undefined ? bpmWords(a.tempo.bpm) : "No steady beat";
  const key = a.key.name ? `${a.key.name} · ${a.key.camelot}` : "No clear key";
  return `${tempo} · ${key}`;
}

const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** A CSV of every analysed file (name, length, BPM, half, double, range, key, Camelot, ...). */
export function analysisCsv(rows: { name: string; analysis: MusicAnalysis }[]): string {
  const head = [
    "file",
    "length",
    "bpm",
    "half",
    "double",
    "bpm_min",
    "bpm_max",
    "key",
    "camelot",
    "relative",
    "confidence",
    "tuning_cents",
  ];
  const lines = rows.map(({ name, analysis: a }) =>
    [
      name,
      formatDuration(a.seconds),
      a.tempo.bpm?.toFixed(1) ?? "",
      a.tempo.half?.toFixed(1) ?? "",
      a.tempo.double?.toFixed(1) ?? "",
      a.tempo.range?.min.toFixed(1) ?? "",
      a.tempo.range?.max.toFixed(1) ?? "",
      a.key.name ?? "",
      a.key.camelot ?? "",
      a.key.relative ?? "",
      a.key.name ? a.key.confidence : "",
      a.key.name ? String(a.key.tuningCents) : "",
    ]
      .map(csvCell)
      .join(","),
  );
  return `${[head.join(","), ...lines].join("\n")}\n`;
}
