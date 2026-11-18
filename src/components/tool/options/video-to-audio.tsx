"use client";

import { useRef } from "react";
import { AudioHero } from "@/components/tool/audio/audio-hero";
import { TrimTimeline } from "@/components/tool/timeline/trim-timeline";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import {
  type AudioBitrate,
  type AudioFormatId,
  audioBitratePresets,
  audioFormatById,
  audioFormats,
} from "@/content/formats/audio";
import { formatBytes, formatDuration, formatTimecode, withUnit } from "@/lib/format";
import { Link } from "@/lib/i18n/navigation";
import { codecName } from "@/tools/engines/convert-video/plan";
import type { MediaInfo } from "@/tools/engines/types";
import type { VideoToAudioOptions } from "@/tools/engines/video-to-audio";
import {
  effectiveRange,
  estimateAudioBytes,
  sourceFormatId,
} from "@/tools/engines/video-to-audio/math";
import { planExtraction } from "@/tools/engines/video-to-audio/plan";
import { PLAY_SHORTCUT, useWorkspaceKeys } from "../shortcuts";
import { RangeLayer } from "../sound/range-layer";
import { type Choice, Choices } from "./choices";
import { TimeInput } from "./trim";
import type { HeroProps, OptionsPanelProps, OptionsSpec } from "./types";

/** The four formats most people want, by what they are for; the rest sit under "Other format". */
const PURPOSE: Partial<Record<AudioFormatId, string>> = {
  mp3: "Plays everywhere",
  m4a: "Smaller, for Apple devices",
  wav: "For editing",
  flac: "Lossless, half the size of WAV",
};
const MAIN = Object.keys(PURPOSE) as AudioFormatId[];
const OTHER = "other";
const otherOptions = audioFormats
  .filter((f) => !MAIN.includes(f.id))
  .map((f) => ({ value: f.id, label: f.name }));
const bitrateOptions = audioBitratePresets.map((b) => ({
  value: String(b) as `${AudioBitrate}`,
  label: withUnit(b, "kbps"),
}));

/** Display name for a source or target audio codec; PCM variants collapse to "PCM". */
const audioCodecName = (c: string | undefined) =>
  c?.startsWith("pcm") ? "PCM" : (codecName(c) ?? c);

const isFormat = (v: unknown): v is AudioFormatId =>
  typeof v === "string" && audioFormatById.has(v as AudioFormatId);
const isBitrate = (v: unknown): v is AudioBitrate =>
  typeof v === "number" && (audioBitratePresets as readonly number[]).includes(v);

const plan = (o: VideoToAudioOptions, info: MediaInfo) =>
  planExtraction(info, `file.${info.container.toLowerCase()}`, o.to, o.bitrate);

/** The sound is the job, so its waveform takes the picture's place; a part is shown on it. */
function ExtractAudioHero(props: HeroProps<VideoToAudioOptions>) {
  const v = props.value;
  // Trim audio: the part is chosen on this waveform itself, with handles (no filmstrip to use).
  if (v?.trimOnly && props.showing === "source" && !props.info?.video)
    return (
      <AudioHero
        {...props}
        layer={(duration) => (
          <RangeLayer
            range={{ start: v.start, end: v.end }}
            duration={duration}
            media={props.media}
            onChange={
              props.phase === "ready" && props.onChange
                ? (r) => props.onChange?.({ ...v, start: r.start, end: r.end })
                : undefined
            }
          />
        )}
      />
    );
  return <AudioHero {...props} range={v?.range ? { start: v.start, end: v.end } : undefined} />;
}

/** The deciding fact for a format, before choosing it. */
const planTag = (p: ReturnType<typeof plan>) =>
  p.copy ? "Copied, lossless" : p.target.lossless ? "No further loss" : "Re-encodes";

export const videoToAudioSpec: OptionsSpec<VideoToAudioOptions> = {
  verb: "Extract audio",
  Hero: ExtractAudioHero,
  previewResult: true,
  shortcuts: [
    PLAY_SHORTCUT,
    { keys: "I", label: "Start the part at the playhead" },
    { keys: "O", label: "End the part at the playhead" },
  ],
  result: (o, info) => {
    const p = plan(o, info);
    const range = effectiveRange(info.durationSec, o);
    const length = formatDuration(range ? range.end - range.start : info.durationSec);
    if (o.trimOnly)
      return {
        title: `Trimmed to ${length}${p.copy ? `, ${p.target.name} copied` : `, saved as ${p.target.name}`}`,
        detail: p.copy
          ? "The kept part was copied frame for frame, not re-encoded. The waveform plays the result."
          : "The kept part was encoded once. The waveform plays the result.",
        change: false,
      };
    if (p.copy)
      return {
        title: `Saved as ${p.target.name}: ${length}, copied`,
        detail:
          "The sound track was moved out of the video without re-encoding. The waveform plays the result.",
        // Audio against the whole video is not a saving; the percentage would mislead.
        change: false,
      };
    return {
      title: `Saved as ${p.target.name}: ${length}${p.bitrateKbps ? ` at ${withUnit(p.bitrateKbps, "kbps")}` : ""}`,
      detail: `${info.tags?.title ? "The title and artist tags were carried over. " : ""}The waveform plays the result.`,
      change: false,
    };
  },
  defaults: (info, preset) => ({
    to: isFormat(preset.to) ? preset.to : preset.trimOnly === true ? sourceFormatId(info) : "mp3",
    bitrate: isBitrate(preset.bitrate) ? preset.bitrate : 192,
    range: preset.trimOnly === true,
    start: 0,
    end: info.durationSec,
    ...(preset.trimOnly === true ? { trimOnly: true } : {}),
  }),
  route: (o, info, fileName) =>
    planExtraction(info, fileName, o.to, o.bitrate).backend === "ffmpeg-wasm" ? "page" : "worker",
  blocked: (o, info) => {
    if (!plan(o, info).hasAudio)
      return o.trimOnly
        ? "This file has no audio track, so there is nothing to trim."
        : "This video has no audio track, so there is nothing to extract.";
    if (o.trimOnly && !effectiveRange(info.durationSec, o))
      return "Drag the handles on the waveform, or type a start and end, to choose the part to keep.";
    return undefined;
  },
  summary: (o, info) => {
    const p = plan(o, info);
    const range = effectiveRange(info.durationSec, o);
    const seconds = range ? range.end - range.start : info.durationSec;
    const track = info.audio?.[0];
    const bytes = estimateAudioBytes(p.target, seconds, track, {
      copy: p.copy,
      bitrateKbps: p.bitrateKbps,
    });
    const size = bytes ? ` About ${formatBytes(bytes)}.` : "";
    const when = range ? `${formatTimecode(range.start)} to ${formatTimecode(range.end)}: ` : "";
    const src = audioCodecName(p.sourceCodec) ?? "The audio";
    if (p.copy)
      return `${when}${src} is copied into ${p.target.name} as it is, not re-encoded. Lossless.${size}`;
    if (p.target.lossless)
      return `${when}${src} is decoded once to ${p.target.name}; nothing is lost from here on.${size}`;
    const engine = p.backend === "ffmpeg-wasm" ? " with the ffmpeg engine" : "";
    return `${when}${src} is re-encoded to ${audioCodecName(p.codec)} at ${withUnit(p.bitrateKbps ?? 0, "kbps")}${engine}.${size}`;
  },
  Below: RangeBelow,
  Panel({ value, onChange, info, preset }) {
    const p = plan(value, info);
    const locked = preset.lockTarget === true;
    const target = p.target;
    const showBitrate = !target.lossless && !p.copy;
    const aacKeepable = p.sourceCodec === "aac" && target.id !== "m4a";
    return (
      <div className="flex flex-col gap-6">
        {locked ? (
          <div>
            <p className="text-fg-muted text-sm">
              Output <span className="font-medium text-fg">{target.name}</span>
              {p.sourceCodec && (
                <>
                  {" "}
                  from <span className="font-medium text-fg">{audioCodecName(p.sourceCodec)}</span>
                </>
              )}
            </p>
            {aacKeepable && (
              <p className="mt-2 text-fg-muted text-xs">
                To keep the AAC track untouched, use{" "}
                <Link
                  href="/extract-audio-from-video"
                  className="rounded-sm font-medium text-fg underline decoration-1 underline-offset-3 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
                >
                  extract audio
                </Link>{" "}
                and choose M4A.
              </p>
            )}
          </div>
        ) : (
          <Field
            label="Save as"
            labelId="to-label"
            hint={
              aacKeepable
                ? `${target.note} Choose M4A to keep the original AAC untouched.`
                : target.note
            }
          >
            <div className="flex flex-col gap-3">
              <span id="to-other-label" className="sr-only">
                Other format
              </span>
              <Choices
                name="to"
                aria-labelledby="to-label"
                value={MAIN.includes(value.to) ? value.to : OTHER}
                onChange={(to) =>
                  onChange({
                    ...value,
                    to: to === OTHER ? (otherOptions[0]?.value ?? "opus") : (to as AudioFormatId),
                  })
                }
                options={[
                  ...MAIN.map(
                    (id): Choice<string> => ({
                      value: id,
                      label: audioFormatById.get(id)?.name ?? id,
                      detail: PURPOSE[id],
                      tag: planTag(plan({ ...value, to: id }, info)),
                    }),
                  ),
                  {
                    value: OTHER,
                    label: "Other format",
                    detail: "Opus, OGG or AIFF",
                  },
                ]}
              />
              {!MAIN.includes(value.to) && (
                <Select
                  id="to"
                  aria-labelledby="to-other-label"
                  value={value.to}
                  onValueChange={(to) => onChange({ ...value, to })}
                  options={otherOptions}
                />
              )}
            </div>
          </Field>
        )}
        {showBitrate && (
          <Field
            label="Bitrate"
            labelId="bitrate-label"
            hint={`${withUnit(192, "kbps")} is transparent for most listeners. 128 halves the size for speech; 320 is the most MP3 allows.`}
          >
            <Segmented
              name="bitrate"
              aria-labelledby="bitrate-label"
              value={String(value.bitrate) as `${AudioBitrate}`}
              onChange={(b) => onChange({ ...value, bitrate: Number(b) as AudioBitrate })}
              options={bitrateOptions}
            />
          </Field>
        )}
        {!value.trimOnly && (
          <Checkbox
            label="Only a part of the video"
            hint="Shows a timeline under the waveform. Drag the handles, or press I and O at the playhead, to choose the part that becomes the audio file."
            checked={value.range}
            onChange={(e) =>
              onChange({
                ...value,
                range: e.target.checked,
                start: value.range ? value.start : 0,
                end: value.range ? value.end : info.durationSec,
              })
            }
          />
        )}
        {value.range && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start" htmlFor="start" trailing="s">
              <TimeInput
                id="start"
                value={value.start}
                onCommit={(t) =>
                  onChange({ ...value, start: Math.min(Math.max(0, t), value.end - 0.01) })
                }
              />
            </Field>
            <Field label="End" htmlFor="end" trailing="s">
              <TimeInput
                id="end"
                value={value.end}
                onCommit={(t) =>
                  onChange({
                    ...value,
                    end: Math.max(Math.min(info.durationSec, t), value.start + 0.01),
                  })
                }
              />
            </Field>
          </div>
        )}
        {info.tags?.title && (
          <p className="text-fg-muted text-sm">
            Keeps the title <span className="font-medium text-fg">{info.tags.title}</span>
            {info.tags.artist && (
              <>
                {" "}
                by <span className="font-medium text-fg">{info.tags.artist}</span>
              </>
            )}{" "}
            in the file's tags.
          </p>
        )}
      </div>
    );
  },
} satisfies OptionsSpec<VideoToAudioOptions> & {
  Below: React.ComponentType<OptionsPanelProps<VideoToAudioOptions>>;
};

/**
 * With "Only a part" on: the video's filmstrip with two handles, under the waveform. The waveform's
 * player is the stage's preview element here, so the playhead and I / O follow what is playing.
 */
function RangeBelow({
  value,
  onChange,
  info,
  media,
  disabled,
}: OptionsPanelProps<VideoToAudioOptions>) {
  const root = useRef<HTMLDivElement>(null);
  const playhead = () => media.video.current?.currentTime ?? 0;
  const gap = 0.01;
  useWorkspaceKeys(
    root,
    [
      {
        key: "i",
        run: () => {
          const t = playhead();
          onChange({
            ...value,
            start: Math.min(t, value.end - gap),
            end: t >= value.end ? info.durationSec : value.end,
          });
        },
      },
      {
        key: "o",
        run: () => {
          const t = playhead();
          onChange({
            ...value,
            end: Math.max(t, value.start + gap),
            start: t <= value.start ? 0 : value.start,
          });
        },
      },
    ],
    value.range && !disabled,
  );
  // An audio file's part is chosen on the waveform hero; the filmstrip timeline is for video.
  if (!value.range || !info.video) return <div ref={root} hidden />;
  return (
    <div ref={root}>
      <TrimTimeline
        disabled={disabled}
        file={media.file}
        video={media.video}
        duration={info.durationSec}
        fps={info.video?.fps ?? 30}
        value={{ start: value.start, end: value.end }}
        onChange={(r) => onChange({ ...value, start: r.start, end: r.end })}
      />
    </div>
  );
}
