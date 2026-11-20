"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { ClarityPreview } from "@/components/tool/clarity/clarity-preview";
import { PreviewScrubber } from "@/components/tool/crop/preview-scrubber";
import { MoreOptions } from "@/components/tool/regions/more-options";
import { UnitField } from "@/components/tool/regions/percent-field";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Slider } from "@/components/ui/slider";
import { formatBytes, formatDimensions } from "@/lib/format";
import { measureNoise } from "@/tools/engines/clarity/measure";
import {
  type ClarityJob,
  type ClarityOptions,
  defaultStrength,
  jobWords,
  noiseWords,
  radiusPresets,
  strengthPresets,
  strengthRange,
} from "@/tools/engines/clarity/options";
import { encodedSize } from "@/tools/engines/crop/math";
import { audioCopied, encodedSoundWords, sourceName } from "@/tools/engines/crop/plan";
import { soundEncodersNow } from "@/tools/engines/sound-codec";
import type { MediaInfo } from "@/tools/engines/types";
import { pictureContainer, pictureEstimate } from "@/tools/engines/video-filter/plan";
import { nativeOnly } from "./native-only";
import { between, z } from "./remember-schema";
import type { OptionsPanelProps, OptionsSpec } from "./types";
import { unfixable } from "./types";

/** `measuring`: the page is reading the grain (denoise); the engine's schema drops it. */
type O = ClarityOptions & { measuring?: boolean };

const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

const isJob = (v: unknown): v is ClarityJob => v === "sharpen" || v === "denoise";

const sizeOf = (info: MediaInfo) => ({
  width: info.video?.width ?? 0,
  height: info.video?.height ?? 0,
});

function soundWords(info: MediaInfo) {
  if (!info.audio?.length) return "no sound";
  return audioCopied(info, pictureContainer(sourceName(info)))
    ? "sound copied"
    : encodedSoundWords(pictureContainer(sourceName(info)), soundEncodersNow());
}

const outSize = (info: MediaInfo) => {
  const e = encodedSize(sizeOf(info));
  return formatDimensions(e.width, e.height);
};

/** The strength as a percentage of Medium, for the number field. */
const toPercent = (job: ClarityJob, s: number) => Math.round((s / defaultStrength(job)) * 100);
const fromPercent = (job: ClarityJob, p: number) => (p / 100) * defaultStrength(job);

/** "Medium noise reduction · grain 9.2 levels · H.264 640×360 · sound copied · about 232 kB". */
function statusLine(o: O, info: MediaInfo): string {
  const grain =
    o.job !== "denoise"
      ? ""
      : o.measuring
        ? " · measuring grain"
        : o.noise === undefined
          ? " · grain not measured"
          : ` · ${noiseWords(o.noise)}`;
  const est = pictureEstimate(info, sizeOf(info), soundEncodersNow());
  return `${capital(jobWords(o))}${grain} · H.264 ${outSize(info)} · ${soundWords(info)} · about ${formatBytes(est.bytes)}`;
}

export const claritySpec: OptionsSpec<O> = {
  verb: "Apply",
  remember: {
    // Denoise measures its strength from the file; only sharpening keeps it.
    schema: z.object({ strength: between(0.1, 3), radius: between(0.5, 4) }),
    pick: (o) => (o.job === "denoise" ? {} : { strength: o.strength, radius: o.radius }),
    apply: (o, kept) => (o.job === "denoise" ? o : { ...o, ...kept }),
  },
  defaults: (_info, preset) => {
    const job = isJob(preset.job) ? preset.job : "denoise";
    return {
      job,
      strength: defaultStrength(job),
      radius: 1,
      ...(job === "denoise" ? { measuring: true } : {}),
    };
  },
  previewResult: true,
  nextStep: { slug: "compress-video", label: "Compress video" },
  shortcuts: [{ keys: "← →", label: "Move the before and after divider" }],
  blocked: (o, info) => {
    if (!info.video) return unfixable("This file has no video track. Choose a video file.");
    const native = nativeOnly(info, "this file");
    if (native) return native;
    // The status line keeps its shape while the grain is read; only the figure is missing.
    if (o.job === "denoise" && o.measuring) return statusLine(o, info);
    return undefined;
  },
  summary: (o, info) => (info.video ? statusLine(o, info) : undefined),
  result: (o) => ({ title: o.job === "sharpen" ? "Sharpened" : "Grain reduced" }),
  Overlay: ClarityOverlay,
  Below({ info, media, disabled }) {
    return (
      <div className="flex items-end gap-3">
        {/* Centred on the filmstrip (h-16), not on the label above it. */}
        <div className="flex h-16 shrink-0 items-center">
          <PlayButton video={media.video} disabled={disabled} />
        </div>
        <div className="min-w-0 flex-1">
          <PreviewScrubber file={media.file} video={media.video} info={info} disabled={disabled} />
        </div>
      </div>
    );
  },
  Panel: ClarityPanel,
};

function ClarityOverlay({ value, info, media, disabled }: OptionsPanelProps<O>) {
  const w = info.video?.width ?? 0;
  const h = info.video?.height ?? 0;
  // While the file is written the overlay goes; the plain picture shows until the result plays.
  if (!w || !h || disabled) return null;
  return (
    <ClarityPreview
      video={media.video}
      source={{ width: w, height: h }}
      value={value}
      fps={info.video?.fps ?? 30}
      ready={!(value.job === "denoise" && value.measuring)}
    />
  );
}

/**
 * Play and pause beside the scrubber: the before and after layer covers the preview's own bar, and
 * denoise previews differently while playing (each frame helped by the one before, as in the file).
 */
function PlayButton({
  video,
  disabled,
}: {
  video: React.RefObject<HTMLVideoElement | null>;
  disabled?: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    let el: HTMLVideoElement | null = null;
    let raf = 0;
    const sync = () => setPlaying(!!el && !el.paused && !el.ended);
    const attach = () => {
      el = video.current;
      if (!el) {
        raf = requestAnimationFrame(attach);
        return;
      }
      for (const e of ["play", "pause", "ended"]) el.addEventListener(e, sync);
      sync();
    };
    attach();
    return () => {
      cancelAnimationFrame(raf);
      if (el) for (const e of ["play", "pause", "ended"]) el.removeEventListener(e, sync);
    };
  }, [video]);
  return (
    <Button
      variant="secondary"
      size="sm"
      className="size-11 shrink-0 p-0"
      aria-label={playing ? "Pause" : "Play"}
      disabled={disabled}
      onClick={() => {
        const v = video.current;
        if (!v) return;
        if (v.paused || v.ended) void v.play().catch(() => undefined);
        else v.pause();
      }}
    >
      {playing ? (
        <Pause size={20} strokeWidth={1.5} aria-hidden />
      ) : (
        <Play size={20} strokeWidth={1.5} aria-hidden />
      )}
    </Button>
  );
}

function ClarityPanel({ value, onChange, info, media, disabled }: OptionsPanelProps<O>) {
  const strengthId = useId();
  const fieldId = useId();
  const radiusId = useId();
  const job = value.job;
  // Denoise: measure the grain once per file, so the preview and the file use the same figure. The
  // answer is merged into the options as they are then (the strength may have moved meanwhile).
  const latest = useRef(value);
  latest.current = value;
  const measuring = job === "denoise" && value.measuring === true;
  useEffect(() => {
    if (!measuring || !info.video || nativeOnly(info)) return;
    const ac = new AbortController();
    void measureNoise(media.file, info.durationSec, info.startSec ?? 0, ac.signal).then((n) => {
      if (ac.signal.aborted) return;
      // A failed reading is left unmeasured (the worker measures again), never called "no grain".
      const { noise: _old, ...rest } = latest.current;
      onChange({ ...rest, ...(n === undefined ? {} : { noise: n }), measuring: false });
    });
    return () => ac.abort();
  }, [media.file, measuring]);

  const presets = strengthPresets[job];
  const range = strengthRange[job];
  const preset = presets.find((p) => Math.abs(p.value - value.strength) < 0.001);
  const radius = radiusPresets.find((p) => Math.abs(p.value - value.radius) < 0.001);
  const word = preset?.label;
  const strengthHint =
    job === "sharpen"
      ? word === "Light"
        ? "A touch crisper; suits footage that is already fairly sharp."
        : word === "Strong"
          ? "For clearly soft footage; grain and halos show sooner."
          : "Suits most soft phone and webcam footage."
      : value.noise !== undefined && value.noise < 1
        ? "This video has little grain, so the change will be small."
        : word === "Light"
          ? "Keeps the most fine texture; some grain stays."
          : word === "Strong"
            ? "Removes more grain and smooths skin, grass and fabric."
            : "Removes most grain; the finest texture softens a little.";
  return (
    <div className="flex flex-col gap-6">
      <Field label="Strength" labelId={strengthId} hint={strengthHint}>
        <div className="flex flex-col gap-2">
          <Segmented
            name="clarity-strength"
            aria-labelledby={strengthId}
            value={preset ? String(preset.value) : ""}
            onChange={(v) => onChange({ ...value, strength: Number(v) })}
            options={presets.map((p) => ({ value: String(p.value), label: p.label }))}
          />
          <div className="flex items-center gap-3">
            <Slider
              aria-label="Strength"
              min={range.min}
              max={range.max}
              step={0.05}
              value={value.strength}
              disabled={disabled}
              onValueChange={(strength) => onChange({ ...value, strength })}
              getAriaValueText={(_f, v) => `${toPercent(job, v)}% of Medium`}
            />
            <UnitField
              id={fieldId}
              label="Strength, percent of Medium"
              value={toPercent(job, value.strength)}
              min={Math.round((range.min / defaultStrength(job)) * 100)}
              max={Math.round((range.max / defaultStrength(job)) * 100)}
              unit="%"
              onCommit={(p) => onChange({ ...value, strength: fromPercent(job, p) })}
            />
          </div>
        </div>
      </Field>
      {job === "sharpen" && (
        <MoreOptions>
          <Field
            label="Detail size"
            labelId={radiusId}
            hint="Fine lifts edges and texture; Coarse adds punch to larger shapes and shows halos sooner."
          >
            <Segmented
              name="clarity-radius"
              aria-labelledby={radiusId}
              value={radius ? String(radius.value) : ""}
              onChange={(v) => onChange({ ...value, radius: Number(v) })}
              options={radiusPresets.map((p) => ({ value: String(p.value), label: p.label }))}
            />
          </Field>
        </MoreOptions>
      )}
    </div>
  );
}
