"use client";

import { ImageIcon } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { PreviewScrubber } from "@/components/tool/crop/preview-scrubber";
import { FileName } from "@/components/tool/file-card";
import { KeyPreview } from "@/components/tool/regions/key-preview";
import { MoreOptions } from "@/components/tool/regions/more-options";
import { UnitField } from "@/components/tool/regions/percent-field";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/cn";
import { formatDimensions, formatTimecode } from "@/lib/format";
import {
  type Background,
  type ChromaKeyOptions,
  fromHex,
  hex,
  type Rgb,
  screenName,
} from "@/tools/engines/chroma-key/options";
import { encodedSize } from "@/tools/engines/crop/math";
import { audioCopied, encodedSoundWords, needsFfmpeg, sourceName } from "@/tools/engines/crop/plan";
import { compositeContainer } from "@/tools/engines/overlay/composite";
import { soundEncodersNow } from "@/tools/engines/sound-codec";
import type { MediaInfo } from "@/tools/engines/types";
import type { OptionsPanelProps, OptionsSpec } from "./types";
import { unfixable } from "./types";

type O = ChromaKeyOptions;

function soundWords(o: O, info: MediaInfo, fileName: string) {
  if (!info.audio?.length || o.sound === "none") return "no sound";
  return audioCopied(info, compositeContainer(fileName))
    ? "sound copied"
    : encodedSoundWords(compositeContainer(fileName), soundEncodersNow());
}

function backgroundWords(o: O) {
  const b = o.background;
  if (b.kind === "color") return `on ${hex(o.color).toUpperCase()}`;
  // The file's name and the loop choice show in the panel; the line does not repeat them.
  return b.kind === "image" ? "on a picture" : "on a video";
}

/** "Click" with a mouse or trackpad, "Tap" on a touch screen. */
export const pointWord = () =>
  typeof window !== "undefined" && window.matchMedia?.("(pointer: fine)").matches ? "Click" : "Tap";

/** The size the file is written at (H.264 drops an odd last column or row). */
const outSize = (info: MediaInfo) => {
  const e = encodedSize({ width: info.video?.width ?? 0, height: info.video?.height ?? 0 });
  return formatDimensions(e.width, e.height);
};

export const chromaKeySpec: OptionsSpec<O> = {
  verb: "Remove green screen",
  defaults: () => ({
    key: [0, 177, 64],
    keyFrom: "default",
    tolerance: 0.05,
    softness: 0.9,
    spill: 1,
    background: { kind: "color" },
    color: [0, 0, 0],
    fit: "cover",
    bgEnd: "loop",
    sound: "foreground",
  }),
  previewResult: true,
  batch: false,
  nextStep: { slug: "compress-video", label: "Compress video" },
  blocked: (o, info, _inputs, file) => {
    if (!info.video) return unfixable("This file has no video track to key. Choose a video file.");
    if (needsFfmpeg(info, file?.name ?? sourceName(info)))
      return {
        reason:
          info.video.decodable === false
            ? "This browser cannot decode this video's picture, so it cannot be keyed here."
            : "This tool cannot open this format. Convert it to MP4 first, then come back.",
        action: { slug: "video-converter", label: "Convert to MP4" },
        fixable: false,
      };
    if (o.keyFrom === "default") return "Finding the screen colour";
    if (o.keyFrom === "none")
      return `No coloured screen fills the picture's edges. ${pointWord()} the background on the picture to pick its colour.`;
    if (o.bgKind === "image" && o.background.kind !== "image")
      return "Choose a background picture first.";
    if (o.bgKind === "video" && o.background.kind !== "video")
      return "Choose a background video first.";
    return undefined;
  },
  summary: (o, info) => {
    const s = screenName(o.key);
    return `${s[0]?.toUpperCase()}${s.slice(1)} keyed out, ${backgroundWords(o)} · H.264 ${outSize(info)} · ${soundWords(o, info, sourceName(info))}`;
  },
  result: (_o, info) => {
    if (!info.video) return undefined;
    return {
      title: "Background replaced",
      detail:
        "A coloured fringe left around the subject? Choose Change settings and raise Spill under More options. Lower Softness for crisper edges.",
    };
  },
  Overlay(props) {
    return props.info.video ? <KeyOverlay {...props} /> : null;
  },
  Below({ info, media, disabled }) {
    if (!info.video) return null;
    return (
      <PreviewScrubber file={media.file} video={media.video} info={info} disabled={disabled} />
    );
  },
  Panel: (props) => (props.info.video ? <KeyPanel {...props} /> : null),
};

function KeyOverlay({ value, onChange, info, media, disabled }: OptionsPanelProps<O>) {
  const w = info.video?.width ?? 0;
  const h = info.video?.height ?? 0;
  const source = useMemo(() => ({ width: w, height: h }), [w, h]);
  return (
    <KeyPreview
      video={media.video}
      source={source}
      value={value}
      disabled={disabled}
      onKey={(key, keyFrom) => onChange({ ...value, key, keyFrom })}
    />
  );
}

export const BG_ACCEPT_IMAGE =
  "image/png,image/jpeg,image/webp,image/avif,.png,.jpg,.jpeg,.webp,.avif";
export const BG_ACCEPT_VIDEO = "video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.m4v,.mkv";

export async function readBackground(file: File, kind: "image" | "video"): Promise<Background> {
  const url = URL.createObjectURL(file);
  try {
    if (kind === "image") {
      const img = new Image();
      img.src = url;
      await img.decode();
      return {
        kind,
        name: file.name,
        blob: file,
        width: img.naturalWidth,
        height: img.naturalHeight,
      };
    }
    const v = document.createElement("video");
    v.muted = true;
    v.preload = "metadata";
    v.src = url;
    await new Promise<void>((resolve, reject) => {
      v.onloadedmetadata = () => resolve();
      v.onerror = () => reject(new Error("unreadable"));
    });
    if (!v.videoWidth || !Number.isFinite(v.duration)) throw new Error("no picture");
    return {
      kind,
      name: file.name,
      blob: file,
      width: v.videoWidth,
      height: v.videoHeight,
      durationSec: v.duration,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** A slider with its exact value beside it (design system §8.4), as on the volume page. */
export function SliderField({
  label,
  hint,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  const id = useId();
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n)));
  return (
    <Field label={label} labelId={id} hint={hint}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <Slider
            aria-labelledby={id}
            value={value}
            min={min}
            max={max}
            disabled={disabled}
            onValueChange={(n) => onChange(clamp(n))}
          />
        </div>
        <UnitField
          id={`${id}-n`}
          label={`${label}, ${min} to ${max}`}
          value={value}
          min={min}
          max={max}
          onCommit={(n) => onChange(clamp(n))}
        />
      </div>
    </Field>
  );
}

/** A colour swatch that opens the system colour picker; the whole row is the target. */
export function ColorField({
  value,
  label,
  labelledBy,
  disabled,
  onChange,
}: {
  value: Rgb;
  label?: string;
  labelledBy?: string;
  disabled?: boolean;
  onChange: (c: Rgb) => void;
}) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={cn(
        buttonVariants({ variant: "secondary", size: "md" }),
        "relative min-h-11 w-fit gap-3 px-3 has-focus-visible:outline-2 has-focus-visible:outline-ring has-focus-visible:outline-offset-2",
        disabled ? "pointer-events-none opacity-50" : "cursor-pointer",
      )}
    >
      <span
        aria-hidden
        className="size-5 rounded-sm border border-border-strong"
        style={{ backgroundColor: hex(value) }}
      />
      <span className="tabular">{hex(value).toUpperCase()}</span>
      {label && <span className="sr-only">{label}</span>}
      <input
        id={id}
        type="color"
        aria-labelledby={labelledBy}
        value={hex(value)}
        disabled={disabled}
        onChange={(e) => {
          const c = fromHex(e.target.value);
          if (c) onChange(c);
        }}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </label>
  );
}

function KeyPanel({ value, onChange, disabled }: OptionsPanelProps<O>) {
  const keyId = useId();
  const bgId = useId();
  const fitId = useId();
  const endId = useId();
  const soundId = useId();
  const fileId = useId();
  const [error, setError] = useState<string>();
  const bg = value.background;
  const kind = value.bgKind ?? bg.kind;
  const point = pointWord();

  const pickFile = async (file: File | undefined) => {
    if (!file || kind === "color") return;
    try {
      const background = await readBackground(file, kind);
      setError(undefined);
      onChange({ ...value, background, bgKind: kind });
    } catch {
      setError(
        kind === "image"
          ? `${file.name} could not be read as a picture. Use a PNG, JPEG or WebP.`
          : `${file.name} could not be read as a video here. Use an MP4 or WebM.`,
      );
    }
  };

  const keyHint =
    value.keyFrom === "auto"
      ? `Found at the picture's edges. ${point} the background on the picture to pick another.`
      : value.keyFrom === "picked"
        ? `Picked from the picture. ${point} again to change it.`
        : value.keyFrom === "none"
          ? `${point} the background on the picture to pick its colour.`
          : "Looking at the picture's edges.";

  return (
    <div className="flex flex-col gap-6">
      <Field label="Screen colour" labelId={keyId} hint={keyHint}>
        <div className="flex flex-wrap items-center gap-2">
          <ColorField
            value={value.key}
            labelledBy={keyId}
            disabled={disabled}
            onChange={(key) => onChange({ ...value, key, keyFrom: "picked" })}
          />
          <Button
            variant="secondary"
            className="min-h-11"
            disabled={disabled}
            onClick={() => onChange({ ...value, keyFrom: "default" })}
          >
            Detect again
          </Button>
        </div>
      </Field>
      <Field label="Background" labelId={bgId}>
        <div className="flex flex-col gap-3">
          <Segmented
            name="key-background"
            aria-labelledby={bgId}
            value={kind}
            onChange={(k) => {
              setError(undefined);
              onChange({
                ...value,
                bgKind: k,
                background: k === "color" || bg.kind !== k ? { kind: "color" } : bg,
              });
            }}
            options={[
              { value: "color", label: "Colour" },
              { value: "image", label: "Image" },
              { value: "video", label: "Video" },
            ]}
          />
          {kind === "color" ? (
            <ColorField
              value={value.color}
              label="Background colour"
              disabled={disabled}
              onChange={(color) => onChange({ ...value, color })}
            />
          ) : bg.kind !== "color" ? (
            <div className="flex items-center gap-3 rounded-md bg-bg-subtle py-1 pr-1 pl-4 text-sm">
              <ImageIcon
                size={20}
                strokeWidth={1.5}
                aria-hidden
                className="shrink-0 text-fg-muted"
              />
              <div className="min-w-0 flex-1">
                <FileName name={bg.name} />
                <p className="tabular mt-0.5 text-fg-muted text-xs">
                  {formatDimensions(bg.width, bg.height)}
                  {bg.kind === "video" ? ` · ${formatTimecode(bg.durationSec)}` : ""}
                </p>
              </div>
              <Button
                variant="quiet"
                className="min-h-11 px-3"
                disabled={disabled}
                onClick={() => onChange({ ...value, background: { kind: "color" } })}
              >
                Remove
              </Button>
            </div>
          ) : (
            <label
              htmlFor={fileId}
              className={cn(
                buttonVariants({ variant: "secondary", size: "md" }),
                "min-h-11 w-fit has-focus-visible:outline-2 has-focus-visible:outline-ring has-focus-visible:outline-offset-2",
                disabled ? "pointer-events-none opacity-50" : "cursor-pointer",
              )}
            >
              {kind === "image" ? "Choose a background picture" : "Choose a background video"}
              <input
                id={fileId}
                type="file"
                accept={kind === "image" ? BG_ACCEPT_IMAGE : BG_ACCEPT_VIDEO}
                className="sr-only"
                disabled={disabled}
                onChange={(e) => {
                  void pickFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
          )}
          {error && (
            <p className="text-sm" role="alert">
              {error}
            </p>
          )}
        </div>
      </Field>
      {bg.kind !== "color" && (
        <Field
          label="Fit"
          labelId={fitId}
          hint={
            value.fit === "cover"
              ? "Fills the frame; edges of the background may be cut off."
              : "Shows all of the background; the colour fills the rest."
          }
        >
          <Segmented
            name="key-fit"
            aria-labelledby={fitId}
            value={value.fit}
            onChange={(fit) => onChange({ ...value, fit })}
            options={[
              { value: "cover", label: "Fill" },
              { value: "contain", label: "Fit inside" },
            ]}
          />
        </Field>
      )}
      {bg.kind === "video" && (
        <Field label="When the background ends" labelId={endId}>
          <Segmented
            name="key-bg-end"
            aria-labelledby={endId}
            value={value.bgEnd}
            onChange={(bgEnd) => onChange({ ...value, bgEnd })}
            options={[
              { value: "loop", label: "Loop" },
              { value: "hold", label: "Hold last frame" },
            ]}
          />
        </Field>
      )}
      <MoreOptions>
        <SliderField
          label="Tolerance"
          hint="Raise it when patches of the screen stay; lower it when the subject turns see-through."
          value={Math.round(value.tolerance * 100)}
          min={0}
          max={50}
          disabled={disabled}
          onChange={(n) => onChange({ ...value, tolerance: n / 100 })}
        />
        <SliderField
          label="Softness"
          hint="Soft keeps hair and motion blur; lower it for crisp, solid edges."
          value={Math.round(value.softness * 100)}
          min={10}
          max={100}
          disabled={disabled}
          onChange={(n) => onChange({ ...value, softness: n / 100 })}
        />
        <SliderField
          label="Spill"
          hint="Takes the screen's colour out of the subject's edges. Lower it if green clothes go grey."
          value={Math.round(value.spill * 100)}
          min={0}
          max={100}
          disabled={disabled}
          onChange={(n) => onChange({ ...value, spill: n / 100 })}
        />
        <Field label="Sound" labelId={soundId}>
          <Segmented
            name="key-sound"
            aria-labelledby={soundId}
            value={value.sound}
            onChange={(sound) => onChange({ ...value, sound })}
            options={[
              { value: "foreground", label: "Keep the sound" },
              { value: "none", label: "No sound" },
            ]}
          />
        </Field>
      </MoreOptions>
    </div>
  );
}
