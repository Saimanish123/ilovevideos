"use client";

import { Film, ImageIcon } from "lucide-react";
import { useCallback, useId, useMemo, useRef, useState } from "react";
import { MattePreview, type MatteState } from "@/components/tool/background/matte-preview";
import { PreviewScrubber } from "@/components/tool/crop/preview-scrubber";
import { FileName } from "@/components/tool/file-card";
import { MoreOptions } from "@/components/tool/regions/more-options";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/cn";
import { formatBytes, formatDimensions, formatTimecode } from "@/lib/format";
import { encodedSize } from "@/tools/engines/crop/math";
import { audioCopied, needsFfmpeg, sourceName } from "@/tools/engines/crop/plan";
import { compositeContainer } from "@/tools/engines/overlay/composite";
import {
  backgroundReady,
  effectWords,
  MODELS,
  modelFor,
  type PortraitMatteOptions,
  resultTitle,
} from "@/tools/engines/portrait-matte/options";
import type { MediaInfo } from "@/tools/engines/types";
import {
  BG_ACCEPT_IMAGE,
  BG_ACCEPT_VIDEO,
  ColorField,
  readBackground,
  SliderField,
} from "./chroma-key";
import type { OptionsPanelProps, OptionsSpec } from "./types";
import { unfixable } from "./types";

/**
 * Page-only fields: the preview's person finder (`matte`), which leads the run until it has drawn
 * once, so the first press shows a result already seen. The engine ignores them.
 */
type O = PortraitMatteOptions & { matte?: MatteState };

function soundWords(o: O, info: MediaInfo, fileName: string) {
  if (!info.audio?.length || o.sound === "none" || o.output === "mask") return "no sound";
  return audioCopied(info, compositeContainer(fileName)) ? "sound copied" : "sound in AAC";
}

const outSize = (info: MediaInfo) => {
  const e = encodedSize({ width: info.video?.width ?? 0, height: info.video?.height ?? 0 });
  return formatDimensions(e.width, e.height);
};

export const portraitMatteSpec: OptionsSpec<O> = {
  verb: "Blur background",
  verbFor: (o) =>
    o.output === "mask"
      ? "Make mask"
      : o.effect === "blur"
        ? "Blur background"
        : o.effect === "color"
          ? "Remove background"
          : "Replace background",
  defaults: (_info, preset) => ({
    effect: preset.effect === "color" ? "color" : "blur",
    blur: 40,
    color: [255, 255, 255],
    background: { kind: "color" },
    fit: "cover",
    bgEnd: "loop",
    edge: 35,
    shift: 0,
    output: "result",
    sound: "keep",
    steady: true,
    lookahead: true,
    refine: true,
    matte: { state: "loading" },
  }),
  previewResult: true,
  nextStep: { slug: "compress-video", label: "Compress video" },
  blocked: (o, info, _inputs, file) => {
    if (!info.video) return unfixable("This file has no video track. Choose a video file.");
    if (needsFfmpeg(info, file?.name ?? sourceName(info)))
      return {
        reason:
          info.video.decodable === false
            ? "This browser cannot decode this video's picture, so the person cannot be found here."
            : "This tool cannot open this format. Convert it to MP4 first, then come back.",
        action: { slug: "video-converter", label: "Convert to MP4" },
        fixable: false,
      };
    if (o.matte?.state === "failed") return o.matte.reason;
    if (o.matte?.state !== "ready")
      return `Loading the person finder (${formatBytes(MODELS[modelFor(info.video.width, info.video.height)].bytes)})`;
    if (!backgroundReady(o))
      return o.effect === "image"
        ? "Choose a background picture first."
        : "Choose a background video first.";
    return undefined;
  },
  summary: (o, info) =>
    `${effectWords(o)} · H.264 ${outSize(info)} · ${soundWords(o, info, sourceName(info))}`,
  result: (o, info) => {
    if (!info.video) return undefined;
    return { title: resultTitle(o) };
  },
  Overlay(props) {
    return props.info.video ? <MatteOverlay {...props} /> : null;
  },
  Below({ info, media, disabled }) {
    if (!info.video) return null;
    return (
      <PreviewScrubber file={media.file} video={media.video} info={info} disabled={disabled} />
    );
  },
  Panel: (props) => (props.info.video ? <MattePanel {...props} /> : null),
};

function MatteOverlay({ value, onChange, info, media }: OptionsPanelProps<O>) {
  const w = info.video?.width ?? 0;
  const h = info.video?.height ?? 0;
  const source = useMemo(() => ({ width: w, height: h }), [w, h]);
  // The finder's state lands in the options only when it changes, not on every drawn frame.
  const valueRef = useRef(value);
  valueRef.current = value;
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const onState = useCallback((s: MatteState) => {
    if (valueRef.current.matte?.state === s.state) return;
    changeRef.current({ ...valueRef.current, matte: s });
  }, []);
  return <MattePreview video={media.video} source={source} value={value} onState={onState} />;
}

function MattePanel({ value, onChange, disabled, preset }: OptionsPanelProps<O>) {
  const bgId = useId();
  const fitId = useId();
  const endId = useId();
  const outId = useId();
  const soundId = useId();
  const fileId = useId();
  const [error, setError] = useState<string>();
  const bg = value.background;
  const kind = value.effect;
  const mask = value.output === "mask";

  const pickFile = async (file: File | undefined) => {
    if (!file || (kind !== "image" && kind !== "video")) return;
    try {
      const background = await readBackground(file, kind);
      setError(undefined);
      onChange({ ...value, background });
    } catch {
      setError(
        kind === "image"
          ? `${file.name} could not be read as a picture. Use a PNG, JPEG or WebP.`
          : `${file.name} could not be read as a video here. Use an MP4 or WebM.`,
      );
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {mask ? (
        <p className="text-fg-muted text-sm">Saving the mask only. Change it under More options.</p>
      ) : (
        <>
          <Field label="Background" labelId={bgId}>
            <div className="flex flex-col gap-3">
              <Segmented
                name="matte-background"
                aria-labelledby={bgId}
                value={kind}
                onChange={(k) => {
                  setError(undefined);
                  onChange({
                    ...value,
                    effect: k,
                    background: bg.kind === k ? bg : { kind: "color" },
                  });
                }}
                options={
                  // The remove page leads with what replaces the room; blur comes last there.
                  preset.effect === "color"
                    ? [
                        { value: "color", label: "Colour" },
                        { value: "image", label: "Image" },
                        { value: "video", label: "Video" },
                        { value: "blur", label: "Blur" },
                      ]
                    : [
                        { value: "blur", label: "Blur" },
                        { value: "color", label: "Colour" },
                        { value: "image", label: "Image" },
                        { value: "video", label: "Video" },
                      ]
                }
              />
              {kind === "blur" ? (
                <SliderField
                  label="Strength"
                  hint="Light keeps the room readable; strong turns it into soft colour."
                  value={value.blur}
                  min={1}
                  max={100}
                  disabled={disabled}
                  onChange={(blur) => onChange({ ...value, blur })}
                />
              ) : kind === "color" ? (
                <ColorField
                  value={value.color}
                  label="Background colour"
                  disabled={disabled}
                  onChange={(color) => onChange({ ...value, color })}
                />
              ) : bg.kind !== "color" ? (
                <div className="flex items-center gap-3 rounded-md bg-bg-subtle py-1 pr-1 pl-4 text-sm">
                  {bg.kind === "video" ? (
                    <Film
                      size={20}
                      strokeWidth={1.5}
                      aria-hidden
                      className="shrink-0 text-fg-muted"
                    />
                  ) : (
                    <ImageIcon
                      size={20}
                      strokeWidth={1.5}
                      aria-hidden
                      className="shrink-0 text-fg-muted"
                    />
                  )}
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
                    aria-label={
                      bg.kind === "video" ? "Remove background video" : "Remove background picture"
                    }
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
          {(kind === "image" || kind === "video") && bg.kind !== "color" && (
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
                name="matte-fit"
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
          {kind === "video" && bg.kind === "video" && (
            <Field label="When the background ends" labelId={endId}>
              <Segmented
                name="matte-bg-end"
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
        </>
      )}
      <MoreOptions>
        <SliderField
          label="Edge softness"
          hint="Soft blends hair into the background; lower it for a crisp outline."
          value={value.edge}
          min={0}
          max={100}
          disabled={disabled}
          onChange={(edge) => onChange({ ...value, edge })}
        />
        <SliderField
          label="Edge in or out"
          hint="Lower it if a rim of the old background shows; raise it if hair or hands are cut off."
          value={value.shift}
          min={-50}
          max={50}
          disabled={disabled}
          onChange={(shift) => onChange({ ...value, shift })}
        />
        <Field
          label="Output"
          labelId={outId}
          hint="Mask only saves a black-and-white video of the person for an editor."
        >
          <Segmented
            name="matte-output"
            aria-labelledby={outId}
            value={value.output}
            onChange={(output) => onChange({ ...value, output })}
            options={[
              { value: "result", label: "Video" },
              { value: "mask", label: "Mask only" },
            ]}
          />
        </Field>
        {!mask && (
          <Field label="Sound" labelId={soundId}>
            <Segmented
              name="matte-sound"
              aria-labelledby={soundId}
              value={value.sound}
              onChange={(sound) => onChange({ ...value, sound })}
              options={[
                { value: "keep", label: "Keep the sound" },
                { value: "none", label: "No sound" },
              ]}
            />
          </Field>
        )}
      </MoreOptions>
    </div>
  );
}
