"use client";

import { useId } from "react";
import { BorderPreview } from "@/components/tool/crop/border-preview";
import { geometryEstimate } from "@/components/tool/crop/estimate";
import { PreviewScrubber } from "@/components/tool/crop/preview-scrubber";
import { Field } from "@/components/ui/field";
import { NumberInput } from "@/components/ui/number-input";
import { Segmented } from "@/components/ui/segmented";
import { formatBytes, formatDimensions, withUnit } from "@/lib/format";
import { needsFfmpeg } from "@/tools/engines/crop/plan";
import {
  borderDetail,
  borderHow,
  borderLayout,
  borderPresets,
  borderPx,
  borderTooThick,
  colorName,
  type PadOptions,
} from "@/tools/engines/pad/options";
import { soundEncodersNow } from "@/tools/engines/sound-codec";
import type { MediaInfo } from "@/tools/engines/types";
import { between, z } from "./remember-schema";
import type { OptionsSpec } from "./types";
import { unfixable } from "./types";

const src = (info: MediaInfo) => ({
  width: info.video?.width ?? 0,
  height: info.video?.height ?? 0,
});

type ColorChoice = "white" | "black" | "custom";
const colorChoice = (c: string): ColorChoice => (c === "white" || c === "black" ? c : "custom");
/** The last custom colour chosen on this page, so switching back to Custom restores it. */
let lastCustom = "#d9c7a7";

export const padSpec: OptionsSpec<PadOptions> = {
  verb: "Add border",
  previewResult: true,
  // Bars change the frame's shape: side by side (ADR-0135).
  compare: () => ({ what: "picture", layout: "side-by-side" }),
  nextStep: { slug: "compress-video", label: "Compress the result" },
  remember: {
    schema: z.object({
      size: between(0.005, 0.25),
      color: z.string().check(z.regex(/^(white|black|#[0-9a-fA-F]{6})$/)),
      keepSize: z.boolean(),
    }),
  },
  defaults: (_info, preset) => ({
    size: typeof preset.size === "number" ? preset.size : 0.05,
    px: typeof preset.px === "number" ? preset.px : undefined,
    color:
      typeof preset.color === "string" && /^(white|black|#[0-9a-fA-F]{6})$/.test(preset.color)
        ? preset.color
        : "white",
    keepSize: preset.keepSize === true,
  }),
  route: (_o, info, fileName) => (needsFfmpeg(info, fileName) ? "page" : "worker"),
  blocked: (o, info) => {
    const v = info.video;
    if (!v)
      return unfixable("This file has no video track to add a border to. Choose a video file.");
    if (borderTooThick(o, v))
      return `A ${withUnit(borderPx(o, v), "px")} border leaves no room for the picture inside ${formatDimensions(v.width, v.height)}. Choose a thinner one.`;
    return undefined;
  },
  summary: (o, info) => {
    const v = info.video;
    if (!v || borderTooThick(o, v)) return undefined;
    const layout = borderLayout(o, v);
    const est = geometryEstimate(info, layout, soundEncodersNow());
    const how = borderHow(o, v);
    return `${how}, about ${formatBytes(est.bytes)}. The video is re-encoded to H.264. ${est.audio}${est.container}`;
  },
  result: (o, info) => {
    const v = info.video;
    if (!v) return undefined;
    const layout = borderLayout(o, v);
    return {
      title: `${withUnit(borderPx(o, v), "px")} ${colorName(o.color)} border: ${formatDimensions(layout.width, layout.height)}`,
      detail: `${borderDetail(o, v)} The preview plays the result.`,
      change: false,
    };
  },
  Overlay({ value, info, media }) {
    const v = src(info);
    return (
      <BorderPreview
        source={v}
        layout={borderLayout(value, v)}
        color={value.color}
        video={media.video}
      />
    );
  },
  Below({ info, media, disabled }) {
    return (
      <PreviewScrubber file={media.file} video={media.video} info={info} disabled={disabled} />
    );
  },
  Panel({ value, onChange, info }) {
    const sizeId = useId();
    const colorId = useId();
    const fitId = useId();
    const v = src(info);
    const px = borderPx(value, v);
    const preset =
      value.px === undefined
        ? borderPresets.find((p) => Math.abs(p.size - value.size) < 1e-6)?.value
        : undefined;
    const choice = colorChoice(value.color);
    return (
      <div className="flex flex-col gap-6">
        <div aria-live="polite">
          <p className="tabular text-h2" data-testid="border-size">
            <span className="text-fg-muted">{formatDimensions(v.width, v.height)} →</span> {(() => {
              const l = borderLayout(value, v);
              return formatDimensions(l.width, l.height);
            })()}
          </p>
          <p className="tabular mt-1 text-fg-muted text-sm">
            {withUnit(px, "px")} of {colorName(value.color)} on every edge.
          </p>
        </div>
        <Field
          label="Thickness"
          labelId={sizeId}
          hint="A share of the picture's short side, so it looks the same on every video in a batch."
        >
          <Segmented
            name="border-size"
            aria-labelledby={sizeId}
            value={(preset ?? "") as (typeof borderPresets)[number]["value"]}
            onChange={(p) => {
              const b = borderPresets.find((x) => x.value === p);
              if (b) onChange({ ...value, size: b.size, px: undefined });
            }}
            options={borderPresets.map((p) => ({ value: p.value, label: p.label }))}
          />
        </Field>
        <Field
          label="Exact thickness"
          htmlFor="border-px"
          trailing="px"
          hint="Pixels on each edge of this video."
        >
          <NumberInput
            id="border-px"
            min={2}
            max={2000}
            step={2}
            value={px}
            onChange={(e) => {
              const n = Math.round(Number(e.target.value));
              if (e.target.value !== "" && Number.isFinite(n) && n >= 2)
                onChange({ ...value, px: Math.min(2000, n) });
            }}
          />
        </Field>
        <Field label="Colour" labelId={colorId}>
          <div className="flex flex-col gap-2">
            <Segmented
              name="border-color"
              aria-labelledby={colorId}
              value={choice}
              onChange={(c) => onChange({ ...value, color: c === "custom" ? lastCustom : c })}
              options={[
                { value: "white", label: "White" },
                { value: "black", label: "Black" },
                { value: "custom", label: "Custom" },
              ]}
            />
            {choice === "custom" && (
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <input
                  type="color"
                  value={value.color}
                  onChange={(e) => {
                    lastCustom = e.target.value;
                    onChange({ ...value, color: e.target.value });
                  }}
                  className="h-11 w-16 cursor-pointer rounded-md border border-border bg-bg-raised p-1"
                />
                <span>
                  Custom colour{" "}
                  <span className="tabular text-fg-muted">{value.color.toUpperCase()}</span>
                </span>
              </label>
            )}
          </div>
        </Field>
        <Field
          label="Frame"
          labelId={fitId}
          hint={
            value.keepSize
              ? "Same size as the original: fits upload limits, the picture shrinks a little."
              : "The whole picture stays pixel for pixel; the file is larger in width and height."
          }
        >
          <Segmented
            name="border-fit"
            aria-labelledby={fitId}
            value={value.keepSize ? "keep" : "grow"}
            onChange={(f) => onChange({ ...value, keepSize: f === "keep" })}
            options={[
              { value: "grow", label: "Around the picture" },
              { value: "keep", label: "Keep the size" },
            ]}
          />
        </Field>
      </div>
    );
  },
};
