"use client";

import { useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatBytes, formatDimensions, formatTimecode, withUnit } from "@/lib/format";
import {
  type BarsResult,
  barsKind,
  barsRect,
  type Edge,
  edgeNames,
  hasBars,
} from "@/tools/engines/crop/bars";
import { readBars } from "@/tools/engines/crop/bars-read";
import { isFullFrame, type Rect, type Size } from "@/tools/engines/crop/math";
import { type CropOptions, cropRect } from "@/tools/engines/crop/options";
import {
  audioCopied,
  encodedSoundWords,
  geometryContainer,
  sourceName,
} from "@/tools/engines/crop/plan";
import { soundEncodersNow } from "@/tools/engines/sound-codec";
import type { MediaInfo } from "@/tools/engines/types";
import { nativeOnly } from "../options/native-only";
import type { OptionsPanelProps, OptionsSpec } from "../options/types";
import { geometryEstimate } from "./estimate";

/**
 * The remove-black-bars page on the crop engine (`bars: true`): when the file is chosen the page
 * reads 24 frames (crop/bars-read), finds the bars, and starts the crop frame on them; the frame
 * stays adjustable. No bars is a settled success. Content inside a bar in some frames (burned-in
 * subtitles, a logo) is named, with a choice to keep that strip.
 */
export type BarsValue = CropOptions & {
  /** Detection progress, then the answer (`result` undefined: the frames could not be read). */
  scan?: { done: number; total: number; finished?: boolean; result?: BarsResult };
  /** Edges whose intruding strip is kept. */
  keep?: Partial<Record<Edge, boolean>>;
};

const sourceOf = (info: MediaInfo): Size => ({
  width: info.video?.width ?? 0,
  height: info.video?.height ?? 0,
});

/** The rectangle the detection proposes with the chosen strips kept. */
export function proposedRect(v: BarsValue, src: Size): Rect | undefined {
  const r = v.scan?.result;
  if (!r) return undefined;
  const keep: Partial<Record<Edge, number>> = {};
  for (const [edge, i] of Object.entries(r.intrusions) as [Edge, { keep: number }][])
    if (v.keep?.[edge]) keep[edge] = i.keep;
  return barsRect(r.bars, src, keep);
}

const px = (n: number) => withUnit(n, "px");

/** "140 px top and bottom", "240 px left, 236 px right". */
function barSizes(b: BarsResult["bars"]): string {
  const parts: string[] = [];
  if (b.top || b.bottom)
    parts.push(
      b.top === b.bottom
        ? `${px(b.top)} top and bottom`
        : `${px(b.top)} top, ${px(b.bottom)} bottom`,
    );
  if (b.left || b.right)
    parts.push(
      b.left === b.right
        ? `${px(b.left)} left and right`
        : `${px(b.left)} left, ${px(b.right)} right`,
    );
  return parts.join("; ");
}

function soundWords(info: MediaInfo) {
  if (!info.audio?.length) return "no sound";
  return audioCopied(info, geometryContainer(sourceName(info)))
    ? "sound copied"
    : encodedSoundWords(geometryContainer(sourceName(info)), soundEncodersNow());
}

/** Hooks of the crop spec that differ on the black-bars page; the crop frame and scrubber stay. */
export const barsHooks: Pick<OptionsSpec<BarsValue>, "blocked" | "summary" | "result" | "Panel"> = {
  blocked: (o, info) => {
    if (!info.video) return "This file has no video track.";
    const native = nativeOnly(info, "this file");
    if (native) return native;
    const scan = o.scan;
    if (!scan?.finished) return "Remove bars is ready once the frames are read.";
    const r = scan.result;
    if (r && r.frames > 0 && !hasBars(r.bars) && isFullFrame(cropRect(o, info.video), info.video))
      return {
        reason: `No black bars in ${r.frames} frames: the picture already fills the frame.`,
        settled: true,
      };
    if (isFullFrame(cropRect(o, info.video), info.video))
      return "The frame still covers the whole picture.";
    return undefined;
  },
  summary: (o, info) => {
    const v = info.video;
    if (!v) return undefined;
    const r = cropRect(o, v);
    if (isFullFrame(r, v)) return undefined;
    const est = geometryEstimate(info, r, soundEncodersNow());
    return `${formatDimensions(v.width, v.height)} → ${formatDimensions(r.width, r.height)} · H.264 · ${soundWords(info)} · about ${formatBytes(est.bytes)}`;
  },
  result: () => ({ title: "Black bars removed" }),
  Panel: BarsPanel,
};

function BarsPanel({ value, onChange, info, media }: OptionsPanelProps<BarsValue>) {
  const src = sourceOf(info);
  const scan = value.scan;
  // Read the frames once per file; the frame moves onto the answer when it arrives. Progress and
  // the answer are merged into the options as they are then (the frame may have been dragged).
  const latest = useRef(value);
  latest.current = value;
  const finished = scan?.finished === true;
  useEffect(() => {
    if (finished || !info.video || nativeOnly(info)) return;
    const ac = new AbortController();
    void readBars(
      media.file,
      info.durationSec,
      src,
      info.startSec ?? 0,
      (done, total) => {
        if (!ac.signal.aborted) onChange({ ...latest.current, scan: { done, total } });
      },
      ac.signal,
    ).then((result) => {
      if (ac.signal.aborted) return;
      const next: BarsValue = {
        ...latest.current,
        scan: { done: 24, total: 24, finished: true, result },
      };
      const rect = proposedRect(next, src);
      onChange(rect ? { ...next, ...rect } : next);
    });
    return () => ac.abort();
  }, [media.file, finished]);

  const r = scan?.result;
  const current = cropRect(value, src);
  const proposal = proposedRect(value, src);
  const moved =
    !!proposal &&
    hasBars(r?.bars ?? { top: 0, bottom: 0, left: 0, right: 0 }) &&
    (proposal.x !== current.x ||
      proposal.y !== current.y ||
      proposal.width !== current.width ||
      proposal.height !== current.height);
  // One heading row in the same two-line shape from the first frame read to the answer.
  const [title, line] = !finished
    ? ["Looking for black bars", `${scan?.done ?? 0} of ${scan?.total ?? 24} frames`]
    : !r
      ? ["Bars not found", "The frames could not be read. Drag the frame's edges to set the crop."]
      : r.frames === 0
        ? [
            "Bars not found",
            "The sampled frames are too dark to tell. Drag the frame's edges to set the crop.",
          ]
        : !hasBars(r.bars)
          ? ["No black bars", `${r.frames} of ${r.sampled} frames read`]
          : [
              `Found ${barsKind(r.bars)}`,
              `${barSizes(r.bars)}, in ${r.frames} of ${r.sampled} frames`,
            ];
  const intrusions = r
    ? (Object.entries(r.intrusions) as [Edge, { keep: number; times: number[] }][])
    : [];
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="font-medium text-sm">{title}</p>
        <p className="tabular mt-1 text-fg-muted text-sm" data-testid="bars-found">
          {line}
        </p>
        {/* A reserved row, as plain crop's Reset: the button shows only once the frame has moved. */}
        <Button
          variant="ghost"
          size="sm"
          className={moved ? "-ml-3 mt-1 min-h-11" : "invisible -ml-3 mt-1 min-h-11"}
          aria-hidden={!moved}
          tabIndex={moved ? 0 : -1}
          onClick={() => proposal && onChange({ ...value, ...proposal })}
        >
          Back to bars found
        </Button>
      </div>
      {intrusions.map(([edge, i]) => (
        <Intrusion
          key={edge}
          edge={edge}
          times={i.times}
          frames={r?.frames ?? 0}
          checked={!!value.keep?.[edge]}
          onChange={(on) => {
            const next = { ...value, keep: { ...value.keep, [edge]: on } };
            const rect = proposedRect(next, src);
            onChange(rect ? { ...next, ...rect } : next);
          }}
        />
      ))}
    </div>
  );
}

function Intrusion({
  edge,
  times,
  frames,
  checked,
  onChange,
}: {
  edge: Edge;
  times: number[];
  frames: number;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  const id = useId();
  const shown = times.slice(0, 3).map(formatTimecode).join(", ");
  const more = times.length > 3 ? ` and ${times.length - 3} more` : "";
  return (
    <Checkbox
      id={id}
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      label={`Keep what shows in the ${edgeNames[edge]} bar`}
      hint={`Subtitles or a logo show there in ${times.length} of ${frames} frames (${shown}${more}); unticked, they are cut off.`}
    />
  );
}
