"use client";

import { Plus, Trash2 } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { BlurPreview } from "@/components/tool/regions/blur-preview";
import { BoxEditor } from "@/components/tool/regions/box-editor";
import { LayerTimeline } from "@/components/tool/regions/layer-timeline";
import { MoreOptions } from "@/components/tool/regions/more-options";
import { usePlayhead } from "@/components/tool/regions/use-playhead";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/cn";
import { formatDimensions, formatTimecode } from "@/lib/format";
import {
  type BlurRegionOptions,
  defaultRegion,
  type Effect,
  keyAt,
  keyFromRect,
  keyNear,
  keyRect,
  MAX_REGIONS,
  nextRegionId,
  type Region,
  regionRange,
  setMoving,
  showsAt,
  strengthPresets,
  wholeVideo,
  withoutKey,
  withRect,
} from "@/tools/engines/blur-region/options";
import { encodedSize } from "@/tools/engines/crop/math";
import { audioCopied, encodedSoundWords, needsFfmpeg, sourceName } from "@/tools/engines/crop/plan";
import { compositeContainer } from "@/tools/engines/overlay/composite";
import { soundEncodersNow } from "@/tools/engines/sound-codec";
import type { MediaInfo } from "@/tools/engines/types";
import {
  type FacesValue,
  FindAnnouncer,
  FindFaces,
  findHint,
  finding,
  useFindFaces,
} from "./blur-faces";
import { between, z } from "./remember-schema";
import type { OptionsPanelProps, OptionsSpec } from "./types";
import { unfixable } from "./types";

type O = FacesValue;

const sizeOf = (info: MediaInfo) => ({
  width: info.video?.width ?? 0,
  height: info.video?.height ?? 0,
});
const frameSecOf = (info: MediaInfo) =>
  1 / (info.video?.fps && info.video.fps > 0 ? info.video.fps : 30);
/** The playhead on a frame boundary, inside the video. */
const snapTime = (t: number, info: MediaInfo) => {
  const f = frameSecOf(info);
  return Math.min(info.durationSec, Math.max(0, Math.round(t / f) * f));
};

const strengthWord = (s: number) =>
  strengthPresets.find((p) => Math.abs(p.value - s) < 0.001)?.label.toLowerCase() ??
  `${Math.round(s * 100)}%`;

function soundWords(info: MediaInfo, fileName: string) {
  if (!info.audio?.length) return "no sound";
  return audioCopied(info, compositeContainer(fileName))
    ? "sound copied"
    : encodedSoundWords(compositeContainer(fileName), soundEncodersNow());
}

const regionCount = (n: number) => `${n} ${n === 1 ? "region" : "regions"}`;
const faceCount = (n: number) => `${n} ${n === 1 ? "face" : "faces"}`;

/** "3 faces and 1 region", "2 regions", "1 face". */
function regionsPhrase(o: Pick<BlurRegionOptions, "regions">) {
  const f = o.regions.filter((r) => r.face).length;
  const d = o.regions.length - f;
  if (f === 0) return regionCount(d);
  if (d === 0) return faceCount(f);
  return `${faceCount(f)} and ${regionCount(d)}`;
}

/** "medium blur", "strong pixelation", "black box". */
function effectPhrase(o: O) {
  if (o.effect === "box") return "black box";
  return `${strengthWord(o.strength)} ${o.effect === "blur" ? "blur" : "pixelation"}`;
}

const pastTense: Record<Effect, string> = {
  blur: "blurred",
  pixelate: "pixelated",
  box: "covered",
};

/** The size the file is written at (H.264 drops an odd last column or row). */
const outSize = (info: MediaInfo) => {
  const e = encodedSize(sizeOf(info));
  return formatDimensions(e.width, e.height);
};

export const blurRegionSpec: OptionsSpec<O> = {
  verb: "Blur",
  remember: {
    schema: z.object({
      effect: z.enum(["blur", "pixelate", "box"]),
      strength: between(0.1, 1),
      feather: between(0, 0.5),
    }),
  },
  defaults: (info, preset) => ({
    regions: [defaultRegion(1, sizeOf(info))],
    effect: preset.effect === "pixelate" || preset.effect === "box" ? preset.effect : "blur",
    strength: 0.5,
    feather: 0,
    invert: false,
    selected: 1,
  }),
  previewResult: true,
  nextStep: { slug: "compress-video", label: "Compress video" },
  shortcuts: [
    { keys: "Arrows", label: "Move the selected region" },
    { keys: "Shift Arrows", label: "Move it further" },
    { keys: "+ −", label: "Resize it" },
    { keys: "Delete", label: "Remove it" },
  ],
  blocked: (o, info, _inputs, file) => {
    if (!info.video) return unfixable("This file has no video track to blur. Choose a video file.");
    if (needsFfmpeg(info, file?.name ?? sourceName(info)))
      return {
        reason:
          info.video.decodable === false
            ? "This browser cannot decode this video's picture, so regions cannot be drawn over it."
            : "This tool cannot open this format. Convert it to MP4 first, then come back.",
        action: { slug: "video-converter", label: "Convert to MP4" },
        fixable: false,
      };
    if (finding(o)) return "Wait for the face search to finish, or cancel it.";
    if (o.regions.length === 0) return "Draw a region on the picture first.";
    return undefined;
  },
  summary: (o, info) =>
    `${o.invert ? `Everything but ${regionsPhrase(o)}` : regionsPhrase(o)}, ${effectPhrase(o)} · H.264 ${outSize(info)} · ${soundWords(info, sourceName(info))}`,
  result: (o, info) => {
    if (!info.video) return undefined;
    const n = regionsPhrase(o);
    return {
      title: o.invert
        ? `Everything but ${n} ${pastTense[o.effect]}`
        : `${n[0]?.toUpperCase()}${n.slice(1)} ${pastTense[o.effect]}`,
      detail: "Play it through before you share it: check every moment the subject moves.",
    };
  },
  Overlay: BlurOverlay,
  Below: BlurBelow,
  Panel: BlurPanel,
};

/**
 * Names, the same on the picture, in the panel and on the timeline: a found face keeps its number
 * from Find faces ("Face 4" stays Face 4 when Face 3 is deleted); drawn regions are numbered by
 * position among themselves ("Region n").
 */
const nameOf = (o: Pick<BlurRegionOptions, "regions">, id: number | undefined) => {
  const r = o.regions.find((x) => x.id === id);
  if (!r) return undefined;
  if (r.face) return `Face ${r.face}`;
  return `Region ${o.regions.filter((x) => !x.face).indexOf(r) + 1}`;
};

const update = (o: O, id: number, f: (r: Region) => Region): O => ({
  ...o,
  regions: o.regions.map((r) => (r.id === id ? f(r) : r)),
});

function BlurOverlay({ value, onChange, info, media, disabled }: OptionsPanelProps<O>) {
  if (!info.video) return null;
  return (
    <BlurOverlayOn
      value={value}
      onChange={onChange}
      info={info}
      media={media}
      disabled={disabled}
    />
  );
}

function BlurOverlayOn({
  value,
  onChange,
  info,
  media,
  disabled,
}: Pick<OptionsPanelProps<O>, "value" | "onChange" | "info" | "media" | "disabled">) {
  const w = info.video?.width ?? 0;
  const h = info.video?.height ?? 0;
  const source = useMemo(() => ({ width: w, height: h }), [w, h]);
  const now = usePlayhead(media.video);
  // A region outside its time range shows as a faint outline only when it is selected (or drawn
  // by hand): found faces come and go, and twenty faint ellipses would bury the picture.
  const boxes = value.regions
    .filter((r) => !r.face || r.id === value.selected || showsAt(r, now))
    .map((r) => ({
      id: r.id,
      rect: keyRect(keyAt(r, now), source),
      shape: r.shape,
      label: nameOf(value, r.id) ?? "Region",
      hidden: !showsAt(r, now),
    }));
  const frameSec = frameSecOf(info);
  return (
    <>
      <BlurPreview video={media.video} source={source} value={value} />
      <BoxEditor
        boxes={boxes}
        selected={value.selected}
        source={source}
        disabled={disabled}
        noun="region"
        help="Drag a region to move it, or a corner handle to resize it. Arrow keys move it, Shift moves further, plus and minus resize it, Delete removes it. Drag on the picture to draw another."
        onSelect={(selected) => onChange({ ...value, selected })}
        onChange={(id, { rect }) =>
          onChange({
            ...update(value, id, (r) => withRect(r, rect, source, snapTime(now, info), frameSec)),
            selected: id,
          })
        }
        onDraw={
          value.regions.length >= MAX_REGIONS
            ? undefined
            : (rect) => {
                const id = nextRegionId(value);
                const shape = value.regions.find((r) => r.id === value.selected)?.shape ?? "rect";
                onChange({
                  ...value,
                  regions: [
                    ...value.regions,
                    { id, shape, moving: false, start: 0, keys: [keyFromRect(rect, source, 0)] },
                  ],
                  selected: id,
                });
              }
        }
        onDelete={(id) => {
          const regions = value.regions.filter((r) => r.id !== id);
          onChange({ ...value, regions, selected: regions[regions.length - 1]?.id });
        }}
      />
    </>
  );
}

function BlurBelow({ value, onChange, info, media, disabled }: OptionsPanelProps<O>) {
  if (!info.video) return null;
  const r = value.regions.find((x) => x.id === value.selected);
  return (
    <LayerTimeline
      file={media.file}
      video={media.video}
      duration={info.durationSec}
      fps={info.video?.fps ?? 30}
      name={nameOf(value, value.selected)}
      range={r ? regionRange(r, info.durationSec) : undefined}
      onRange={(range) => {
        if (!r) return;
        const end = range.end >= info.durationSec - frameSecOf(info) / 2 ? undefined : range.end;
        onChange(update(value, r.id, (x) => ({ ...x, start: range.start, end })));
      }}
      marks={r?.moving ? r.keys.map((k) => k.t).filter((t) => t <= info.durationSec) : []}
      disabled={disabled}
    />
  );
}

function BlurPanel(props: OptionsPanelProps<O>) {
  return props.info.video ? <BlurPanelOn {...props} /> : null;
}

/** Region buttons shown before the list collapses behind "All n". */
const COLLAPSE_AT = 6;

const EDGES = [
  { value: "0", label: "Crisp" },
  { value: "0.1", label: "Soft" },
  { value: "0.25", label: "Softer" },
];

function BlurPanelOn({ value, onChange, info, media, disabled }: OptionsPanelProps<O>) {
  const regionsId = useId();
  const shapeId = useId();
  const effectId = useId();
  const strengthId = useId();
  const edgeId = useId();
  const source = sizeOf(info);
  const sel = value.regions.find((r) => r.id === value.selected);
  const selName = nameOf(value, value.selected);
  const full = value.regions.length >= MAX_REGIONS;
  const strengthPreset = strengthPresets.find((p) => Math.abs(p.value - value.strength) < 0.001);
  const edge = EDGES.find((p) => Math.abs(Number(p.value) - value.feather) < 0.001)?.value ?? "";
  const verb =
    value.effect === "blur" ? "Blur" : value.effect === "pixelate" ? "Pixelate" : "Cover";
  const faces = useFindFaces(value, onChange, info, media.file);
  const searching = finding(value);
  // Past six, the list shows the first six (and the selected one) until opened.
  const [showAll, setShowAll] = useState(false);
  const long = value.regions.length > COLLAPSE_AT;
  const shown =
    !long || showAll
      ? value.regions
      : value.regions.filter((r, i) => i < COLLAPSE_AT || r.id === value.selected);
  const hiddenCount = value.regions.length - shown.length;

  // Focus follows the search (each step unmounts what had focus): to Cancel when it starts, back to
  // Find faces when cancelled, to the first face when it ends, or to the line saying why not.
  const findRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const hintRef = useRef<HTMLParagraphElement>(null);
  const listRef = useRef<HTMLFieldSetElement>(null);
  const phase = value.find?.phase;
  const prevPhase = useRef(phase);
  useEffect(() => {
    const was = prevPhase.current;
    prevPhase.current = phase;
    if (was === phase) return;
    const running = (p: typeof phase) => p === "loading" || p === "finding";
    if (running(phase) && !running(was)) cancelRef.current?.focus();
    else if (running(was) && phase === undefined) findRef.current?.focus();
    else if (phase === "done" && value.find?.kept)
      listRef.current
        ?.querySelector<HTMLButtonElement>(`[data-region="${value.selected}"]`)
        ?.focus();
    else if (phase === "done" || phase === "error") hintRef.current?.focus();
  }, [phase, value.find?.kept, value.selected]);
  const hint =
    findHint(value) ??
    (full
      ? `Up to ${MAX_REGIONS} regions; delete one to add another.`
      : value.regions.length === 0
        ? "Drag on the picture to draw one, or find the faces."
        : "Drag on the picture to draw another. Select one to change it.");
  /** The preview's moment, read when it is needed (the panel does not follow the playhead). */
  const nowSnapped = () => snapTime(media.video.current?.currentTime ?? 0, info);

  const add = () => {
    if (full) return;
    const id = nextRegionId(value);
    const r = defaultRegion(id, source);
    // Not exactly on top of the last one, so a new region is visibly new.
    const k = r.keys[0];
    const shift = (value.regions.length % 4) * 0.04;
    const keys = k ? [{ ...k, x: k.x + shift, y: k.y + shift }] : r.keys;
    onChange({ ...value, regions: [...value.regions, { ...r, keys }], selected: id });
  };

  return (
    <div className="flex flex-col gap-6">
      <Field label="Regions" labelId={regionsId}>
        <fieldset
          ref={listRef}
          aria-labelledby={regionsId}
          className="m-0 flex flex-wrap gap-2 border-0 p-0"
        >
          {shown.map((r) => {
            const on = r.id === value.selected;
            return (
              <button
                key={r.id}
                type="button"
                data-region={r.id}
                aria-pressed={on}
                disabled={disabled}
                onClick={() => onChange({ ...value, selected: r.id })}
                className={cn(
                  buttonVariants({ variant: "secondary", size: "md" }),
                  "tabular min-h-11 px-3",
                  on ? "border-fg" : "text-fg-muted",
                )}
              >
                {nameOf(value, r.id)}
                {!wholeVideo(r, info.durationSec) && (
                  <span className="sr-only">
                    , from {formatTimecode(regionRange(r, info.durationSec).start)}
                  </span>
                )}
              </button>
            );
          })}
          {long && (
            <Button
              variant="ghost"
              className="min-h-11 px-3"
              aria-expanded={showAll}
              onClick={() => setShowAll(!showAll)}
            >
              {showAll ? "Show fewer" : `${hiddenCount} more`}
            </Button>
          )}
          <Button
            variant="secondary"
            className="min-h-11"
            disabled={disabled || full || searching}
            onClick={add}
          >
            <Plus size={16} strokeWidth={1.5} aria-hidden />
            Add region
          </Button>
          <FindFaces
            value={value}
            onStart={() => void faces.start()}
            onCancel={faces.cancel}
            disabled={disabled}
            full={full}
            findRef={findRef}
            cancelRef={cancelRef}
          />
        </fieldset>
        {/* The field's hint, here so focus can land on it when a search ends with nothing added. */}
        {hint && (
          <p ref={hintRef} tabIndex={-1} className="mt-2 text-fg-muted text-xs">
            {hint}
          </p>
        )}
        <FindAnnouncer value={value} />
      </Field>
      <Field label="Effect" labelId={effectId}>
        <Segmented
          name="blur-effect"
          aria-labelledby={effectId}
          value={value.effect}
          onChange={(effect) => onChange({ ...value, effect })}
          options={[
            { value: "blur", label: "Blur" },
            { value: "pixelate", label: "Pixelate" },
            { value: "box", label: "Box" },
          ]}
        />
      </Field>
      {value.effect !== "box" && (
        <Field
          label="Strength"
          labelId={strengthId}
          hint="Set by the region's size. Light can leave large text legible; Medium hides text that fills the region."
        >
          <Segmented
            name="blur-strength"
            aria-labelledby={strengthId}
            value={strengthPreset ? String(strengthPreset.value) : ""}
            onChange={(v) => onChange({ ...value, strength: Number(v) })}
            options={strengthPresets.map((p) => ({ value: String(p.value), label: p.label }))}
          />
        </Field>
      )}
      {sel && (
        <div className="flex flex-col gap-3">
          <Checkbox
            label={`${selName} follows a moving subject`}
            hint="Scrub to a moment, then move the region: each move sets a key frame."
            checked={sel.moving}
            disabled={disabled}
            onChange={(e) =>
              onChange(update(value, sel.id, (r) => setMoving(r, e.target.checked, nowSnapped())))
            }
          />
          <div className="flex flex-wrap gap-2">
            <KeyFrameRemover
              region={sel}
              video={media.video}
              frameSec={frameSecOf(info)}
              disabled={disabled}
              onRemove={(t) =>
                onChange(update(value, sel.id, (r) => withoutKey(r, t, frameSecOf(info))))
              }
            />
            <Button
              variant="quiet"
              className="min-h-11 px-3"
              disabled={disabled}
              onClick={() => {
                const regions = value.regions.filter((r) => r.id !== sel.id);
                onChange({ ...value, regions, selected: regions[regions.length - 1]?.id });
              }}
            >
              <Trash2 size={16} strokeWidth={1.5} aria-hidden />
              Delete {selName?.toLowerCase()}
            </Button>
          </div>
        </div>
      )}
      <MoreOptions>
        {sel && (
          <Field label={`${selName} shape`} labelId={shapeId}>
            <Segmented
              name="region-shape"
              aria-labelledby={shapeId}
              value={sel.shape}
              onChange={(shape) => onChange(update(value, sel.id, (r) => ({ ...r, shape })))}
              options={[
                { value: "rect", label: "Rectangle" },
                { value: "ellipse", label: "Ellipse" },
              ]}
            />
          </Field>
        )}
        <Field
          label="Edge"
          labelId={edgeId}
          hint="A soft edge fades the effect out just outside the region."
        >
          <Segmented
            name="blur-edge"
            aria-labelledby={edgeId}
            value={edge}
            onChange={(v) => onChange({ ...value, feather: Number(v) })}
            options={EDGES}
          />
        </Field>
        <Checkbox
          label={`${verb} everything except the regions`}
          hint="Keeps the regions clear and hides the rest of the picture."
          checked={value.invert}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, invert: e.target.checked })}
        />
      </MoreOptions>
    </div>
  );
}

/**
 * "Remove key frame at 0:01.20", shown while the preview sits on one of the region's key frames.
 * It follows the playhead itself, so only this button re-renders on every frame of playback.
 */
function KeyFrameRemover({
  region,
  video,
  frameSec,
  disabled,
  onRemove,
}: {
  region: Region;
  video: React.RefObject<HTMLVideoElement | null>;
  frameSec: number;
  disabled?: boolean;
  onRemove: (t: number) => void;
}) {
  const now = usePlayhead(video);
  const atKey = keyNear(region, now, frameSec);
  if (!atKey || region.keys.length < 2) return null;
  return (
    <Button
      variant="secondary"
      className="min-h-11"
      disabled={disabled}
      onClick={() => onRemove(atKey.t)}
    >
      Remove key frame at {formatTimecode(atKey.t)}
    </Button>
  );
}
