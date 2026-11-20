"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { withUnit } from "@/lib/format";
import type { AudioTracksOptions } from "@/tools/engines/audio-tracks/options";
import { codecName } from "@/tools/engines/convert-video/plan";
import { findLanguage } from "@/tools/engines/subtitles/languages";
import type { MediaInfo } from "@/tools/engines/types";
import { PLAY_SHORTCUT } from "../shortcuts";
import type { OptionsPanelProps, OptionsSpec } from "./types";
import { unfixable } from "./types";

type Track = NonNullable<MediaInfo["audio"]>[number];

const languageName = (code: string | undefined) =>
  code ? (findLanguage(code)?.name ?? code.toUpperCase()) : undefined;

const layout = (n: number) =>
  n === 1
    ? "mono"
    : n === 2
      ? "stereo"
      : n === 6
        ? "5.1"
        : n === 8
          ? "7.1"
          : withUnit(n, "channels");

/** "Commentary", else the language, else "Track 2": what a person calls the track. */
export const trackTitle = (t: Track, i: number) =>
  t.name?.trim() || languageName(t.language) || `Track ${i + 1}`;

/** "English · AAC · stereo · 128 kbps": the facts that tell tracks apart. */
const trackFacts = (t: Track) =>
  [
    t.name?.trim() ? languageName(t.language) : undefined,
    codecName(t.codec) ?? t.codec,
    layout(t.channels),
    t.bitrate && t.bitrate > 0 ? withUnit(Math.round(t.bitrate / 1000), "kbps") : undefined,
    t.default ? "default" : undefined,
  ]
    .filter(Boolean)
    .join(" · ");

/** What the output will be: the container the copy writes into (the engine decides the same way). */
const isMatroska = (info: MediaInfo) => /matroska|webm/i.test(info.container);

function TracksPanel({ value, onChange, info }: OptionsPanelProps<AudioTracksOptions>) {
  const tracks = info.audio ?? [];
  const kept = new Set(value.keep);
  const toggle = (i: number, on: boolean) => {
    const next = new Set(kept);
    if (on) next.add(i);
    else next.delete(i);
    const keep = [...next].sort((a, b) => a - b);
    if (keep.length === 0) return onChange({ keep: [i], primary: i });
    onChange({ keep, primary: next.has(value.primary) ? value.primary : (keep[0] ?? i) });
  };
  const keptList = value.keep.filter((i) => i < tracks.length);
  return (
    <div className="flex flex-col gap-6">
      <fieldset>
        <legend className="font-medium text-sm">
          Keep
          <span className="tabular ml-2 font-normal text-fg-muted">
            {keptList.length} of {tracks.length}
          </span>
        </legend>
        <ul className="mt-3 flex flex-col divide-y divide-border rounded-md border border-border">
          {tracks.map((t, i) => (
            // Each row is one track; the checkbox's label carries its facts.
            <li key={`${i}-${t.codec}`} className="flex min-h-11 items-center px-3 py-2">
              <Checkbox
                label={trackTitle(t, i)}
                hint={trackFacts(t)}
                checked={kept.has(i)}
                onChange={(e) => toggle(i, e.target.checked)}
              />
            </li>
          ))}
        </ul>
        <p className="mt-2 text-fg-muted text-xs">
          At least one stays. To remove every sound track, use Remove audio from video.
        </p>
      </fieldset>
      {keptList.length > 1 && (
        <Field
          label="Plays first"
          labelId="primary-label"
          hint="Written first and marked default, so players and phones start with it."
        >
          <Segmented
            name="primary"
            aria-labelledby="primary-label"
            value={String(value.primary)}
            onChange={(p) => onChange({ ...value, primary: Number(p) })}
            options={keptList.map((i) => ({
              value: String(i),
              label: tracks[i] ? trackTitle(tracks[i], i) : `Track ${i + 1}`,
            }))}
            columns={Math.min(3, keptList.length)}
          />
        </Field>
      )}
    </div>
  );
}

/** Starting point: the default track (or the first), which is what a player would pick anyway. */
function defaultTrack(info: MediaInfo): number {
  const i = info.audio?.findIndex((t) => t.default) ?? -1;
  return i >= 0 ? i : 0;
}

export const audioTracksSpec: OptionsSpec<AudioTracksOptions> = {
  verb: "Keep tracks",
  Panel: TracksPanel,
  previewResult: true,
  // Tracks kept or dropped as they are: identical where they exist (ADR-0134).
  compare: false,
  shortcuts: [PLAY_SHORTCUT],
  // The tracks are this file's own: several files cannot share one choice.
  batch: false,
  defaults: (info) => {
    const d = defaultTrack(info);
    return { keep: [d], primary: d };
  },
  blocked: (o, info) => {
    const n = info.audio?.length ?? 0;
    if (n === 0)
      return unfixable("This file has no sound track to choose from. Choose a file with sound.");
    if (n === 1)
      return {
        reason: "This video has one sound track, so there is nothing to choose.",
        settled: true,
        action: { slug: "remove-audio-from-video", label: "Remove the sound instead" },
      };
    const order = [o.primary, ...o.keep.filter((i) => i !== o.primary).sort((a, b) => a - b)];
    const same = order.length === n && order.every((v, k) => v === k) && defaultTrack(info) === 0;
    if (same)
      return "Every track is kept in its own order. Untick one, or choose another to play first.";
    return undefined;
  },
  summary: (o, info) => {
    const n = info.audio?.length ?? 0;
    const dropped = n - o.keep.length;
    const lead =
      dropped > 0 ? `Removes ${dropped} of ${n} sound tracks. ` : "Keeps every sound track. ";
    const matroska = isMatroska(info)
      ? " Subtitle tracks, chapters and attachments are not carried over."
      : " Subtitle tracks are not carried over.";
    return `${lead}Picture and sound are copied, not re-encoded.${matroska}`;
  },
  result: (o, info) => {
    const tracks = info.audio ?? [];
    const first = tracks[o.primary];
    return {
      title: `${o.keep.length} of ${tracks.length} sound ${tracks.length === 1 ? "track" : "tracks"} kept`,
      detail: first
        ? `${trackTitle(first, o.primary)} plays first. Nothing was re-encoded. The preview plays the result.`
        : undefined,
      change: false,
    };
  },
};
