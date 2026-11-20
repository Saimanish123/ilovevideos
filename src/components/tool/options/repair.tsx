"use client";

import { useEffect } from "react";
import { withUnit } from "@/lib/format";
import type { Diagnosis } from "@/tools/engines/repair/diagnose";
import type { MediaInfo } from "@/tools/engines/types";
import type { OptionsPanelProps, OptionsSpec } from "./types";

/**
 * Repair video (ADR-0097). The file is read on the page (`inspect`), because the media inspector
 * refuses a file that stops early; the diagnosis is the panel, and the stage's preview plays the
 * repaired copy when done. `diag` is UI only (the engine diagnoses again).
 */
type O = { diag?: Diagnosis };

/** One diagnosis per File: the inspector and the panel share it, so a large file is read once. */
const cache = new WeakMap<File, Promise<Diagnosis>>();
function diagnoseOnce(file: File): Promise<Diagnosis> {
  let p = cache.get(file);
  if (!p) {
    p = import("@/tools/engines/repair/diagnose").then(({ diagnose }) => diagnose(file));
    cache.set(file, p);
  }
  return p;
}

const secs = (x: number) => withUnit(x.toFixed(1), "s");

/** The diagnosis in plain words: a headline and one sentence. */
export function describeDiagnosis(d: Diagnosis): { title: string; detail: string } {
  switch (d.kind) {
    case "intact":
      return {
        title: "Nothing is missing",
        detail:
          "Every frame the file lists is there. If it still does not play, it may use a codec this device cannot play; converting it to MP4 usually helps.",
      };
    case "truncated": {
      // Rounded down: the copy ends at the earliest gap of any track, and edit lists can shift it a little.
      const keep = Math.floor(d.keepSec * 10) / 10;
      return {
        title: `Stops early: the last ${secs(Math.max(0, d.statedSec - keep))} are missing`,
        detail: `${secs(keep)} of ${secs(d.statedSec)} can be saved into a file that plays and seeks.`,
      };
    }
    case "fragments-cut":
      return {
        title: "Stops early: the last part is cut off",
        detail: "Everything before the cut can be saved into a file that plays and seeks.",
      };
    case "matroska-cut":
      return {
        title: "Stops early: the file was never finished",
        detail:
          "Everything in it can be saved into a finished file that shows its length and seeks.",
      };
    case "no-index":
      return {
        title: "Cannot be repaired here",
        detail:
          "The recording stopped before the file was finished, so nothing in it says where each frame starts. Rebuilding that needs another recording from the same camera or app; the open-source desktop program untrunc can do it.",
      };
    default:
      return { title: "Not a video this page can read", detail: d.reason };
  }
}

export const repairSpec: OptionsSpec<O> = {
  verb: "Repair",
  defaults: () => ({}),
  batch: false,
  inspect: async (file: File): Promise<MediaInfo> => {
    const d = await diagnoseOnce(file);
    // Where the file opens at all, the media inspector names its tracks for the file card.
    if (d.kind !== "no-index" && d.kind !== "unknown") {
      try {
        const { inspect } = await import("@/tools/engines/mediabunny/shared");
        return await inspect(file);
      } catch {
        // Fall through to what the structure says.
      }
    }
    return {
      container:
        d.kind === "unknown" ? "unknown" : d.container === "mov" ? "QuickTime" : d.container,
      durationSec: d.kind === "truncated" ? d.statedSec : 0,
      sizeBytes: file.size,
      // Unknown tracks: say nothing about sound rather than "no audio".
      audio: [{ codec: "", channels: 0, sampleRate: 0 }],
    };
  },
  previewResult: true,
  // A stream copy: identical picture and sound (ADR-0134).
  compare: false,
  blocked: (o) => {
    const d = o.diag;
    if (!d) return "Reading the file";
    if (d.kind === "intact") return { reason: "Nothing to repair.", settled: true };
    if (d.kind === "no-index" || d.kind === "unknown") return "Not repairable in the browser.";
    return undefined;
  },
  summary: () => "Complete frames and sound copied into a new file · nothing re-encoded",
  result: () => ({ title: "Repaired", before: false }),
  nextStep: { slug: "video-info", label: "Check the repaired file" },
  Panel: DiagnosisPanel,
};

function DiagnosisPanel({ value, onChange, media }: OptionsPanelProps<O>) {
  useEffect(() => {
    let live = true;
    void diagnoseOnce(media.file).then((d) => {
      if (live && value.diag !== d) onChange({ ...value, diag: d });
    });
    return () => {
      live = false;
    };
  }, [media.file, value, onChange]);
  const words = value.diag && describeDiagnosis(value.diag);
  return (
    <div role="status" aria-live="polite" data-testid="diagnosis">
      {words ? (
        <>
          <p className="text-h3" data-testid="diagnosis-title">
            {words.title}
          </p>
          <p className="mt-1 text-fg-muted text-sm">{words.detail}</p>
        </>
      ) : (
        <p className="text-fg-muted text-sm">Reading the file</p>
      )}
    </div>
  );
}
