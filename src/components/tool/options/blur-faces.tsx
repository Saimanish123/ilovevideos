"use client";

import { ScanFace } from "lucide-react";
import { useLocale } from "next-intl";
import { type RefObject, useEffect, useRef, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { ProgressLine } from "@/components/ui/progress-line";
import { cn } from "@/lib/cn";
import {
  type BlurRegionOptions,
  defaultRegion,
  MAX_REGIONS,
  nextRegionId,
  type Region,
} from "@/tools/engines/blur-region/options";
import type { MediaInfo } from "@/tools/engines/types";
import type { FaceFailure, FaceFindFailure } from "@/tools/workers/face-find-client";

/**
 * Find faces on the blur page (ADR-0113): a button that samples the video, finds and follows the
 * faces in a worker (tools/workers/face-find.worker, loaded on the first press with its 122 kB
 * model) and adds one moving ellipse region per face for the user to check. The search's state
 * lives in the options as a page-only `find` (the engine's schema drops it), so the page can hold
 * the Blur button while it runs.
 */

export interface FindState {
  phase: "loading" | "finding" | "done" | "error";
  done: number;
  total: number;
  /** Faces found (tracks), regions made from them that fitted, and those left out. */
  found?: number;
  kept?: number;
  left?: number;
  message?: string;
}

export type FacesValue = BlurRegionOptions & { find?: FindState };

export const finding = (o: FacesValue) =>
  o.find?.phase === "loading" || o.find?.phase === "finding";

/** The region a file starts with, still where it was put: found faces replace it. */
function untouched(o: FacesValue, src: { width: number; height: number }) {
  if (o.regions.length !== 1) return false;
  const r = o.regions[0] as Region;
  const d = defaultRegion(r.id, src);
  const k = r.keys[0];
  const dk = d.keys[0];
  return (
    !r.face &&
    !r.moving &&
    r.shape === "rect" &&
    r.start === 0 &&
    r.end === undefined &&
    r.keys.length === 1 &&
    !!k &&
    !!dk &&
    Math.abs(k.x - dk.x) < 1e-9 &&
    Math.abs(k.y - dk.y) < 1e-9 &&
    Math.abs(k.w - dk.w) < 1e-9 &&
    Math.abs(k.h - dk.h) < 1e-9
  );
}

/** What went wrong and what to do, in our words: the worker's own text never reaches the page. */
const FAILURES: Record<FaceFailure, string> = {
  model: "The face finder could not be loaded. Check the connection and try again.",
  graphics:
    "This browser's graphics cannot run the face finder. Draw over the faces, or try a recent Chrome or Edge on a computer.",
  gpu: "The graphics chip stopped the face search. Try again, or close other tabs that use graphics.",
  decode:
    "This browser cannot decode this video's picture. Convert it to MP4 first, then find faces.",
};
export const FAILED = "The face search stopped. Try again, or draw over the faces.";

/** Runs the search; `start` is the button, `cancel` the button beside the progress line. */
export function useFindFaces(
  value: FacesValue,
  onChange: (v: FacesValue) => void,
  info: MediaInfo,
  file: File,
) {
  const latest = useRef(value);
  latest.current = value;
  const job = useRef<AbortController | null>(null);
  // Leaving the page (Start over, another file) ends the search and its worker.
  useEffect(() => () => job.current?.abort(), []);

  const set = (find: FindState | undefined, extra: Partial<FacesValue> = {}) =>
    onChange({ ...latest.current, ...extra, find });

  const start = async () => {
    const v = info.video;
    if (!v || job.current || latest.current.regions.length >= MAX_REGIONS) return;
    const ac = new AbortController();
    job.current = ac;
    set({ phase: "loading", done: 0, total: 0 });
    try {
      // Loaded on the first press, with the tracker: none of it is needed before.
      const [{ findFacesInWorker }, { regionsFromTracks, SAMPLE_FPS }, { trackFaces }] =
        await Promise.all([
          import("@/tools/workers/face-find-client"),
          import("@/tools/engines/blur-region/faces"),
          import("@/tools/engines/vision/track"),
        ]);
      const result = await findFacesInWorker(file, file.name, {
        durationSec: info.durationSec,
        startSec: info.startSec ?? 0,
        width: v.width,
        height: v.height,
        sampleFps: SAMPLE_FPS,
        signal: ac.signal,
        onProgress: (p) => {
          if (!ac.signal.aborted) set({ phase: p.phase, done: p.done, total: p.total });
        },
      });
      if (ac.signal.aborted) return;
      const src = { width: v.width, height: v.height };
      const tracks = trackFaces(result.samples, undefined, result.cuts);
      const cur = latest.current;
      const keep = tracks.length > 0 && untouched(cur, src) ? [] : cur.regions;
      const made = regionsFromTracks({
        tracks,
        source: src,
        durationSec: info.durationSec,
        sampleSec: result.sampleSec,
        firstId: nextRegionId(cur),
      });
      // Regions full: keep the faces seen longest, in the order they appear, numbered again.
      const room = Math.max(0, MAX_REGIONS - keep.length);
      const kept = (
        made.length <= room
          ? made
          : [...made]
              .sort((a, b) => span(b) - span(a))
              .slice(0, room)
              .sort((a, b) => a.start - b.start || a.id - b.id)
      ).map((r, i) => ({ ...r, face: i + 1 }));
      set(
        {
          phase: "done",
          done: result.samples.length,
          total: result.samples.length,
          found: tracks.length,
          kept: kept.length,
          left: made.length - kept.length,
        },
        {
          regions: [...keep, ...kept],
          selected: kept[0]?.id ?? cur.selected,
        },
      );
    } catch (e) {
      if (ac.signal.aborted) return;
      const reason = (e as Partial<FaceFindFailure>).reason;
      set({ phase: "error", done: 0, total: 0, message: reason ? FAILURES[reason] : FAILED });
    } finally {
      if (job.current === ac) job.current = null;
    }
  };

  const cancel = () => {
    job.current?.abort();
    job.current = null;
    set(undefined);
  };

  return { start, cancel };
}

/** Seconds a face region covers (to choose which to keep when the regions are full). */
const span = (r: Region) => (r.end ?? Number.POSITIVE_INFINITY) - r.start + r.keys.length * 1e-6;

const faces = (n: number) => `${n} ${n === 1 ? "face" : "faces"}`;

const NONE =
  "No faces found. Faces turned away, very small or covered can be missed: draw over them.";
const CHECK = "Play it through and draw over any face it missed.";

/** "3 more faces were left out: 48 regions is the most." */
const leftOut = (n: number) =>
  ` ${n} more ${n === 1 ? "face was" : "faces were"} left out: ${MAX_REGIONS} regions is the most.`;

/**
 * The one line under the regions about the search, or undefined when there is none. The face
 * count is not repeated here: the summary line carries it.
 */
export function findHint(o: FacesValue): string | undefined {
  const f = o.find;
  if (!f) return undefined;
  if (f.phase === "error") return f.message;
  // The reason Add region waits.
  if (f.phase !== "done") return "Add region is back once the search ends.";
  if (!f.found) return NONE;
  if (!f.kept)
    return `${faces(f.found)} found, but ${MAX_REGIONS} regions is the most: delete some to add them.`;
  // Once every found face is deleted the line has nothing left to describe.
  if (!o.regions.some((r) => r.face)) return undefined;
  return `${CHECK}${f.left ? leftOut(f.left) : ""}`;
}

/** What a screen reader hears when the search ends: the count, then the hint. */
function resultLine(o: FacesValue): string {
  const f = o.find;
  if (!f) return "";
  if (f.phase === "error") return f.message ?? FAILED;
  if (!f.found || !f.kept) return findHint(o) ?? "";
  return `${faces(f.found)} found. ${CHECK}${f.left ? leftOut(f.left) : ""}`;
}

/**
 * One polite live region, always mounted: the start, then about every 10% or 5 s, then the
 * result. The visible progress label updates on every sampled frame without being announced.
 */
export function FindAnnouncer({ value }: { value: FacesValue }) {
  const [text, setText] = useState("");
  const last = useRef({ step: -1, at: 0 });
  const latestValue = useRef(value);
  latestValue.current = value;
  const f = value.find;
  const phase = f?.phase;
  const done = f?.done ?? 0;
  const total = f?.total ?? 0;
  useEffect(() => {
    if (phase === "loading") {
      last.current = { step: 0, at: Date.now() };
      setText("Finding faces.");
      return;
    }
    if (phase === "finding" && total > 0) {
      const step = Math.floor((done / total) * 10);
      const now = Date.now();
      if (step > last.current.step || now - last.current.at >= 5000) {
        last.current = { step, at: now };
        if (step > 0) setText(`Finding faces, ${step * 10}% done.`);
      }
      return;
    }
    if (phase === "done" || phase === "error") setText(resultLine(latestValue.current));
    else setText("");
  }, [phase, done, total]);
  return (
    <p className="sr-only" aria-live="polite" data-testid="find-announcer">
      {text}
    </p>
  );
}

/** The button, or the progress line with Cancel while the search runs. */
export function FindFaces({
  value,
  onStart,
  onCancel,
  disabled,
  full,
  findRef,
  cancelRef,
}: {
  value: FacesValue;
  onStart: () => void;
  onCancel: () => void;
  disabled?: boolean;
  /** Every region slot is taken: the hint says why the button waits. */
  full?: boolean;
  findRef?: RefObject<HTMLButtonElement | null>;
  cancelRef?: RefObject<HTMLButtonElement | null>;
}) {
  const locale = useLocale();
  const f = value.find;
  if (f && finding(value)) {
    const n = (x: number) => x.toLocaleString(locale);
    const label =
      f.phase === "loading" || f.total === 0
        ? "Loading the face finder"
        : `Finding faces · ${n(f.done)} of ${n(f.total)} frames`;
    return (
      <div className="flex w-full flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <p className="tabular text-fg-muted text-sm">{label}</p>
          <button
            ref={cancelRef}
            type="button"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "min-h-11")}
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
        <ProgressLine ratio={f.total ? f.done / f.total : 0} label="Finding faces" />
      </div>
    );
  }
  if (value.regions.some((r) => r.face)) return null;
  return (
    <button
      ref={findRef}
      type="button"
      className={cn(buttonVariants({ variant: "secondary", size: "md" }), "min-h-11")}
      disabled={disabled || full}
      onClick={onStart}
    >
      <ScanFace size={16} strokeWidth={1.5} aria-hidden />
      Find faces
    </button>
  );
}
