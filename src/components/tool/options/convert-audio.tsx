"use client";

import { AudioHero } from "@/components/tool/audio/audio-hero";
import { Field } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import {
  type AudioBitrate,
  type AudioFormatId,
  audioBitratePresets,
  audioFormatById,
  audioFormatIds,
  audioFormats,
  normalizeAudioCodec,
} from "@/content/formats/audio";
import { formatBytes, formatDuration, withUnit } from "@/lib/format";
import type { ConvertAudioOptions } from "@/tools/engines/convert-audio";
import { codecName } from "@/tools/engines/convert-video/plan";
import { ffmpegDownloadSize } from "@/tools/engines/ffmpeg/size";
import { downmixWords } from "@/tools/engines/sound/dsp/downmix";
import type { MediaInfo } from "@/tools/engines/types";
import { estimateAudioBytes, sourceFormatId } from "@/tools/engines/video-to-audio/math";
import { type ExtractionPlan, pcmName, planExtraction } from "@/tools/engines/video-to-audio/plan";
import { z } from "./remember-schema";
import type { OptionsSpec } from "./types";
import { unfixable } from "./types";

const targetOptions = audioFormats.map((f) => ({
  value: f.id,
  label: f.id === "ogg" ? "OGG" : f.name,
}));
const bitrateOptions = audioBitratePresets.map((b) => ({
  value: String(b) as `${AudioBitrate}`,
  label: withUnit(b, "kbps"),
}));

const isFormat = (v: unknown): v is AudioFormatId =>
  typeof v === "string" && audioFormatById.has(v as AudioFormatId);
const isBitrate = (v: unknown): v is AudioBitrate =>
  typeof v === "number" && (audioBitratePresets as readonly number[]).includes(v);

/** Display name of a source or target codec: "PCM 16-bit", "AAC", "Vorbis". */
export const audioCodecLabel = (c: string | undefined) =>
  c?.startsWith("pcm") ? pcmName(c) : (codecName(c) ?? c);

const plan = (o: ConvertAudioOptions, info: MediaInfo, fileName?: string) =>
  planExtraction(info, fileName ?? `file.${info.container.toLowerCase()}`, o.to, o.bitrate, {
    channels: o.channels,
    sampleRate: o.sampleRate,
  });

/** Sample rates offered, Hz: phone and voice rates, then CD and video. */
const sampleRates = [8000, 16_000, 22_050, 44_100, 48_000] as const;
const rateLabel = (hz: number) =>
  withUnit(hz % 1000 === 0 ? hz / 1000 : (hz / 1000).toFixed(2).replace(/0$/, ""), "kHz");
const rateOptions = sampleRates.map((r) => ({ value: String(r), label: rateLabel(r) }));

/** The other common rate: 48 kHz material becomes 44.1 kHz (CD, music), anything else 48 kHz (video). */
const otherRate = (info: MediaInfo) => (info.audio?.[0]?.sampleRate === 48_000 ? 44_100 : 48_000);

/** What this run changes besides the format, in words: "Mixed down to mono", "Resampled to 44.1 kHz". */
function remixWords(o: ConvertAudioOptions, info: MediaInfo): string {
  const t = info.audio?.[0];
  const p = plan(o, info);
  // How the channels are mixed is said exactly (BS.775 for 5.1, ADR-0057), not assumed to be L and R.
  const how = t && p.channels ? downmixWords(t.channels, p.channels) : undefined;
  const parts = [
    p.channels === 1
      ? `Mixed down to mono${how ? ` (${how})` : ""}`
      : p.channels === 2
        ? how
          ? `Mixed down to stereo (${how})`
          : "Made stereo"
        : "",
    p.sampleRate && t
      ? `Resampled from ${rateLabel(t.sampleRate)} to ${rateLabel(p.sampleRate)}`
      : "",
  ].filter(Boolean);
  return parts.length ? `${parts.join("; ")}. ` : "";
}

/** Measured source bitrate in kbps for lossy sources, when the reader reported one. */
const sourceKbps = (info: MediaInfo): number | undefined => {
  const t = info.audio?.[0];
  const codec = normalizeAudioCodec(t?.codec);
  if (!t?.bitrate || !codec || codec.startsWith("pcm") || codec === "flac") return undefined;
  return Math.round(t.bitrate / 1000);
};

/** Which output id the source file already is, for audio-only files (MP3 file → "mp3"). */
function sameFormat(p: ExtractionPlan, info: MediaInfo): boolean {
  if (info.video || !p.copy) return false;
  const c = info.container.toLowerCase();
  const byContainer: Record<string, AudioFormatId[]> = {
    mp3: ["mp3"],
    flac: ["flac"],
    wave: ["wav"],
    ogg: ["ogg", "opus"],
    mp4: ["m4a"],
  };
  return (byContainer[c] ?? []).includes(p.target.id);
}

/** Pair pages lock the target; the hub picks one that is not the source's own format. */
function defaultTarget(info: MediaInfo, preset: Record<string, unknown>): AudioFormatId {
  if (isFormat(preset.to)) return preset.to;
  const codec = normalizeAudioCodec(info.audio?.[0]?.codec);
  // An MP3 most often becomes WAV for an editor; everything else most often becomes MP3.
  return codec === "mp3" ? "wav" : "mp3";
}

export const convertAudioSpec: OptionsSpec<ConvertAudioOptions> = {
  verb: "Convert",
  remember: {
    schema: z.object({
      to: z.enum(audioFormatIds),
      bitrate: z.union([z.literal(128), z.literal(192), z.literal(320)]),
    }),
  },
  defaults: (info, preset) => ({
    to: preset.keepFormat === true ? sourceFormatId(info) : defaultTarget(info, preset),
    bitrate: isBitrate(preset.bitrate) ? preset.bitrate : 192,
    locked: preset.lockTarget === true,
    ...(preset.channels === 1 ? { channels: 1 as const } : {}),
    ...(preset.resample === true ? { sampleRate: otherRate(info) } : {}),
  }),
  Hero: AudioHero,
  previewResult: true,
  // A copy is identical; a re-encode gets Before/After (ADR-0136).
  compare: (o, info) => (plan(o, info).copy ? false : { what: "sound" }),
  nextStep: { slug: "add-audio-to-video", label: "Add audio to a video" },
  route: (o, info, fileName) =>
    plan(o, info, fileName).backend === "ffmpeg-wasm" ? "page" : "worker",
  blocked: (o, info) => {
    const p = plan(o, info);
    if (!p.hasAudio)
      return unfixable(
        "This file has no audio track, so there is nothing to convert. Choose a file with sound.",
      );
    const t = info.audio?.[0];
    // The mono and sample-rate pages keep the format: a file that already has the layout or rate
    // is done, not an error.
    if (o.channels !== undefined && t?.channels === o.channels && p.copy && !o.sampleRate)
      return {
        reason: `Already ${o.channels === 1 ? "mono" : "stereo"}. Nothing to change.`,
        settled: true,
        action: { slug: "audio-converter", label: "Convert it to another format" },
      };
    if (o.sampleRate !== undefined && t?.sampleRate === o.sampleRate && p.copy && !o.channels)
      return `This file is already ${rateLabel(o.sampleRate)}. Choose another rate.`;
    if (sameFormat(p, info))
      // A pair page has no format control, so this is an outcome, not a dead end.
      return o.locked
        ? {
            reason: `Already ${/^[AEFHILMNORSX]/.test(p.target.name) && p.target.id !== "flac" ? "an" : "a"} ${p.target.name}. Nothing to convert.`,
            settled: true,
            action: { slug: "audio-converter", label: "Convert to another format" },
          }
        : `This file is already ${p.target.name}. Choose another format to convert it to.`;
    return undefined;
  },
  summary: (o, info) => {
    const p = plan(o, info);
    // A settled pair page (the file already is the target) says so in the blocked line; no estimate.
    if (o.locked && sameFormat(p, info)) return undefined;
    const track = info.audio?.[0];
    const bytes = estimateAudioBytes(p.target, info.durationSec, track, {
      copy: p.copy,
      bitrateKbps: p.bitrateKbps,
    });
    const size = bytes ? ` About ${formatBytes(bytes)}.` : "";
    const src = `${remixWords(o, info)}${audioCodecLabel(p.sourceCodec) ?? "The audio"}`;
    const kbps = sourceKbps(info);
    if (p.copy)
      return `${src} is copied into ${p.target.name} as it is, not re-encoded. Lossless.${size}`;
    if (p.target.lossless) {
      const lossySource = kbps !== undefined;
      return `${src} is decoded once to ${p.target.name}; nothing is lost from here on${lossySource ? ", but nothing lost earlier comes back" : ""}.${size}`;
    }
    const engine =
      p.backend === "ffmpeg-wasm" ? `, after a one-time download of ${ffmpegDownloadSize()}` : "";
    const ceiling =
      kbps !== undefined && p.bitrateKbps !== undefined && p.bitrateKbps > kbps * 1.15
        ? ` The source has ${withUnit(kbps, "kbps")}, so a higher bitrate only makes the file bigger.`
        : "";
    return `${src} is re-encoded to ${audioCodecLabel(p.codec)} at ${withUnit(p.bitrateKbps ?? 0, "kbps")}${engine}.${ceiling}${size}`;
  },
  result: (o, info) => {
    const p = plan(o, info);
    const length = formatDuration(info.durationSec);
    // The size is the point only when a lossless source is compressed (WAV → MP3); elsewhere a
    // "+900%" or "−40%" is a side effect of the format and reads as a verdict it is not.
    const sourceLossless =
      !!p.sourceCodec && (p.sourceCodec.startsWith("pcm") || p.sourceCodec === "flac");
    const lossySource = sourceKbps(info) !== undefined;
    const change =
      sourceLossless && !p.target.lossless && !p.copy ? {} : { change: false as const };
    if (p.channels === 1 || p.sampleRate)
      return {
        title:
          p.channels === 1
            ? `Now mono: ${p.target.name}, ${length}`
            : `Resampled to ${rateLabel(p.sampleRate ?? 0)}: ${p.target.name}, ${length}`,
        detail: remixWords(o, info).trim(),
        change: false,
      };
    if (p.copy)
      return {
        title: `Copied into ${p.target.name}: ${length}`,
        detail: `The ${audioCodecLabel(p.sourceCodec)} track was moved without re-encoding, so it sounds exactly like the original.`,
        ...change,
      };
    if (p.target.lossless)
      return {
        title: `Converted to ${p.target.name}: ${length}`,
        detail: lossySource
          ? `It holds the ${audioCodecLabel(p.sourceCodec)} file's decoded sound as plain samples, which editors open without another conversion.`
          : p.quantisedTo
            ? `Lossless to lossless, kept to ${p.quantisedTo}-bit precision: ${p.target.name} stores whole numbers, so the 32-bit float samples are rounded to the nearest ${p.quantisedTo}-bit step.`
            : "Lossless to lossless: every sample of the original is kept.",
        ...change,
      };
    return {
      title: `Converted to ${p.target.name}: ${length} at ${withUnit(p.bitrateKbps ?? 0, "kbps")}`,
      ...change,
    };
  },
  Panel({ value, onChange, info, preset }) {
    const p = plan(value, info);
    const locked = preset.lockTarget === true;
    const showBitrate = !p.target.lossless && !p.copy;
    const kbps = sourceKbps(info);
    const track = info.audio?.[0];
    const source = [
      audioCodecLabel(p.sourceCodec),
      kbps && withUnit(kbps, "kbps"),
      track && withUnit(track.sampleRate / 1000, "kHz"),
    ]
      .filter(Boolean)
      .join(" · ");
    return (
      <div className="flex flex-col gap-6">
        {locked && sameFormat(p, info) ? (
          // Settled: nothing will be written, so the line describes the file, not an output.
          source && (
            <p className="text-fg-muted text-sm">
              This file <span className="font-medium text-fg">{source}</span>
            </p>
          )
        ) : locked ? (
          <p className="text-fg-muted text-sm">
            Output <span className="font-medium text-fg">{p.target.name}</span>
            {source && (
              <>
                {" "}
                from <span className="font-medium text-fg">{source}</span>
              </>
            )}
          </p>
        ) : (
          <Field
            label={preset.keepFormat === true ? "Save as" : "Convert to"}
            labelId="to-label"
            hint={source ? `From ${source}. ${p.target.note}` : p.target.note}
          >
            <Segmented
              name="to"
              aria-labelledby="to-label"
              value={value.to}
              onChange={(to) => onChange({ ...value, to })}
              options={targetOptions}
              columns={4}
            />
          </Field>
        )}
        {preset.resample === true && value.to !== "opus" && (
          <Field
            label="Sample rate"
            labelId="rate-label"
            hint={`From ${track ? rateLabel(track.sampleRate) : "the source's"}. 44.1 kHz is CD and most music; 48 kHz is video; 16 kHz and 8 kHz are for speech recognition and telephone systems.`}
          >
            <Segmented
              name="sample-rate"
              aria-labelledby="rate-label"
              value={String(value.sampleRate ?? track?.sampleRate ?? 48_000)}
              onChange={(r) => onChange({ ...value, sampleRate: Number(r) })}
              options={rateOptions}
              columns={5}
            />
          </Field>
        )}
        {preset.resample === true && value.to === "opus" && (
          <p className="text-fg-muted text-sm">
            Opus always runs at 48 kHz; choose another format to pick a rate.
          </p>
        )}
        {preset.channels === 1 && track && (
          <p className="text-fg-muted text-sm">
            {track.channels === 1
              ? "This file is already mono."
              : `${track.channels === 2 ? "Left and right" : `All ${track.channels} channels`} are mixed into one channel, which plays from both speakers.`}
          </p>
        )}
        {!locked && preset.channels !== 1 && preset.resample !== true && (
          <details className="text-sm">
            <summary className="flex min-h-11 cursor-pointer items-center text-fg-muted hover:text-fg">
              More options
            </summary>
            <div className="mt-3 flex flex-col gap-6">
              <Field
                label="Channels"
                labelId="channels-label"
                hint="Mono averages left and right into one channel."
              >
                <Segmented
                  name="channels"
                  aria-labelledby="channels-label"
                  value={value.channels === 1 ? "1" : value.channels === 2 ? "2" : "keep"}
                  onChange={(c) =>
                    onChange({
                      ...value,
                      channels: c === "keep" ? undefined : (Number(c) as 1 | 2),
                    })
                  }
                  options={[
                    { value: "keep", label: "As source" },
                    { value: "1", label: "Mono" },
                    { value: "2", label: "Stereo" },
                  ]}
                />
              </Field>
              {value.to !== "opus" && (
                <Field
                  label="Sample rate"
                  labelId="rate-more-label"
                  hint="Keep the source's unless the destination asks for one."
                >
                  <Segmented
                    name="sample-rate"
                    aria-labelledby="rate-more-label"
                    value={value.sampleRate ? String(value.sampleRate) : "keep"}
                    onChange={(r) =>
                      onChange({ ...value, sampleRate: r === "keep" ? undefined : Number(r) })
                    }
                    options={[{ value: "keep", label: "As source" }, ...rateOptions.slice(2)]}
                    columns={4}
                  />
                </Field>
              )}
            </div>
          </details>
        )}
        {showBitrate && (
          <Field
            label="Bitrate"
            labelId="bitrate-label"
            hint={`${withUnit(192, "kbps")} is transparent for most listeners. 128 is plenty for speech; 320 is the most MP3 allows.`}
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
};
