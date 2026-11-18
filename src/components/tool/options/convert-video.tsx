"use client";

import { VideoPreview } from "@/components/tool/video-preview";
import { Field } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { containerFromFormatName, writableContainers } from "@/content/formats/containers";
import { formatDimensions, formatDuration } from "@/lib/format";
import type { ConvertVideoOptions } from "@/tools/engines/convert-video";
import {
  type ConversionPlan,
  codecName,
  keepsVideoCodec,
  planConversion,
} from "@/tools/engines/convert-video/plan";
import { ffmpegDownloadSize } from "@/tools/engines/ffmpeg/size";
import type { MediaInfo } from "@/tools/engines/types";
import { PLAY_SHORTCUT } from "../shortcuts";
import { type Choice, Choices } from "./choices";
import { article, sourceProfile } from "./idle/convert-video";
import type { HeroProps, OptionsSpec } from "./types";

/**
 * Engine options plus whether the page locks the target (a pair page), for `blocked`. The worker
 * parses options with the engine's schema, which drops the extra key.
 */
type ConvertValue = ConvertVideoOptions & { locked?: boolean };

/** The four targets most people want, by what they are for; the rest sit under "Other format". */
const PURPOSE: Record<string, string> = {
  mp4: "Plays everywhere",
  mov: "Apple apps and editing",
  webm: "For the web",
  mkv: "Keeps every track",
};
const MAIN = Object.keys(PURPOSE);
const legacyOptions = writableContainers
  .filter((c) => !MAIN.includes(c.id))
  .map((c) => ({ value: c.id, label: c.name }));
const OTHER = "other";

/** The deciding fact for a target, before choosing it: copy or re-encode. */
function planTag(plan: ConversionPlan): string {
  if (plan.copyVideo && plan.copyAudio) return "Lossless copy";
  if (plan.copyVideo) return "Picture copied";
  return plan.backend === "ffmpeg-wasm" ? "Re-encodes, ffmpeg" : "Re-encodes";
}
const nameOf = (id: string) =>
  writableContainers.find((c) => c.id === id)?.name ?? id.toUpperCase();

/** Targets a browser's <video> plays, so the done state can show the result in the preview slot. */
const PLAYABLE = new Set(["mp4", "mov", "webm", "mkv"]);

/** Picture codecs a browser's <video> decodes (in the containers of PLAYABLE). */
const PLAYABLE_VIDEO = new Set(["avc", "hevc", "vp8", "vp9", "av1"]);

/**
 * The source plays in the preview only when the browser's own player can open it. An AVI, an MPEG or a
 * transport stream would show a spinning, empty player, so those get a still card with the facts.
 */
function ConvertHero({ file, info, showing }: HeroProps<ConvertValue>) {
  const c = info ? containerFromFormatName(info.container, file.name) : undefined;
  // The result is only handed over for targets a browser plays (previewResult), so it always plays.
  const plays =
    showing === "result" ||
    (!!c && PLAYABLE.has(c.id) && PLAYABLE_VIDEO.has(info?.video?.codec ?? ""));
  if (plays) return <VideoPreview file={file} info={info} />;
  const v = info?.video;
  const ratio = v && v.width > 0 && v.height > 0 ? `${v.width} / ${v.height}` : "16 / 9";
  return (
    <div
      className="flex w-full flex-col items-center justify-center gap-2 rounded-lg bg-bg-stage p-6 text-center"
      style={{ aspectRatio: ratio, maxHeight: "60vh" }}
    >
      <p className="tabular text-gray-50 text-sm">
        {info
          ? [
              c?.name ?? info.container,
              codecName(v?.codec),
              v && formatDimensions(v.width, v.height),
              formatDuration(info.durationSec),
            ]
              .filter(Boolean)
              .join(" · ")
          : "Reading the file"}
      </p>
      {info && (
        <p className="max-w-xs text-gray-400 text-xs">
          {!v
            ? "This file has no picture, only sound, so there is nothing to show here."
            : `Browsers cannot play ${c?.name ?? "this format"} themselves, so there is no preview until it is converted.`}
        </p>
      )}
    </div>
  );
}

/** The stage passes no file name to summary/result; container detection falls back to the reported format. */
const planFor = (o: ConvertValue, info: MediaInfo): ConversionPlan =>
  planConversion(info, `file.${info.container.toLowerCase()}`, o.to, o.videoCodec === "avc");

/** "MPEG-4 Part 2 video, MP3 sound" from what the inspector found. */
function detected(info: MediaInfo): string {
  const v = codecName(info.video?.codec);
  const a = info.audio?.[0]?.codec;
  const sound = a ? `${a.startsWith("pcm") ? "PCM" : (codecName(a) ?? a)} sound` : "no sound";
  const picture = v
    ? `${v} video`
    : info.video
      ? "video in a codec this browser does not name"
      : "no picture";
  return `${picture}, ${sound}`;
}

/** The verdict of the plan in a few words, for the ready state's headline. */
function planHeadline(plan: ConversionPlan): { title: string; detail: string } {
  const target = plan.target.name;
  const v = codecName(plan.videoCodec) ?? plan.videoCodec;
  const a = codecName(plan.audioCodec) ?? plan.audioCodec;
  const engine =
    plan.backend === "ffmpeg-wasm"
      ? ` Uses the ffmpeg engine, a one-time download of ${ffmpegDownloadSize()}.`
      : "";
  if (plan.copyVideo && plan.copyAudio)
    return {
      title: "Lossless copy",
      detail: `The streams move into ${target} unchanged. Nothing is encoded, so it is limited by how fast your device reads and writes the file.${engine}`,
    };
  if (plan.copyVideo)
    return {
      title: "Picture copied, sound re-encoded",
      detail: `The video is copied bit for bit; ${target} cannot hold this sound, so it becomes ${a}.${engine}`,
    };
  return {
    title: "Re-encode",
    detail: `Every frame is encoded again as ${v}${plan.copyAudio ? ", sound copied" : `, sound as ${a}`}.${plan.sizeNote ? ` ${plan.sizeNote}` : ""} The progress line shows real progress.${engine}`,
  };
}

export const convertVideoSpec: OptionsSpec<ConvertValue> = {
  verb: "Convert",
  defaults: (_info, preset) => ({
    locked: preset.lockTarget === true,
    to: (preset.to as string) ?? "mp4",
    videoCodec: (preset.videoCodec as ConvertVideoOptions["videoCodec"]) ?? "keep",
  }),
  route: (o, info, fileName) =>
    planConversion(info, fileName, o.to, o.videoCodec === "avc").backend === "ffmpeg-wasm"
      ? "page"
      : "worker",
  // The plan itself is the panel's headline; the line under it only says where it runs.
  summary: (o, info) =>
    planFor(o, info).backend === "ffmpeg-wasm"
      ? "Runs on this device with the ffmpeg engine. The original file is not changed."
      : "Runs on this device. The original file is not changed.",
  Hero: ConvertHero,
  shortcuts: [PLAY_SHORTCUT],
  // A file already in the target format with codecs that fit gains nothing from a copy.
  blocked: (o, info, _inputs, file) => {
    const plan = planFor(o, info);
    // The file name tells 3GP and M4V from MP4 (the inspector reports all three as MP4), and those
    // pages exist to copy the streams into a clean .mp4.
    const same = containerFromFormatName(info.container, file?.name ?? "")?.id === o.to;
    if (!same || !plan.copyVideo || !plan.copyAudio) return undefined;
    // A pair page has no format choice, so that is an outcome; the hub asks for another format.
    return o.locked
      ? {
          reason: `Already ${article(nameOf(o.to))} with codecs that fit it. Nothing to convert.`,
          settled: true,
          action: { slug: "video-converter", label: "Convert to another format" },
        }
      : `This file is already ${article(nameOf(o.to))}. Choose another format to convert it to.`;
  },
  // A converted AVI, WMV or MPEG does not play in a browser, so those keep the source in the preview.
  previewResult: (o) => PLAYABLE.has(o.to),
  nextStep: { slug: "compress-video", label: "Compress video" },
  result: (o, info) => {
    const plan = planFor(o, info);
    const target = nameOf(o.to);
    const plays = PLAYABLE.has(o.to) ? " The preview plays the result." : "";
    if (plan.copyVideo && plan.copyAudio)
      return {
        title: `Now ${article(target)}: copied with no quality lost`,
        detail: `The video and sound are the same bits as before; only the container changed.${plays}`,
      };
    if (plan.copyVideo)
      return {
        title: `Now ${article(target)}: picture copied, sound re-encoded`,
        detail: `The video is untouched; the sound is now ${codecName(plan.audioCodec) ?? plan.audioCodec}.${plays}`,
        change: false,
      };
    return {
      title: `Now ${article(target)}: re-encoded to ${codecName(plan.videoCodec) ?? plan.videoCodec}`,
      detail: `The picture was encoded once at high quality${plan.copyAudio ? " and the sound copied" : ""}.${plays}`,
      // A re-encode for compatibility can grow the file; a percentage would read as a failure.
      change: false,
    };
  },
  Panel({ value, onChange, info, preset, media }) {
    // Pair pages lock the target: the URL is the promise.
    const locked = preset.lockTarget === true;
    const from = sourceProfile(preset);
    const actual = containerFromFormatName(info.container, media.file.name);
    // ffmpeg reports a VOB as an MPEG program stream, which it is.
    const same = (a: string, b: string) =>
      a === b || (["mpg", "vob"].includes(a) && ["mpg", "vob"].includes(b));
    const mismatch = from !== undefined && actual !== undefined && !same(actual.id, from.container);
    const modern = new Set(["mp4", "mov", "mkv"]);
    const plan = planConversion(info, media.file.name, value.to, value.videoCodec === "avc");
    const head = planHeadline(plan);
    return (
      <div className="flex flex-col gap-6">
        <div>
          <p className="text-fg-muted text-xs">Detected</p>
          <p className="mt-1 text-sm">
            <span className="font-medium">{actual?.name ?? info.container}</span>
            <span className="text-fg-muted"> · {detected(info)}</span>
          </p>
          {mismatch && (
            <p className="mt-1 text-fg-muted text-xs">
              This file is {actual?.name}, not {from?.name}. It converts the same way.
            </p>
          )}
        </div>
        {!locked && (
          <Field
            label="Convert to"
            labelId="to-label"
            hint="Each format says what happens to this file before you choose it."
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
                    to: to === OTHER ? (legacyOptions[0]?.value ?? "avi") : to,
                  })
                }
                options={[
                  ...MAIN.map(
                    (id): Choice<string> => ({
                      value: id,
                      label: nameOf(id),
                      detail: PURPOSE[id],
                      tag: planTag(
                        planConversion(info, media.file.name, id, value.videoCodec === "avc"),
                      ),
                    }),
                  ),
                  {
                    value: OTHER,
                    label: "Other format",
                    detail: "AVI, WMV, MPEG and more, for older players",
                    tag: "Uses ffmpeg",
                  },
                ]}
              />
              {!MAIN.includes(value.to) && (
                <Select
                  id="to"
                  aria-labelledby="to-other-label"
                  value={value.to}
                  onValueChange={(to) => onChange({ ...value, to })}
                  options={legacyOptions}
                />
              )}
            </div>
          </Field>
        )}
        <div aria-live="polite">
          <p className="text-h3">
            {head.title} to {nameOf(value.to)}
          </p>
          <p className="mt-1 text-fg-muted text-sm">{head.detail}</p>
        </div>
        {modern.has(value.to) &&
          ["hevc", "vp9", "av1"].includes(info.video?.codec ?? "") &&
          keepsVideoCodec(info, value.to) && (
            <Field
              label="Video codec"
              labelId="videoCodec-label"
              hint="Keeping the codec is lossless, but older devices and some apps will not play it. H.264 plays everywhere."
            >
              <Segmented
                name="videoCodec"
                aria-labelledby="videoCodec-label"
                value={value.videoCodec}
                onChange={(videoCodec) => onChange({ ...value, videoCodec })}
                options={[
                  { value: "keep", label: `Keep ${codecName(info.video?.codec) ?? "codec"}` },
                  { value: "avc", label: "H.264" },
                ]}
              />
            </Field>
          )}
      </div>
    );
  },
};
