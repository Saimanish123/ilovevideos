"use client";

import { ArrowLeftRight, ArrowUpDown } from "lucide-react";
import { useId } from "react";
import { LayoutPreview } from "@/components/tool/layout/layout-preview";
import { MoreOptions } from "@/components/tool/regions/more-options";
import { UnitField } from "@/components/tool/regions/percent-field";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { formatBytes, formatDimensions, formatDuration } from "@/lib/format";
import {
  frameSize,
  type LayoutOptions,
  layoutBitrate,
  MAX_OFFSET,
  outputLength,
} from "@/tools/engines/layout/options";
import { soundCodecName, soundEncodersNow, writtenSoundCodec } from "@/tools/engines/sound-codec";
import type { MediaInfo } from "@/tools/engines/types";
import { nativeOnly } from "./native-only";
import { between, z } from "./remember-schema";
import type { OptionsSpec, StageInput } from "./types";

type Pair = { main: StageInput; second: StageInput };

/** The two inputs as the options put them (`swap`), or undefined until both are in. */
function pairOf(o: LayoutOptions, inputs: StageInput[] | undefined): Pair | undefined {
  const [x, y] = inputs ?? [];
  if (!x || !y) return undefined;
  return o.swap ? { main: y, second: x } : { main: x, second: y };
}

const sizeOf = (i: MediaInfo) => ({ width: i.video?.width ?? 2, height: i.video?.height ?? 2 });

const sizes = [
  { value: "0.25", label: "Small" },
  { value: "0.33", label: "Medium" },
  { value: "0.45", label: "Large" },
] as const;
const corners = [
  { value: "tl", label: "Top left" },
  { value: "tr", label: "Top right" },
  { value: "bl", label: "Bottom left" },
  { value: "br", label: "Bottom right" },
] as const;

const names = (o: LayoutOptions) =>
  o.layout === "pip"
    ? (["Main picture", "Inset"] as const)
    : o.layout === "side"
      ? (["Left", "Right"] as const)
      : (["Top", "Bottom"] as const);

function estimate(o: LayoutOptions, pair: Pair) {
  const frame = frameSize(o, sizeOf(pair.main.info), sizeOf(pair.second.info));
  const fps = Math.min(
    60,
    Math.max(pair.main.info.video?.fps || 30, pair.second.info.video?.fps || 30),
  );
  const sec = outputLength(o, pair.main.info.durationSec, pair.second.info.durationSec);
  const a = pair.main.info.video;
  const b = pair.second.info.video;
  const kbps = a && b ? layoutBitrate(o, a, b, fps) : 0;
  const bytes = ((kbps + 192_000) * sec) / 8;
  return { frame, fps, sec, bytes };
}

export const layoutSpec: OptionsSpec<LayoutOptions> = {
  verb: "Combine",
  previewResult: true,
  // Several videos in one frame: no one source to compare with (ADR-0134).
  compare: false,
  multiple: {
    min: 2,
    max: 2,
    noun: "video",
    // The rows say what each video is in the layout, in the order Swap puts them.
    roles: (inputs, value) => {
      const [main, second] = value ? names(value) : (["Video 1", "Video 2"] as const);
      const order = value?.swap ? [second, main] : [main, second];
      return inputs.map((_, i) => order[i]);
    },
  },
  nextStep: { slug: "compress-video", label: "Compress the result" },
  shortcuts: [
    { keys: "← → ↑ ↓", label: "Move the focused inset" },
    { keys: "Shift ← →", label: "Move it further" },
  ],
  remember: {
    schema: z.object({
      fit: z.enum(["cover", "contain"]),
      radius: between(0, 0.5),
      border: between(0, 0.04),
      borderColor: z.enum(["white", "black"]),
      sound: z.enum(["main", "second", "both"]),
      ended: z.enum(["hold", "hide"]),
    }),
  },
  defaults: (_info, preset) => ({
    layout: preset.layout === "side" || preset.layout === "stack" ? preset.layout : "pip",
    frame: "auto",
    fit: "cover",
    inset: { x: 0.82, y: 0.79, width: 0.33, corner: "br" },
    radius: 0.08,
    border: 0,
    borderColor: "white",
    offset: 0,
    sound: "main",
    ended: "hold",
    swap: false,
  }),
  inputNotes: (_o, inputs) =>
    inputs.map((input) =>
      !input.info.video
        ? "No picture: choose a video."
        : input.info.audio?.length
          ? undefined
          : "No sound.",
    ),
  blocked: (o, _info, inputs) => {
    if ((inputs?.length ?? 0) < 2) return "Add the second video.";
    for (const i of inputs ?? []) {
      if (!i.info.video) return `${i.file.name} has no picture.`;
      const native = nativeOnly(i.info, i.file.name);
      if (native) return native;
    }
    const pair = pairOf(o, inputs);
    if (pair && outputLength(o, pair.main.info.durationSec, pair.second.info.durationSec) <= 0)
      return "With this offset nothing would play. Move the second video's start.";
    if (pair && o.layout === "pip" && o.offset >= pair.main.info.durationSec)
      return "The inset would start after the main video ends. Lower its start.";
    return undefined;
  },
  summary: (o, _info, inputs) => {
    const pair = pairOf(o, inputs);
    if (!pair) return undefined;
    const e = estimate(o, pair);
    const hasA = !!pair.main.info.audio?.length;
    const hasB = !!pair.second.info.audio?.length;
    const sound =
      !hasA && !hasB
        ? "no sound"
        : o.sound === "both" && hasA && hasB
          ? `both sounds mixed under −1 dB, ${soundCodecName(writtenSoundCodec("mp4", soundEncodersNow()))}`
          : soundCodecName(writtenSoundCodec("mp4", soundEncodersNow()));
    return `${formatDimensions(e.frame.width, e.frame.height)} · ${formatDuration(e.sec)} · ≈ ${formatBytes(e.bytes)} · H.264, ${sound}`;
  },
  result: (o) => ({
    title:
      o.layout === "pip"
        ? "Picture in picture made"
        : o.layout === "side"
          ? "Side by side made"
          : "Stacked",
    change: false,
  }),
  Below({ value, onChange, media, disabled }) {
    const pair = pairOf(value, media.inputs);
    if (!pair?.main.info.video || !pair.second.info.video) return null;
    const clip = (i: StageInput) => ({
      file: i.file,
      size: sizeOf(i.info),
      duration: i.info.durationSec,
      hasSound: !!i.info.audio?.length,
    });
    const [first, second] = names(value);
    return (
      <div className="flex flex-col gap-2">
        <LayoutPreview
          value={value}
          onChange={onChange}
          main={clip(pair.main)}
          second={clip(pair.second)}
          disabled={disabled}
        />
        {/* Right above the file list, whose rows name each video's place. */}
        <Button
          size="md"
          className="self-start"
          disabled={disabled}
          onClick={() => onChange({ ...value, swap: !value.swap })}
        >
          {value.layout === "stack" ? (
            <ArrowUpDown size={16} strokeWidth={1.5} aria-hidden />
          ) : (
            <ArrowLeftRight size={16} strokeWidth={1.5} aria-hidden />
          )}
          Swap {first.toLowerCase()} and {second.toLowerCase()}
        </Button>
      </div>
    );
  },
  Panel({ value, onChange, preset, media }) {
    const layoutId = useId();
    const frameId = useId();
    const sizeId = useId();
    const cornerId = useId();
    const soundId = useId();
    const offsetId = useId();
    const fitId = useId();
    const radiusId = useId();
    const borderId = useId();
    const endId = useId();
    const pair = pairOf(value, media.inputs);
    const [first, second] = names(value);
    const four =
      !!pair &&
      [pair.main, pair.second].every(
        (i) => (i.info.video?.width ?? 0) * (i.info.video?.height ?? 0) >= 3840 * 2160 * 0.9,
      );
    const isPip = value.layout === "pip";
    const pinned = preset.layout === "pip";
    const setCorner = (corner: (typeof corners)[number]["value"]) =>
      onChange({ ...value, inset: { ...value.inset, corner } });
    const corner = value.inset.corner ?? "";
    const sizePreset =
      sizes.find((s) => Math.abs(Number(s.value) - value.inset.width) < 0.005)?.value ?? "";
    return (
      <div className="flex flex-col gap-6">
        {!pinned && (
          <Field label="Layout" labelId={layoutId}>
            <Segmented
              name="layout-kind"
              aria-labelledby={layoutId}
              value={value.layout === "pip" ? "side" : value.layout}
              onChange={(layout) => onChange({ ...value, layout })}
              options={[
                { value: "side", label: "Side by side" },
                { value: "stack", label: "Top and bottom" },
              ]}
            />
          </Field>
        )}
        {isPip && (
          <>
            <Field
              label="Inset size"
              labelId={sizeId}
              hint="Or drag the inset on the preview to place it."
            >
              <Segmented
                name="layout-inset-size"
                aria-labelledby={sizeId}
                value={sizePreset as (typeof sizes)[number]["value"]}
                onChange={(v) =>
                  onChange({ ...value, inset: { ...value.inset, width: Number(v) } })
                }
                options={[...sizes]}
              />
            </Field>
            <Field label="Corner" labelId={cornerId}>
              <Segmented
                name="layout-corner"
                aria-labelledby={cornerId}
                value={corner as (typeof corners)[number]["value"]}
                onChange={(c) => setCorner(c)}
                options={[...corners]}
                columns={2}
              />
            </Field>
          </>
        )}
        <Field
          label="Output frame"
          labelId={frameId}
          hint={
            four
              ? "Two 4K videos are decoded at once; on a phone that may be slow or run out of memory."
              : value.frame === "auto"
                ? isPip
                  ? "The main video's shape."
                  : "Both pictures whole, at one height."
                : "Fills the frame; each picture is cut to fit."
          }
        >
          <Segmented
            name="layout-frame"
            aria-labelledby={frameId}
            value={value.frame}
            onChange={(frame) => onChange({ ...value, frame })}
            options={[
              { value: "auto", label: "Auto" },
              { value: "16:9", label: "16:9" },
              { value: "9:16", label: "9:16" },
              { value: "1:1", label: "1:1" },
            ]}
          />
        </Field>
        <Field label="Sound" labelId={soundId}>
          <Segmented
            name="layout-sound"
            aria-labelledby={soundId}
            value={value.sound}
            onChange={(sound) => onChange({ ...value, sound })}
            options={[
              { value: "main", label: first },
              { value: "second", label: second },
              { value: "both", label: "Both" },
            ]}
          />
        </Field>
        <Field
          label={isPip ? "Inset starts" : `${second} video starts`}
          htmlFor={offsetId}
          hint="Later (positive) or earlier (negative) than the other, to line them up."
        >
          <UnitField
            id={offsetId}
            label={isPip ? "Inset starts, seconds" : `${second} video starts, seconds`}
            value={value.offset}
            min={-MAX_OFFSET}
            max={MAX_OFFSET}
            step={0.05}
            decimals={3}
            unit="s"
            onCommit={(offset) => {
              if (offset !== value.offset) onChange({ ...value, offset });
            }}
          />
        </Field>
        <MoreOptions>
          {isPip ? (
            <Field label="Corners" labelId={radiusId}>
              <Segmented
                name="layout-radius"
                aria-labelledby={radiusId}
                value={value.radius === 0 ? "0" : value.radius >= 0.15 ? "0.16" : "0.08"}
                onChange={(v) => onChange({ ...value, radius: Number(v) })}
                options={[
                  { value: "0", label: "Square" },
                  { value: "0.08", label: "Rounded" },
                  { value: "0.16", label: "Round" },
                ]}
              />
            </Field>
          ) : (
            value.frame !== "auto" && (
              <Field label="Fit" labelId={fitId}>
                <Segmented
                  name="layout-fit"
                  aria-labelledby={fitId}
                  value={value.fit}
                  onChange={(fit) => onChange({ ...value, fit })}
                  options={[
                    { value: "cover", label: "Fill, cut edges" },
                    { value: "contain", label: "Whole, with bars" },
                  ]}
                />
              </Field>
            )
          )}
          <Field label={isPip ? "Border" : "Gap"} labelId={borderId}>
            <Segmented
              name="layout-border"
              aria-labelledby={borderId}
              value={
                value.border === 0
                  ? "none"
                  : `${value.borderColor}-${value.border >= 0.015 ? "thick" : "thin"}`
              }
              onChange={(v) => {
                if (v === "none") return onChange({ ...value, border: 0 });
                const [color, weight] = v.split("-") as ["white" | "black", string];
                onChange({
                  ...value,
                  borderColor: color,
                  border: weight === "thick" ? 0.02 : 0.008,
                });
              }}
              options={[
                { value: "none", label: "None" },
                { value: "white-thin", label: "White" },
                { value: "white-thick", label: "White, thick" },
                { value: "black-thin", label: "Black" },
              ]}
              columns={2}
            />
          </Field>
          <Field
            label="When a video is not playing"
            labelId={endId}
            hint="Before it starts or after it ends."
          >
            <Segmented
              name="layout-ended"
              aria-labelledby={endId}
              value={value.ended}
              onChange={(ended) => onChange({ ...value, ended })}
              options={[
                { value: "hold", label: "Hold its frame" },
                { value: "hide", label: "Hide it" },
              ]}
            />
          </Field>
        </MoreOptions>
      </div>
    );
  },
};
