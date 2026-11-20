"use client";

import { useId, useState } from "react";
import { Field } from "@/components/ui/field";
import { NumberInput } from "@/components/ui/number-input";
import { formatDimensions } from "@/lib/format";
import type { FramerateOptions } from "@/tools/engines/framerate";
import {
  cadence,
  defaultTarget,
  type FpsPreset,
  formatFps,
  fpsUse,
  lowersRate,
  MIN_FPS,
  outputFrames,
  presetsBelow,
} from "@/tools/engines/framerate/math";
import { soundEncodersNow } from "@/tools/engines/sound-codec";
import type { MediaInfo } from "@/tools/engines/types";
import {
  containerNote,
  lineSoundCodec,
  needsFfmpeg,
  pictureContainer,
  pictureEstimate,
  soundLine,
  soundPlan,
  sourceName,
} from "@/tools/engines/video-filter/plan";
import { type Choice, Choices } from "./choices";
import { pictureSize, sizeNote } from "./picture-size";
import type { OptionsSpec } from "./types";
import { unfixable } from "./types";

const sourceFps = (info: MediaInfo) => info.video?.fps ?? 0;

/** "Keeps every 2nd frame: motion stays even." */
function cadenceLine(source: number, target: number): string {
  const c = cadence(source, target);
  const s = `${c.text.charAt(0).toUpperCase()}${c.text.slice(1)}`;
  return c.even
    ? `${s}: motion stays even.`
    : `${s}: slow pans and scrolling text step slightly unevenly.`;
}

export const framerateSpec: OptionsSpec<FramerateOptions> = {
  verb: "Change frame rate",
  previewResult: true,
  nextStep: { slug: "compress-video", label: "Compress the result" },
  defaults: (info, preset) => {
    const src = sourceFps(info);
    const asked = typeof preset.fps === "number" ? preset.fps : undefined;
    const fps = asked !== undefined && lowersRate(src, asked) ? asked : (defaultTarget(src) ?? 30);
    return { fps };
  },
  route: (_o, info, fileName) => (needsFfmpeg(info, fileName) ? "page" : "worker"),
  blocked: (o, info) => {
    const v = info.video;
    if (!v) return unfixable("This file has no video track. Choose a video file.");
    if (presetsBelow(v.fps).length === 0 && !lowersRate(v.fps, o.fps))
      return {
        reason: `This video is ${formatFps(v.fps)}, already at or below the lowest rate this tool writes. Raising it would only repeat frames.`,
        settled: true,
      };
    if (!lowersRate(v.fps, o.fps))
      return `This video is ${formatFps(v.fps)}. Choose a lower rate: raising it would only repeat frames.`;
    return undefined;
  },
  summary: (o, info) => {
    const v = info.video;
    if (!v || !lowersRate(v.fps, o.fps)) return undefined;
    const est = pictureEstimate(info, v, soundEncodersNow(), o.fps);
    const to = pictureContainer(sourceName(info));
    const out = pictureSize(info);
    return `Output ${formatDimensions(out.width, out.height)} at ${formatFps(o.fps)}, ${est.label}.${sizeNote(info)} The picture is re-encoded to H.264; frames are dropped, never blended. ${soundLine(needsFfmpeg(info, sourceName(info)) ? "encode" : soundPlan(info, to), false, lineSoundCodec(info, to, soundEncodersNow()))}${containerNote(info)}`;
  },
  result: (o, info) => {
    const v = info.video;
    if (!v) return undefined;
    const frames = outputFrames(info.durationSec, o.fps);
    return {
      title: `Now ${formatFps(o.fps)}: ${frames.toLocaleString("en")} frames`,
      detail: `${cadenceLine(v.fps, o.fps)} The length and the sound are unchanged; the preview plays the result.`,
      change: false,
    };
  },
  Panel({ value, onChange, info }) {
    const labelId = useId();
    const [outOfRange, setOutOfRange] = useState<string>();
    const src = sourceFps(info);
    const below = presetsBelow(src);
    const lowers = lowersRate(src, value.fps);
    const options: Choice<string>[] = below.map((p: FpsPreset) => ({
      value: String(p),
      label: formatFps(p),
      detail: fpsUse[p],
    }));
    const selected = (below as number[]).includes(value.fps) ? String(value.fps) : undefined;
    return (
      <div className="flex flex-col gap-6">
        <div aria-live="polite">
          <p className="tabular text-h2" data-testid="fps-change">
            <span className="text-fg-muted">{formatFps(src)} →</span> {formatFps(value.fps)}
          </p>
          <p className="tabular mt-1 text-fg-muted text-sm">
            {lowers
              ? `${cadenceLine(src, value.fps)} ${outputFrames(info.durationSec, value.fps).toLocaleString("en")} frames instead of ${outputFrames(info.durationSec, src).toLocaleString("en")}.`
              : "Choose a rate below the source's."}
          </p>
        </div>
        {options.length > 0 && (
          <Field
            label="New frame rate"
            labelId={labelId}
            hint="Only rates below this video's are offered: without motion interpolation, a higher rate only repeats frames."
          >
            <Choices
              name="fps"
              aria-labelledby={labelId}
              columns={options.length > 4 ? 3 : Math.max(1, options.length)}
              value={selected}
              onChange={(v) => onChange({ fps: Number(v) })}
              options={options}
            />
          </Field>
        )}
        <Field
          label="Exact rate"
          htmlFor="fps-exact"
          trailing="fps"
          hint={outOfRange ?? "For broadcast rates such as 23.976 or 29.97."}
        >
          <NumberInput
            id="fps-exact"
            min={MIN_FPS}
            max={Math.max(MIN_FPS, Math.floor(src * 1000) / 1000)}
            step={0.001}
            value={value.fps}
            onChange={(e) => {
              const n = Number(e.target.value);
              // A rate the tool cannot write keeps the last valid one, and says why instead of
              // ignoring the typing.
              if (e.target.value !== "" && Number.isFinite(n) && n < MIN_FPS) {
                setOutOfRange(
                  `The lowest rate is ${formatFps(MIN_FPS)}; ${formatFps(value.fps)} is kept.`,
                );
                return;
              }
              setOutOfRange(undefined);
              if (e.target.value !== "" && Number.isFinite(n)) onChange({ fps: Math.min(240, n) });
            }}
          />
        </Field>
      </div>
    );
  },
};
