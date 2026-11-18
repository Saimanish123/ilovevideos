"use client";

import { useEffect, useId, useRef } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { withUnit } from "@/lib/format";
import {
  DEFAULT_RINGTONE_SEC,
  fitPart,
  RINGTONE_KBPS,
  type RingtoneOptions,
  ringtoneFormat,
  suggestPart,
} from "@/tools/engines/ringtone/options";
import { MoreOptions } from "../regions/more-options";
import { UnitField } from "../regions/percent-field";
import { PLAY_SHORTCUT } from "../shortcuts";
import { RangeLayer } from "../sound/range-layer";
import { SoundHero } from "../sound/sound-hero";
import { useSoundAnalysis } from "../sound/use-sound-analysis";
import type { HeroProps, OptionsPanelProps, OptionsSpec } from "./types";

const secs = (s: number) => withUnit((Math.round(s * 10) / 10).toFixed(1), "s");

function RingtonePanel({ value, onChange, info, media }: OptionsPanelProps<RingtoneOptions>) {
  const duration = info.durationSec;
  // The loudest 30 s, once the levels are in, unless the part was already moved.
  const analysis = useSoundAnalysis(media.file, { levels: true });
  // The options as last sent, not as last rendered: two quick commits (start, then end) compose
  // even when the second comes before the re-render that the first causes, and a render for another reason (the waveform, the levels) can still carry the options from before
  // the last commit, so what was sent stands until the stage hands that same object back.
  const sent = useRef<RingtoneOptions | null>(null);
  const seen = useRef(value);
  if (value !== seen.current) {
    // The stage has new options (ours, or a drag on the waveform): they stand.
    seen.current = value;
    sent.current = null;
  }
  const latest = useRef(value);
  latest.current = sent.current ?? value;
  const apply = (patch: Partial<RingtoneOptions>) => {
    const next = { ...latest.current, ...patch };
    latest.current = next;
    sent.current = next;
    onChange(next);
  };
  const levels = analysis.result?.levels;
  // Until then the page waits (`blocked`), so a run never uses a part the page is about to move.
  const failed = analysis.status === "failed";
  useEffect(() => {
    if (latest.current.suggested === false) return;
    if (levels) apply({ ...suggestPart(levels, duration), suggested: false });
    // Levels that cannot be read: keep the first 30 s and let the job run.
    else if (failed) apply({ suggested: false });
  }, [levels, failed, duration, onChange]);

  const part = fitPart(value, duration);
  const length = part.end - part.start;
  const setPart = (next: { start: number; end: number }) =>
    apply({ ...fitPart(next, duration), suggested: false });
  const current = () => fitPart(latest.current, duration);
  const ids = {
    start: useId(),
    end: useId(),
    fadeIn: useId(),
    fadeOut: useId(),
    part: useId(),
    phone: useId(),
    android: useId(),
  };
  return (
    <div className="flex flex-col gap-6">
      <Field
        label="Part"
        labelId={ids.part}
        trailing={secs(length)}
        hint={
          analysis.status === "measuring" && value.suggested !== false
            ? "Finding the loudest 30 seconds, often the chorus."
            : "Drag the handles on the waveform, or type the start and end."
        }
      >
        <div className="flex items-center gap-3">
          <UnitField
            id={ids.start}
            label="Start, seconds"
            value={part.start}
            min={0}
            max={Math.max(0, duration - 1)}
            step={0.1}
            decimals={1}
            unit="s"
            onCommit={(start) => setPart({ start, end: Math.max(current().end, start + 1) })}
          />
          <span className="text-fg-muted text-sm" aria-hidden>
            to
          </span>
          <UnitField
            id={ids.end}
            label="End, seconds"
            value={part.end}
            min={Math.min(1, duration)}
            max={duration}
            step={0.1}
            decimals={1}
            unit="s"
            onCommit={(end) => setPart({ start: Math.min(current().start, end - 1), end })}
          />
        </div>
      </Field>
      <Field
        label="Phone"
        labelId={ids.phone}
        hint={
          value.phone === "iphone"
            ? "An .m4r file (AAC), the kind of ringtone an iPhone takes."
            : value.androidFormat === "mp3"
              ? "An MP3 file, which Android phones play as a ringtone."
              : "An OGG (Vorbis) file, which Android phones also play."
        }
      >
        <Segmented
          name="phone"
          aria-labelledby={ids.phone}
          value={value.phone}
          onChange={(phone) => apply({ phone })}
          options={[
            { value: "iphone", label: "iPhone" },
            { value: "android", label: "Android" },
          ]}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fade in" htmlFor={ids.fadeIn}>
          <UnitField
            id={ids.fadeIn}
            label="Fade in, seconds"
            value={value.fadeIn}
            min={0}
            max={10}
            step={0.1}
            decimals={1}
            unit="s"
            onCommit={(fadeIn) => apply({ fadeIn })}
          />
        </Field>
        <Field label="Fade out" htmlFor={ids.fadeOut}>
          <UnitField
            id={ids.fadeOut}
            label="Fade out, seconds"
            value={value.fadeOut}
            min={0}
            max={10}
            step={0.1}
            decimals={1}
            unit="s"
            onCommit={(fadeOut) => apply({ fadeOut })}
          />
        </Field>
      </div>
      <MoreOptions>
        <Checkbox
          label="Make it louder"
          hint="Brings the part to −14 LUFS, with peaks held under −1 dBTP. Leave it off for a song that is already loud."
          checked={value.normalize}
          onChange={(e) => apply({ normalize: e.target.checked })}
        />
        {value.phone === "android" && (
          <Field label="Android format" labelId={ids.android}>
            <Segmented
              name="android-format"
              aria-labelledby={ids.android}
              value={value.androidFormat}
              onChange={(androidFormat) => apply({ androidFormat })}
              options={[
                { value: "mp3", label: "MP3" },
                { value: "ogg", label: "OGG" },
              ]}
            />
          </Field>
        )}
      </MoreOptions>
    </div>
  );
}

function RingtoneHero(props: HeroProps<RingtoneOptions>) {
  const v = props.value;
  const editable = props.phase === "ready" && props.showing === "source" && props.onChange;
  return (
    <SoundHero
      {...props}
      // The result is the ringtone, not the source: its length comes from the player.
      info={props.showing === "result" ? undefined : props.info}
      stripLabel="The video's sound, with the part to keep"
      layer={
        v && props.showing === "source"
          ? (duration) => (
              <RangeLayer
                range={fitPart(v, duration)}
                duration={duration}
                media={props.media}
                step={0.1}
                minPart={1}
                onChange={
                  editable
                    ? (r) => props.onChange?.({ ...v, ...fitPart(r, duration), suggested: false })
                    : undefined
                }
              />
            )
          : undefined
      }
    />
  );
}

export const ringtoneSpec: OptionsSpec<RingtoneOptions> = {
  verb: "Make ringtone",
  Panel: RingtonePanel,
  Hero: RingtoneHero,
  previewResult: true,
  batch: false,
  shortcuts: [PLAY_SHORTCUT],
  route: () => "page",
  defaults: (info, preset) => ({
    start: 0,
    end: Math.min(info.durationSec, DEFAULT_RINGTONE_SEC),
    fadeIn: 0.5,
    fadeOut: 2,
    normalize: false,
    phone: preset.phone === "android" ? "android" : "iphone",
    androidFormat: "mp3",
    output: "auto",
    suggested: true,
  }),
  blocked: (o, info) => {
    if (!info.audio?.length) return "This file has no sound track, so there is nothing to ring.";
    if (info.durationSec < 1) return "The sound is shorter than a second.";
    const p = fitPart(o, info.durationSec);
    if (p.end - p.start < 1) return "Choose a part of at least one second.";
    if (o.suggested === true) return "Finding the loudest 30 seconds";
    return undefined;
  },
  summary: (o) =>
    [
      `${ringtoneFormat(o).label} ${withUnit(RINGTONE_KBPS, "kbps")}`,
      o.phone === "android" ? "ffmpeg engine" : "on this device",
    ].join(" · "),
  result: () => ({ title: "Ringtone ready", change: false, before: false }),
};
