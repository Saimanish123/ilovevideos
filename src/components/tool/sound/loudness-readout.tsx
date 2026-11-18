"use client";

import { formatLevel } from "@/tools/engines/sound/dsp/loudness";
import type { SoundAnalysisState } from "./use-sound-analysis";

/** The meter's scale, LUFS: quiet speech sits near the left, loud masters near the right. */
const FLOOR = -40;
const TOP = 0;
const pos = (lufs: number) =>
  Number.isFinite(lufs) ? Math.min(1, Math.max(0, (lufs - FLOOR) / (TOP - FLOOR))) : 0;

/**
 * Loudness before and after, measured on this device: integrated loudness (EBU R128) as a bar on a
 * −40 to 0 LUFS scale with the number beside it, and the true peak. "After" is the plan until the
 * job runs (the result line then gives the measured output). Numbers are tabular; the bars are plain
 * `fg` and `fg-muted` fills, no colour.
 */
export function LoudnessReadout({
  analysis,
  after,
  afterNote,
}: {
  analysis: SoundAnalysisState;
  /** Planned loudness and true peak after the job, when known. */
  after?: { integrated: number; truePeak: number; limited?: boolean };
  /** One line under the readout, e.g. "Peaks over −1.0 dBTP are limited, by about 3 dB". */
  afterNote?: string;
}) {
  if (analysis.status === "failed")
    return (
      <p className="text-fg-muted text-sm">
        The loudness could not be measured here. {analysis.message}
      </p>
    );
  const before = analysis.result?.loudness;
  const measuring = analysis.status === "measuring";
  const row = (
    label: string,
    lufs: number | undefined,
    peak: number | undefined,
    strong: boolean,
    peakNote?: string,
  ) => (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-3">
        <span aria-hidden className="w-12 shrink-0 text-fg-muted text-sm">
          {label}
        </span>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-bg-subtle" aria-hidden>
          <div
            className={`h-full rounded-full ${strong ? "bg-fg" : "bg-fg-muted"}`}
            style={{ width: `${(lufs === undefined ? 0 : pos(lufs)) * 100}%` }}
          />
        </div>
      </div>
      <p className="tabular pl-15 text-sm">
        <span className="sr-only">{label}: </span>
        {lufs === undefined ? (
          <span className="text-fg-muted">not measured</span>
        ) : (
          <span className="font-medium">{formatLevel(lufs, "LUFS")}</span>
        )}
        {peak !== undefined && (
          <span className="text-fg-muted">
            {" "}
            · true peak {formatLevel(peak, "dBTP")}
            {peakNote ? ` ${peakNote}` : ""}
          </span>
        )}
      </p>
    </div>
  );
  return (
    <div className="flex flex-col gap-3">
      {/* Announced when measuring starts and when the result is in, not on every percentage step. */}
      <span className="sr-only" aria-live="polite">
        {measuring
          ? "Measuring the loudness"
          : before?.integrated !== undefined
            ? `Now ${formatLevel(before.integrated, "LUFS")}${after?.integrated !== undefined ? `, after ${formatLevel(after.integrated, "LUFS")}` : ""}`
            : ""}
      </span>
      {measuring ? (
        <p className="tabular text-fg-muted text-sm">
          Measuring the loudness on this device, {Math.round(analysis.ratio * 100)}%
        </p>
      ) : (
        <>
          {row("Now", before?.integrated, before?.truePeak, !after)}
          {after &&
            row(
              "After",
              after.integrated,
              after.truePeak,
              true,
              after.limited ? "(limited)" : undefined,
            )}
          {afterNote && <p className="text-fg-muted text-xs">{afterNote}</p>}
        </>
      )}
    </div>
  );
}
