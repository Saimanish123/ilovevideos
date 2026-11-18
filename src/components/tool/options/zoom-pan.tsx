"use client";

import { useId } from "react";
import { UnitField } from "@/components/tool/regions/percent-field";
import { KeyframeTimeline } from "@/components/tool/timeline/keyframe-timeline";
import { usePlayhead } from "@/components/tool/timeline/use-playhead";
import { keyIndexAt, ZoomOverlay } from "@/components/tool/zoom/zoom-overlay";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { formatBytes, formatDimensions, formatTimecode } from "@/lib/format";
import { lastFrameTime, snapToFrame } from "@/tools/engines/frame-extract/math";
import type { MediaInfo } from "@/tools/engines/types";
import { pictureEstimate } from "@/tools/engines/video-filter/plan";
import {
  clampKey,
  DEFAULT_END_ZOOM,
  deepestZoom,
  linesOfDetail,
  MAX_KEYS,
  MAX_ZOOM,
  sortKeys,
  viewAt,
  type ZoomKey,
  type ZoomOptions,
  zoomIsNoop,
} from "@/tools/engines/zoom-pan/options";
import { PLAY_SHORTCUT } from "../shortcuts";
import { nativeOnly } from "./native-only";
import { pictureSize } from "./picture-size";
import type { OptionsSpec } from "./types";

const zooms = [
  { value: "1", label: "1×" },
  { value: "1.5", label: "1.5×" },
  { value: "2", label: "2×" },
  { value: "3", label: "3×" },
] as const;

const fpsOf = (info: MediaInfo) => (info.video?.fps && info.video.fps > 0 ? info.video.fps : 30);
const sizeOf = (info: MediaInfo) => ({
  width: info.video?.width ?? 0,
  height: info.video?.height ?? 0,
});
const times = (o: ZoomOptions) => sortKeys(o.keys).map((k) => k.t);
const zoomWords = (z: number) => `${Number(z.toFixed(2))}×`;

/** "closest 2.5×, 432 of 1,080 lines" for the status line. */
function detailWords(o: ZoomOptions, info: MediaInfo): string {
  const h = info.video?.height ?? 0;
  const z = deepestZoom(o.keys);
  return `closest ${zoomWords(z)}, ${linesOfDetail(h, z).toLocaleString("en")} of ${h.toLocaleString("en")} lines of detail`;
}

export const zoomPanSpec: OptionsSpec<ZoomOptions> = {
  verb: "Zoom",
  previewResult: true,
  batch: false,
  nextStep: { slug: "change-video-aspect-ratio", label: "Change the shape" },
  shortcuts: [
    { keys: "← → ↑ ↓", label: "Move a focused view frame; on a key frame mark, move it one frame" },
    { keys: "+ −", label: "Zoom a focused view frame in or out" },
    { keys: "Delete", label: "Remove a focused key frame mark" },
    PLAY_SHORTCUT,
  ],
  defaults: (info) => {
    const end = lastFrameTime(info.durationSec, fpsOf(info));
    return {
      keys: [
        { t: 0, x: 0.5, y: 0.5, zoom: 1 },
        ...(end > 0 ? [{ t: end, x: 0.5, y: 0.5, zoom: DEFAULT_END_ZOOM }] : []),
      ],
      ease: "smooth",
      view: "frame",
    };
  },
  blocked: (o, info) => {
    if (!info.video) return "This file has no picture to zoom into.";
    const native = nativeOnly(info);
    if (native) return native;
    if (o.keys.length === 0) return "Add a key frame first.";
    if (zoomIsNoop(o.keys))
      return "Every key frame shows the whole picture, so nothing would change. Zoom in on one first.";
    return undefined;
  },
  summary: (o, info) => {
    const v = info.video;
    if (!v) return undefined;
    const size = pictureSize(info);
    const est = pictureEstimate(info, size);
    const dims =
      size.width === v.width && size.height === v.height
        ? formatDimensions(size.width, size.height)
        : `${formatDimensions(v.width, v.height)} → ${formatDimensions(size.width, size.height)}`;
    const sound = !info.audio?.length ? "no sound" : "sound copied";
    return `${dims} · ${detailWords(o, info)} · ≈ ${formatBytes(est.bytes)} · H.264, ${sound}`;
  },
  result: () => ({ title: "Zoom added", change: false }),
  Overlay({ value, onChange, info, media, disabled }) {
    return (
      <ZoomOverlay
        value={value}
        onChange={onChange}
        size={sizeOf(info)}
        fps={fpsOf(info)}
        duration={info.durationSec}
        video={media.video}
        disabled={disabled}
      />
    );
  },
  Below({ value, onChange, info, media, disabled }) {
    const playhead = usePlayhead(media.video);
    const keys = sortKeys(value.keys);
    return (
      <KeyframeTimeline
        file={media.file}
        video={media.video}
        duration={info.durationSec}
        fps={fpsOf(info)}
        times={times(value)}
        current={keyIndexAt(keys, playhead, fpsOf(info))}
        describe={(i) => `${zoomWords(clampKey(keys[i] as ZoomKey).zoom)} zoom`}
        disabled={disabled}
        onMove={(i, t) =>
          onChange({ ...value, keys: keys.map((k, j) => (j === i ? { ...k, t } : k)) })
        }
        onRemove={(i) => onChange({ ...value, keys: keys.filter((_, j) => j !== i) })}
      />
    );
  },
  Panel({ value, onChange, info, media, disabled }) {
    const zoomId = useId();
    const easeId = useId();
    const viewId = useId();
    const fps = fpsOf(info);
    const playhead = usePlayhead(media.video);
    const here = snapToFrame(playhead, fps, info.durationSec);
    const keys = sortKeys(value.keys);
    const at = keyIndexAt(keys, here, fps);
    const current = at !== undefined ? keys[at] : undefined;
    const shown = current ? clampKey(current) : viewAt(keys, here, value.ease);
    /** Sets the zoom at the playhead: the key frame there, or a new one with the view as it is. */
    const setZoom = (zoom: number) => {
      const key = clampKey({ t: current?.t ?? here, x: shown.x, y: shown.y, zoom });
      onChange({
        ...value,
        keys:
          at !== undefined ? keys.map((k, i) => (i === at ? key : k)) : sortKeys([...keys, key]),
      });
    };
    const preset = zooms.find((z) => Math.abs(Number(z.value) - shown.zoom) < 0.005)?.value ?? "";
    return (
      <div className="flex flex-col gap-6">
        <Field
          label={
            current ? `Key frame at ${formatTimecode(current.t)}` : `At ${formatTimecode(here)}`
          }
          labelId={zoomId}
          hint="Drag the frame on the picture to aim it; its corners zoom."
        >
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <Segmented
                  name="zoom-factor"
                  aria-labelledby={zoomId}
                  value={preset as (typeof zooms)[number]["value"]}
                  onChange={(v) => setZoom(Number(v))}
                  options={[...zooms]}
                />
              </div>
              <UnitField
                id={`${zoomId}-n`}
                label="Zoom factor"
                value={shown.zoom}
                min={1}
                max={MAX_ZOOM}
                step={0.1}
                decimals={2}
                unit="×"
                onCommit={(n) => {
                  // Only a real change edits or adds a key frame.
                  if (Math.abs(n - shown.zoom) > 1e-6) setZoom(n);
                }}
              />
            </div>
            {current ? (
              <Button
                size="md"
                disabled={disabled || keys.length <= 1}
                onClick={() => onChange({ ...value, keys: keys.filter((_, i) => i !== at) })}
              >
                Remove this key frame
              </Button>
            ) : (
              <Button
                size="md"
                disabled={disabled || keys.length >= MAX_KEYS}
                onClick={() => setZoom(shown.zoom)}
              >
                <span className="tabular">Add key frame at {formatTimecode(here)}</span>
              </Button>
            )}
            {current && keys.length <= 1 && (
              <p className="text-fg-muted text-xs">
                The only key frame stays; add another to remove it.
              </p>
            )}
            {!current && keys.length >= MAX_KEYS && (
              <p className="text-fg-muted text-xs">Up to {MAX_KEYS} key frames.</p>
            )}
          </div>
        </Field>
        <Field
          label="Motion"
          labelId={easeId}
          hint={
            value.ease === "smooth"
              ? "Starts and stops gently at each key frame."
              : "Moves at a steady rate between key frames."
          }
        >
          <Segmented
            name="zoom-ease"
            aria-labelledby={easeId}
            value={value.ease}
            onChange={(ease) => onChange({ ...value, ease })}
            options={[
              { value: "smooth", label: "Smooth" },
              { value: "linear", label: "Linear" },
            ]}
          />
        </Field>
        <Field label="Preview" labelId={viewId}>
          <Segmented
            name="zoom-view"
            aria-labelledby={viewId}
            value={value.view ?? "frame"}
            onChange={(view) => onChange({ ...value, view })}
            options={[
              { value: "frame", label: "Frame" },
              { value: "result", label: "Result" },
            ]}
          />
        </Field>
      </div>
    );
  },
};
