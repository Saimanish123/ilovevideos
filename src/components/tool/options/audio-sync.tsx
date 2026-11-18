"use client";

import { Field } from "@/components/ui/field";
import { NumberInput } from "@/components/ui/number-input";
import { Segmented } from "@/components/ui/segmented";
import { Slider } from "@/components/ui/slider";
import { withUnit } from "@/lib/format";
import {
  type AudioSyncOptions,
  exactShift,
  MAX_OFFSET_MS,
  type SyncContainer,
  shiftWords,
} from "@/tools/engines/audio-sync/options";
import type { MediaInfo } from "@/tools/engines/types";
import { PLAY_SHORTCUT } from "../shortcuts";
import type { OptionsPanelProps, OptionsSpec } from "./types";

type Direction = "late" | "early";
const SLIDER_MAX = 2000;

/** The container the shift writes, from the inspected name (the engine decides the same way). */
function containerOf(info: MediaInfo): SyncContainer {
  const c = info.container.toLowerCase();
  if (c.includes("quicktime")) return "mov";
  if (c.includes("webm")) return "webm";
  if (c.includes("matroska")) return "mkv";
  if (c.includes("mp4")) return "mp4";
  return info.video?.codec === "vp8" || info.video?.codec === "vp9" ? "mkv" : "mp4";
}

/** One frame of this video, in ms, for the hint. */
const frameMs = (info: MediaInfo) =>
  info.video?.fps && info.video.fps > 0 ? Math.round(1000 / info.video.fps) : undefined;

function SyncPanel({ value, onChange, info }: OptionsPanelProps<AudioSyncOptions>) {
  // "The sound comes too late" is fixed by playing it earlier: a negative shift.
  const direction: Direction = value.offsetMs <= 0 ? "late" : "early";
  const amount = Math.abs(value.offsetMs);
  const set = (d: Direction, ms: number) => {
    const a = Math.round(Math.min(MAX_OFFSET_MS, Math.max(0, ms)));
    onChange({ offsetMs: d === "late" ? -a : a });
  };
  const frame = frameMs(info);
  return (
    <div className="flex flex-col gap-6">
      <Field
        label="The sound comes"
        labelId="direction-label"
        hint={
          direction === "late"
            ? "Lips move before you hear the words: the sound is played earlier."
            : "You hear the words before the lips move: the sound is played later."
        }
      >
        <Segmented
          name="direction"
          aria-labelledby="direction-label"
          value={direction}
          onChange={(d) => set(d, amount)}
          options={[
            { value: "late", label: "Too late" },
            { value: "early", label: "Too early" },
          ]}
        />
      </Field>
      <Field
        label="By"
        labelId="amount-label"
        trailing={shiftWords(amount)}
        hint={`${frame ? `One frame of this video is about ${withUnit(frame, "ms")}. ` : ""}Small faults are often a frame or two; big ones, from a recorder started late, can be seconds.`}
      >
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <Slider
              aria-labelledby="amount-label"
              min={0}
              max={SLIDER_MAX}
              step={10}
              value={Math.min(SLIDER_MAX, amount)}
              onValueChange={(v) => set(direction, v)}
              getAriaValueText={(_f, v) => shiftWords(v)}
            />
          </div>
          <div className="w-24 shrink-0">
            <NumberInput
              aria-label="Shift in milliseconds"
              min={0}
              max={MAX_OFFSET_MS}
              step={1}
              value={amount}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (e.target.value !== "" && Number.isFinite(n)) set(direction, n);
              }}
            />
          </div>
        </div>
      </Field>
      <p className="text-fg-muted text-sm">
        Watch a moment where someone speaks or something hits, then press Fix sync and check the
        result in the preview. If it is still off, adjust and run it again on the original.
      </p>
    </div>
  );
}

export const audioSyncSpec: OptionsSpec<AudioSyncOptions> = {
  verb: "Fix sync",
  Panel: SyncPanel,
  previewResult: true,
  shortcuts: [PLAY_SHORTCUT],
  defaults: (_info, preset) => ({
    offsetMs: typeof preset.offsetMs === "number" ? Math.round(preset.offsetMs) : -200,
  }),
  blocked: (o, info) => {
    if (!info.video)
      return "This file has no picture, so there is nothing to line the sound up with.";
    if (!info.audio?.length) return "This video has no sound track to move.";
    if (o.offsetMs === 0) return "0 ms leaves the sound where it is. Choose how far to move it.";
    return undefined;
  },
  summary: (o, info) => {
    const c = containerOf(info);
    const how = exactShift(c)
      ? "exact to the sample"
      : "to the nearest sound frame, about 20 ms, because WebM and MKV cannot mark a start inside one";
    const tracks =
      (info.audio?.length ?? 0) > 1 ? ` All ${info.audio?.length} sound tracks move together.` : "";
    return `Plays the sound ${shiftWords(o.offsetMs)} ${o.offsetMs < 0 ? "earlier" : "later"}, ${how}. Nothing is re-encoded.${tracks}`;
  },
  result: (o) => ({
    title: `Sound moved ${shiftWords(o.offsetMs)} ${o.offsetMs < 0 ? "earlier" : "later"}`,
    detail:
      o.offsetMs < 0
        ? "The picture is untouched; the last moment of the video is now silent by that much. The preview plays the result."
        : "The picture is untouched; the sound that ran past the end was cut. The preview plays the result.",
    change: false,
  }),
};
