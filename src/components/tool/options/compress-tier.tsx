"use client";

import { Field } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { getPlatform, type PlatformProfile, tierLabel } from "@/content/platforms";
import type { IdleProps } from "./types";

/**
 * A platform's upload tiers as one choice: the compress platform pages before a file, and the ready
 * state's panel. Apart from the idle module so the platform tables load only on those pages (ADR-0140).
 */
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
      hint={tier ? tier.note : "A custom size, set under More options."}
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

/** A platform page before any file: its tiers as the one choice to make. */
export function PlatformTierIdle({ preset, onPresetChange }: IdleProps) {
  const platform = getPlatform(preset.platform);
  // An unknown platform reads like a size page.
  if (!platform)
    return <p className="text-sm">A file that is already small enough is left as it is.</p>;
  return (
    // Raised so the segmented track reads against the drop zone's subtle background.
    <div className="rounded-md border border-border bg-bg-raised p-4 text-left">
      <TierChoice
        platform={platform}
        targetMb={(preset.targetMb as number) ?? 25}
        onChange={(v) => onPresetChange({ targetMb: v })}
        idPrefix="idle"
      />
    </div>
  );
}
