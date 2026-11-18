"use client";

import { Field } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { CHECKED, getPlatform, type PlatformProfile, tierLabel } from "@/content/platforms";
import { withUnit } from "@/lib/format";
import type { IdleProps, IdleSpec } from "../types";

export const mb = (n: number) => withUnit(n, "MB");

export function TierChoice({
  platform,
  targetMb,
  onChange,
  idPrefix,
}: {
  platform: PlatformProfile;
  targetMb: number;
  onChange: (mb: number) => void;
  idPrefix: string;
}) {
  const tier = platform.tiers.find((t) => t.mb === targetMb);
  return (
    <Field
      label={`${platform.name} limit`}
      labelId={`${idPrefix}-tier-label`}
      hint={
        tier
          ? `${tier.note} Checked ${CHECKED.replaceAll("-", "\u2011")}.`
          : "A custom size, set under More options."
      }
    >
      <Segmented
        name={`${idPrefix}-tier`}
        aria-labelledby={`${idPrefix}-tier-label`}
        value={tier ? String(tier.mb) : ""}
        onChange={(v) => onChange(Number(v))}
        // Two tiers side by side; more stacked, so every label reads whole and names who it is for.
        columns={platform.tiers.length === 2 ? 2 : 1}
        options={platform.tiers.map((t) => ({ value: String(t.mb), label: tierLabel(t) }))}
      />
    </Field>
  );
}

/** Before any file: the page's target stated, and a platform's tiers as the one choice to make. */
function CompressIdle({ preset, onPresetChange }: IdleProps) {
  if (preset.preset !== "target") return null;
  const targetMb = (preset.targetMb as number) ?? 25;
  const platform = getPlatform(preset.platform);
  if (platform) {
    return (
      // Raised so the segmented track reads against the drop zone's subtle background.
      <div className="rounded-md border border-border bg-bg-raised p-4 text-left">
        <TierChoice
          platform={platform}
          targetMb={targetMb}
          onChange={(v) => onPresetChange({ targetMb: v })}
          idPrefix="idle"
        />
      </div>
    );
  }
  // The prompt above already names the size.
  return <p className="text-sm">A file that is already small enough is left as it is.</p>;
}

/** Idle state of compress and its size and platform families (types.ts `IdleSpec`). */
export const idle: IdleSpec = {
  dropPrompt: (preset) =>
    preset.preset === "target"
      ? `Drop a video to fit it under ${mb((preset.targetMb as number) ?? 25)}`
      : "Drop a video to make it smaller",
  Idle: CompressIdle,
  several: "batch",
};
