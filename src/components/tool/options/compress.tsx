"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { NumberInput } from "@/components/ui/number-input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { getPlatform } from "@/content/platforms";
import { formatBytes, formatDimensions, formatDuration, withUnit } from "@/lib/format";
import type { CompressOptions } from "@/tools/engines/compress";
import {
  AUDIO_BITRATE,
  estimateBytes,
  type HeightCap,
  MB,
  outputDimensions,
  planTarget,
  type TargetPlan,
  videoBitrateForPreset,
} from "@/tools/engines/compress/math";
import type { MediaInfo } from "@/tools/engines/types";
import { undecodablePicture } from "./decodable";
import { mb, TierChoice } from "./idle/compress";
import type { OptionsSpec } from "./types";

/**
 * Engine options plus the page's platform name, for copy only ("Already fits Discord's 10 MB"). The
 * worker parses options with the engine's schema, which drops the extra key.
 */
type CompressValue = CompressOptions & { platformName?: string };
type HeightValue = CompressOptions["maxHeight"];
const heights: HeightCap[] = ["original", 2160, 1440, 1080, 720, 480, 360];

const kbps = (bps: number) =>
  bps >= 1_000_000
    ? withUnit((bps / 1_000_000).toFixed(1), "Mbps")
    : withUnit(Math.round(bps / 1000), "kbps");

function plan(o: CompressValue, info: MediaInfo): TargetPlan {
  const v = info.video;
  return planTarget(
    o.targetMb * MB,
    {
      width: v?.width ?? 1920,
      height: v?.height ?? 1080,
      fps: v?.fps ?? 30,
      durationSec: info.durationSec,
      hasAudio: (info.audio?.length ?? 0) > 0,
    },
    o.maxHeight,
  );
}

const fitsAlready = (o: CompressValue, info: MediaInfo) =>
  info.sizeBytes > 0 && info.sizeBytes <= o.targetMb * MB;

/** The quality trade-off in plain words: what the size costs the picture and the sound. */
function tradeoff(p: Extract<TargetPlan, { ok: true }>, info: MediaInfo): string {
  const srcH = info.video?.height ?? 0;
  const picture =
    p.height === "original" || p.outHeight >= srcH
      ? `Keeps the full ${srcH}p picture at ${kbps(p.videoBitrate)}.`
      : `Drops from ${srcH}p to ${p.outHeight}p so ${kbps(p.videoBitrate)} still gives a clean picture.`;
  const sound =
    p.audioBitrate === 0
      ? ""
      : p.audioBitrate < AUDIO_BITRATE
        ? ` Sound at ${kbps(p.audioBitrate)}, clear for speech.`
        : "";
  return picture + sound;
}

/** Source size against the limit and the planned result: the fit check that leads the ready state. */
function FitCheck({
  value,
  info,
  onChange,
}: {
  value: CompressValue;
  info: MediaInfo;
  onChange: (next: CompressValue) => void;
}) {
  const fits = fitsAlready(value, info);
  const p = plan(value, info);
  const after = fits ? "As it is" : p.ok ? `≈ ${formatBytes(p.estimatedBytes)}` : "Does not fit";
  // A file that already fits needs nothing; shrinking it anyway is the secondary route.
  const smaller = Math.max(1, Math.floor((info.sizeBytes / MB) * 0.7));
  return (
    <div className="flex flex-col gap-2">
      <dl className="grid grid-cols-3 gap-3 rounded-md bg-bg-subtle p-3 text-sm">
        <div className="min-w-0">
          <dt className="text-fg-muted text-xs">Your file</dt>
          <dd className="tabular mt-1 font-medium">{formatBytes(info.sizeBytes)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-fg-muted text-xs">Limit</dt>
          <dd className="tabular mt-1 font-medium">{mb(value.targetMb)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-fg-muted text-xs">After</dt>
          <dd className="tabular mt-1 font-medium">{after}</dd>
        </div>
      </dl>
      {!fits && p.ok && <p className="text-sm">{tradeoff(p, info)}</p>}
      {fits && smaller * MB < info.sizeBytes && (
        <div>
          <Button
            variant="ghost"
            size="md"
            onClick={() => onChange({ ...value, targetMb: smaller })}
          >
            Make it smaller anyway
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Presets first, target size second (tool-page spec §3). Generated family pages (compress for a
 * platform, compress to under N MB) lock the preset to "target": the fit check leads, a platform's
 * tiers are the one choice, and the exact size and resolution sit under More options.
 */
/** The target field commits valid numbers as you type and restores the last one on blur, never jumping to 1. */
function TargetInput({ value, onCommit }: { value: number; onCommit: (mb: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <NumberInput
      id="targetMb"
      min={1}
      max={4000}
      step={1}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value.trim() !== "" && Number.isFinite(n) && n >= 1 && n <= 4000) onCommit(n);
      }}
      onBlur={() => setText(String(value))}
    />
  );
}

export const compressSpec: OptionsSpec<CompressValue> = {
  verb: "Compress",
  defaults: (info, preset) => {
    const p = (preset.preset as CompressValue["preset"]) ?? "balanced";
    return {
      preset: p,
      targetMb: (preset.targetMb as number) ?? 25,
      platformName: getPlatform(preset.platform)?.name,
      // "step-down" picks the next standard height below the source.
      maxHeight:
        preset.maxHeight === "step-down"
          ? (heights.find((h) => h !== "original" && h < (info.video?.height ?? 1080)) ??
            "original")
          : ((preset.maxHeight as HeightValue) ?? (p === "target" ? "auto" : "original")),
    };
  },
  blocked: (o, info) => {
    const undecodable = undecodablePicture(info);
    if (undecodable) return undecodable;
    if (o.preset !== "target") {
      // A quality preset that would not make this file smaller: say so rather than let Compress
      // grow it (a small GIF-to-MP4 result handed on, for example).
      const v = info.video;
      if (!v) return undefined;
      const height = o.maxHeight === "auto" ? "original" : o.maxHeight;
      const dims = outputDimensions(v.width, v.height, height);
      const est = estimateBytes(
        videoBitrateForPreset(o.preset, dims.width, dims.height, v.fps),
        info.durationSec,
        AUDIO_BITRATE,
      );
      if (est < info.sizeBytes) return undefined;
      return {
        reason: `Already smaller than this setting would make it: ${formatBytes(info.sizeBytes)}, against about ${formatBytes(est)}. Choose Smaller or a lower resolution if you still need less.`,
        settled: true,
      };
    }
    if (fitsAlready(o, info)) {
      const where = o.platformName ? `${o.platformName}'s ` : "";
      return {
        reason: `Already fits ${where}${mb(o.targetMb)} at ${formatBytes(info.sizeBytes)}. Send it as it is; re-encoding would only cost quality.`,
        settled: true,
      };
    }
    const p = plan(o, info);
    if (p.ok) return undefined;
    if (p.reason === "no-duration")
      return "This file does not say how long it is, so a size target cannot be planned. Use a quality preset on the compress page instead.";
    return {
      reason: `Too long to fit: at ${formatDuration(info.durationSec)} this video needs about ${formatBytes(p.minBytes)} even at the lowest watchable quality. Trim it to under ${formatDuration(p.maxDurationSec)}, or choose a larger size.`,
      action: { slug: "trim-video", label: "Trim video" },
    };
  },
  summary: (o, info) => {
    const v = info.video;
    if (!v) return undefined;
    if (o.preset === "target") return "Writes an H.264 MP4 with AAC sound. Runs on this device.";
    const height = o.maxHeight === "auto" ? "original" : o.maxHeight;
    const dims = outputDimensions(v.width, v.height, height);
    const bitrate = videoBitrateForPreset(o.preset, dims.width, dims.height, v.fps);
    const est = estimateBytes(bitrate, info.durationSec, AUDIO_BITRATE);
    return `Estimated ≈ ${formatBytes(est)} at ${formatDimensions(dims.width, dims.height)} from ${formatBytes(info.sizeBytes)}. Runs on this device.`;
  },
  result: (o, info, { bytes }) => {
    if (o.preset === "target") {
      const limit = o.targetMb * MB;
      if (bytes <= limit) {
        return {
          title: `Fits under ${mb(o.targetMb)}: ${formatBytes(bytes)}`,
        };
      }
      return {
        title: `Over ${mb(o.targetMb)} by ${formatBytes(bytes - limit)}`,
        detail:
          "The encoder overshot even after a second pass, which happens with very short or very detailed clips. Change settings to pick a lower resolution, or trim a few seconds and try again.",
        missed: true,
        // Only a miss suggests trimming; a success needs no next step here.
        next: { slug: "trim-video", label: "Trim video" },
      };
    }
    if (bytes >= info.sizeBytes) {
      return {
        title: "No smaller than the original",
        detail:
          "The source is already compressed efficiently, so keep the original. For a smaller file, choose Smaller or a lower resolution.",
        missed: true,
      };
    }
    return {
      title: `${Math.round((1 - bytes / info.sizeBytes) * 100)}% smaller: ${formatBytes(bytes)}`,
    };
  },
  Panel({ value, onChange, info, preset }) {
    const srcHeight = info.video?.height ?? 0;
    const locked = preset.preset === "target";
    const platform = getPlatform(preset.platform);
    const target = value.preset === "target";
    const setPreset = (next: CompressValue["preset"]) => {
      // Auto resolution only means something with a size target; carry the user's choice otherwise.
      const maxHeight: HeightValue =
        next === "target" && value.maxHeight === "original"
          ? "auto"
          : next !== "target" && value.maxHeight === "auto"
            ? "original"
            : value.maxHeight;
      onChange({ ...value, preset: next, maxHeight });
    };
    const heightOptions: HeightValue[] = [
      ...(target ? (["auto"] as const) : []),
      ...heights.filter((h) => h === "original" || srcHeight === 0 || h < srcHeight),
    ];

    const targetField = (
      <Field
        label="Target size"
        htmlFor="targetMb"
        hint="The result lands just under this size. Sound and resolution adjust to fit."
        trailing="MB"
      >
        <TargetInput value={value.targetMb} onCommit={(n) => onChange({ ...value, targetMb: n })} />
      </Field>
    );
    const resolutionField = (
      <Field
        label="Resolution"
        htmlFor="maxHeight"
        hint={
          target
            ? "Auto steps down only when the size leaves too few bits for the full picture."
            : srcHeight > 1080
              ? "Capping at 1080p is invisible on a phone and saves the most."
              : "A lower resolution makes the file smaller still, at some loss of detail."
        }
      >
        <Select
          id="maxHeight"
          value={String(value.maxHeight)}
          onValueChange={(v) =>
            onChange({
              ...value,
              maxHeight:
                v === "original" || v === "auto"
                  ? v
                  : (Number(v) as Exclude<HeightCap, "original">),
            })
          }
          options={heightOptions.map((h) => ({
            value: String(h),
            label:
              h === "auto"
                ? "Auto"
                : h === "original"
                  ? `Keep ${srcHeight ? `${srcHeight}p` : "original"}`
                  : `${h}p`,
          }))}
        />
      </Field>
    );

    if (locked) {
      return (
        <div className="flex min-w-0 flex-col gap-6">
          <FitCheck value={value} info={info} onChange={onChange} />
          {platform && (
            <TierChoice
              platform={platform}
              targetMb={value.targetMb}
              onChange={(v) => onChange({ ...value, targetMb: v })}
              idPrefix="ready"
            />
          )}
          <details className="text-sm">
            <summary className="flex min-h-11 cursor-pointer items-center text-fg-muted hover:text-fg">
              More options
            </summary>
            <div className="mt-3 flex flex-col gap-6">
              {targetField}
              {resolutionField}
            </div>
          </details>
        </div>
      );
    }

    return (
      <div className="flex min-w-0 flex-col gap-6">
        <Field
          label="Preset"
          labelId="preset-label"
          hint="Smaller trades a little sharpness for size. Best keeps fine detail."
        >
          <Segmented
            name="preset"
            aria-labelledby="preset-label"
            value={value.preset}
            onChange={setPreset}
            options={[
              { value: "smaller", label: "Smaller" },
              { value: "balanced", label: "Balanced" },
              { value: "best", label: "Best" },
              { value: "target", label: "Size" },
            ]}
          />
        </Field>
        {target && <FitCheck value={value} info={info} onChange={onChange} />}
        {target && targetField}
        {resolutionField}
      </div>
    );
  },
};
