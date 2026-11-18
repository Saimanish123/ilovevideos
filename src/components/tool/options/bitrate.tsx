"use client";

import { canEncodeVideo, Quality } from "mediabunny";
import { useEffect, useId, useRef } from "react";
import { MoreOptions } from "@/components/tool/regions/more-options";
import { UnitField } from "@/components/tool/regions/percent-field";
import { Field } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { formatBytes, formatDimensions } from "@/lib/format";
import {
  type AudioChoice,
  audioChoices,
  audioLabel,
  type BitrateOptions,
  codecName,
  defaultKbps,
  MIN_KBPS,
  planForPanel,
  preferredCodec,
  rateWords,
  sliderMaxKbps,
  sourceKbps,
} from "@/tools/engines/bitrate/plan";
import type { CodecTarget } from "@/tools/engines/codec/plan";
import { encodedSize } from "@/tools/engines/crop/math";
import type { MediaInfo } from "@/tools/engines/types";
import { nativeOnly } from "./native-only";
import type { OptionsPanelProps, OptionsSpec } from "./types";

/**
 * What this browser's encoder said for this file (written by the panel; the engine's schema drops
 * it): whether the source's own codec can be written, and whether a constant rate can.
 */
type O = BitrateOptions & {
  avail?: { source: boolean; constant: boolean };
};

/** The slider moves on a log scale: equal steps are equal ratios (200 → 400 is like 2,000 → 4,000). */
const SLIDER_STEPS = 1000;
const toSlider = (kbps: number, max: number) =>
  Math.round((Math.log(kbps / MIN_KBPS) / Math.log(max / MIN_KBPS)) * SLIDER_STEPS);
const fromSlider = (pos: number, max: number) => {
  const k = MIN_KBPS * (max / MIN_KBPS) ** (pos / SLIDER_STEPS);
  // Snap to a round figure for the size of the number.
  const step = k < 1000 ? 10 : k < 10_000 ? 50 : 500;
  return Math.round(k / step) * step;
};

async function probe(info: MediaInfo, codec: CodecTarget, kbps: number) {
  const v = info.video;
  if (!v) return { source: false, constant: false };
  const size = encodedSize(v, codec);
  const ask = (c: CodecTarget, mode: "variable" | "constant") =>
    canEncodeVideo(c, {
      width: size.width,
      height: size.height,
      quality: new Quality({ bitrate: kbps * 1000, bitrateMode: mode }),
    }).catch(() => false);
  const source = codec === "avc" ? false : await ask(codec, "variable");
  const constant = await ask(source ? codec : "avc", "constant");
  return { source, constant };
}

const sourceLine = (info: MediaInfo) => {
  const k = sourceKbps(info);
  return k ? `The source's picture uses ${rateWords(k)}.` : "The source does not say its bitrate.";
};

export const bitrateSpec: OptionsSpec<O> = {
  verb: "Change bitrate",
  defaults: (info) => ({
    videoKbps: defaultKbps(info),
    audio: "copy",
    mode: "variable",
    codec: "avc",
  }),
  previewResult: true,
  nextStep: { slug: "video-info", label: "Check the result" },
  blocked: (o, info) => {
    if (!info.video) return "This file has no video track.";
    const native = nativeOnly(info, "this file");
    if (native) return native;
    if (!o.avail) return "Checking this browser's encoders";
    return undefined;
  },
  summary: (o, info) => {
    const v = info.video;
    if (!v || !o.avail) return undefined;
    const plan = planForPanel(info, o);
    const sound =
      plan.sound === "copy"
        ? "sound copied"
        : plan.sound === "encode"
          ? `sound ${plan.audioCodec === "opus" ? "Opus" : "AAC"} ${Math.round(plan.audioBps / 1000)} kb/s`
          : plan.sound === "dropped"
            ? "sound removed"
            : "no sound";
    return `${rateWords(o.videoKbps)} ${o.mode} · ${codecName(o.codec)} ${formatDimensions(plan.size.width, plan.size.height)} · ${sound} · about ${formatBytes(plan.bytes)} · on this device`;
  },
  result: () => ({ title: "Bitrate changed", change: false }),
  Panel: BitratePanel,
};

function BitratePanel({ value, onChange, info, disabled }: OptionsPanelProps<O>) {
  const videoId = useId();
  const fieldId = useId();
  const soundId = useId();
  const modeId = useId();
  const codecId = useId();
  const max = sliderMaxKbps(info);
  const src = sourceKbps(info);
  const own = preferredCodec(info);
  // Ask the encoder once per file; merge only what it decides into the options as they are then.
  const latest = useRef(value);
  latest.current = value;
  useEffect(() => {
    let off = false;
    void probe(info, own, latest.current.videoKbps).then((avail) => {
      if (off) return;
      const now = latest.current;
      onChange({
        ...now,
        avail,
        codec: avail.source ? own : "avc",
        mode: avail.constant ? now.mode : "variable",
      });
    });
    return () => {
      off = true;
    };
  }, [info]);
  if (!info.video) return null;
  const plan = planForPanel(info, value);
  const above =
    src !== undefined && value.videoKbps > src * 1.05 && value.codec === info.video.codec;
  const audioSrc = info.audio?.[0];
  const audioOptions = audioChoices.filter((a) => audioSrc || a === "none");
  const copyNote =
    value.audio === "copy" && plan.sound === "encode"
      ? `The source's ${audioSrc?.codec.toUpperCase()} sound cannot go in this container as it is: it is encoded to ${plan.audioCodec === "opus" ? "Opus" : "AAC"} at 128 kb/s.`
      : value.audio === "copy"
        ? "The sound packets are copied; nothing about the sound changes."
        : value.audio === "none"
          ? "The file has no sound."
          : "Encoded once; 128 kb/s suits speech and most music.";
  return (
    <div className="flex flex-col gap-6">
      <Field
        label="Video bitrate"
        labelId={videoId}
        hint={
          above
            ? `Above the source's ${rateWords(src)}: the file grows and the picture does not improve.`
            : sourceLine(info)
        }
      >
        <div className="flex items-center gap-3">
          <Slider
            aria-labelledby={videoId}
            min={0}
            max={SLIDER_STEPS}
            step={1}
            value={toSlider(value.videoKbps, max)}
            disabled={disabled}
            onValueChange={(pos) => onChange({ ...value, videoKbps: fromSlider(pos, max) })}
            getAriaValueText={(_f, pos) => rateWords(fromSlider(pos, max))}
          />
          <UnitField
            id={fieldId}
            label="Video bitrate in kilobits per second"
            value={value.videoKbps}
            min={MIN_KBPS}
            max={100_000}
            unit="kb/s"
            wide
            onCommit={(videoKbps) => onChange({ ...value, videoKbps })}
          />
        </div>
      </Field>
      {audioSrc ? (
        <Field label="Sound" labelId={soundId} hint={copyNote}>
          <Select<AudioChoice>
            aria-labelledby={soundId}
            value={value.audio}
            onValueChange={(audio) => onChange({ ...value, audio })}
            options={audioOptions.map((a) => ({ value: a, label: audioLabel(a) }))}
          />
        </Field>
      ) : (
        <p className="text-fg-muted text-sm">This video has no sound track.</p>
      )}
      <MoreOptions>
        {value.avail?.constant ? (
          <Field
            label="Rate control"
            labelId={modeId}
            hint={
              value.mode === "constant"
                ? "Every second gets about the same number of bits, for streaming and broadcast specs."
                : "Busy scenes get more bits and still ones fewer; the average is the rate you set."
            }
          >
            <Segmented
              name="bitrate-mode"
              aria-labelledby={modeId}
              value={value.mode}
              onChange={(mode) => onChange({ ...value, mode })}
              options={[
                { value: "variable", label: "Variable" },
                { value: "constant", label: "Constant" },
              ]}
            />
          </Field>
        ) : (
          <p className="text-sm">
            Variable rate.{" "}
            <span className="text-fg-muted">
              {value.avail
                ? "This browser's encoder offers no constant rate for this video."
                : "Checking whether this browser can hold a constant rate."}
            </span>
          </p>
        )}
        {own !== "avc" &&
          (!value.avail ? (
            <p className="text-fg-muted text-sm">
              Checking whether this browser can encode {codecName(own)}.
            </p>
          ) : value.avail.source ? (
            <Field
              label="Codec"
              labelId={codecId}
              hint={`${codecName(own)} keeps the bitrate comparable with the source; H.264 plays everywhere.`}
            >
              <Segmented
                name="bitrate-codec"
                aria-labelledby={codecId}
                value={value.codec}
                onChange={(codec) => onChange({ ...value, codec: codec as CodecTarget })}
                options={[
                  { value: own, label: codecName(own) },
                  { value: "avc" as const, label: "H.264" },
                ]}
              />
            </Field>
          ) : (
            <p className="text-sm">
              H.264.{" "}
              <span className="text-fg-muted">
                This browser cannot encode {codecName(own)}, so the video is written as H.264.
              </span>
            </p>
          ))}
      </MoreOptions>
    </div>
  );
}
