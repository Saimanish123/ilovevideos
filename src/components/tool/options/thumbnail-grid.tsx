"use client";

import { useId } from "react";
import { SheetHero } from "@/components/tool/contact-sheet/sheet-hero";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { NumberInput } from "@/components/ui/number-input";
import { Segmented } from "@/components/ui/segmented";
import { formatDimensions, withUnit } from "@/lib/format";
import {
  formatLabel,
  gridPresets,
  imageFormats,
  interval,
  type SheetFormat,
  sheetLayout,
  type ThumbnailGridOptions,
  tooLarge,
  widthPresets,
} from "@/tools/engines/thumbnail-grid/layout";
import type { MediaInfo } from "@/tools/engines/types";
import type { OptionsPanelProps, OptionsSpec } from "./types";

type O = ThumbnailGridOptions;

/** "11.3 s", "2 min 5 s", for the summary. */
function every(sec: number): string {
  if (sec < 60) return withUnit(Number(sec.toFixed(sec < 10 ? 2 : 1)), "s");
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return s ? `${withUnit(m, "min")} ${withUnit(s, "s")}` : withUnit(m, "min");
}

const layoutOf = (o: O, info: MediaInfo) => sheetLayout(o, info.video ?? { width: 16, height: 9 });

export const thumbnailGridSpec: OptionsSpec<O> = {
  verb: "Make contact sheet",
  defaults: (_info, preset) => ({
    columns: typeof preset.columns === "number" ? preset.columns : 4,
    rows: typeof preset.rows === "number" ? preset.rows : 4,
    width: 1920,
    timestamps: true,
    header: true,
    background: "light",
    format: "jpg",
    quality: 90,
  }),
  // The sheet is what this page is about, so it takes the preview's place, live.
  Hero: SheetHero,
  previewResult: true,
  nextStep: {
    slug: "extract-frame-from-video",
    label: "Save one of the frames at full size",
    with: "source",
  },
  blocked: (o, info) => {
    if (!info.video) return "This file has no video track to take frames from.";
    const l = layoutOf(o, info);
    if (tooLarge(l))
      return `A ${formatDimensions(l.width, l.height)} sheet is larger than a browser can draw. Choose fewer rows or a narrower sheet.`;
    return undefined;
  },
  summary: (o, info) => {
    const l = layoutOf(o, info);
    const n = o.columns * o.rows;
    return `${n} frames, one every ${every(interval(n, info.durationSec))}, on a ${formatDimensions(l.width, l.height)} ${formatLabel[o.format]}. Each frame is decoded from the video; nothing is uploaded.`;
  },
  result: (o, info) => {
    const l = layoutOf(o, info);
    const n = o.columns * o.rows;
    return {
      title: `Contact sheet: ${n} frames on ${formatDimensions(l.width, l.height)}`,
      detail: `${o.columns} columns by ${o.rows} rows, one frame every ${every(interval(n, info.durationSec))}${o.timestamps ? ", each with its time" : ""}.`,
    };
  },
  Panel: SheetPanel,
};

type GridId = `${number}x${number}`;

function SheetPanel({ value, onChange }: OptionsPanelProps<O>) {
  const gridId = useId();
  const widthId = useId();
  const formatId = useId();
  const bgId = useId();
  const grid = `${value.columns}x${value.rows}` as GridId;
  const preset = gridPresets.some((p) => `${p.columns}x${p.rows}` === grid);
  const widthPreset = widthPresets.find((w) => w === value.width);
  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)));
  return (
    <div className="flex flex-col gap-6">
      <Field
        label="Grid"
        labelId={gridId}
        trailing={preset ? undefined : `${value.columns}×${value.rows}`}
        hint="Columns by rows. More frames show more of the video, each one smaller."
      >
        <Segmented<GridId | "">
          name="sheet-grid"
          aria-labelledby={gridId}
          value={preset ? grid : ""}
          onChange={(g) => {
            const [c, r] = g.split("x").map(Number);
            if (c && r) onChange({ ...value, columns: c, rows: r });
          }}
          options={gridPresets.map((p) => ({
            value: `${p.columns}x${p.rows}` as GridId,
            label: `${p.columns}×${p.rows}`,
          }))}
        />
      </Field>
      <Field
        label="Sheet width"
        labelId={widthId}
        trailing={widthPreset ? undefined : withUnit(value.width, "px")}
        hint="1920 fits a screen; 3840 keeps detail for printing or zooming in."
      >
        <Segmented<string>
          name="sheet-width"
          aria-labelledby={widthId}
          value={widthPreset ? String(widthPreset) : ""}
          onChange={(w) => onChange({ ...value, width: Number(w) })}
          options={widthPresets.map((w) => ({ value: String(w), label: withUnit(w, "px") }))}
        />
      </Field>
      <div className="flex flex-col gap-4">
        <Checkbox
          label="Timestamps"
          hint="The time of each frame in its corner."
          checked={value.timestamps}
          onChange={(e) => onChange({ ...value, timestamps: e.target.checked })}
        />
        <Checkbox
          label="File details"
          hint="Name, length, size, codec and frame rate across the top."
          checked={value.header}
          onChange={(e) => onChange({ ...value, header: e.target.checked })}
        />
      </div>
      <Field
        label="Format"
        labelId={formatId}
        hint="JPG keeps the file small; PNG is lossless and larger."
      >
        <Segmented<SheetFormat>
          name="sheet-format"
          aria-labelledby={formatId}
          value={value.format}
          onChange={(format) => onChange({ ...value, format })}
          options={imageFormats.map((f) => ({ value: f, label: formatLabel[f] }))}
        />
      </Field>
      <details className="text-sm">
        <summary className="flex min-h-11 cursor-pointer items-center font-medium">
          More options
        </summary>
        <div className="mt-2 flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Columns" htmlFor="sheet-columns">
              <NumberInput
                id="sheet-columns"
                min={1}
                max={12}
                value={value.columns}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n) && n > 0) onChange({ ...value, columns: clamp(n, 1, 12) });
                }}
              />
            </Field>
            <Field label="Rows" htmlFor="sheet-rows">
              <NumberInput
                id="sheet-rows"
                min={1}
                max={20}
                value={value.rows}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n) && n > 0) onChange({ ...value, rows: clamp(n, 1, 20) });
                }}
              />
            </Field>
          </div>
          <Field label="Background" labelId={bgId}>
            <Segmented<O["background"]>
              name="sheet-background"
              aria-labelledby={bgId}
              value={value.background}
              onChange={(background) => onChange({ ...value, background })}
              options={[
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
              ]}
            />
          </Field>
        </div>
      </details>
    </div>
  );
}
