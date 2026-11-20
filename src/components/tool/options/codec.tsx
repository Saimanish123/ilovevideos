"use client";

import { canEncodeVideo } from "mediabunny";
import { useEffect, useId } from "react";
import { formatBytes, formatDimensions } from "@/lib/format";
import type { CodecOptions } from "@/tools/engines/codec";
import {
  type CodecTarget,
  codecLabel,
  codecTargets,
  codecUse,
  containerLabel,
  isCodecTarget,
  planFor,
  sameCodec,
} from "@/tools/engines/codec/plan";
import { needsFfmpeg, sourceName } from "@/tools/engines/crop/plan";
import { soundEncodersNow, writtenSoundCodec } from "@/tools/engines/sound-codec";
import type { MediaInfo } from "@/tools/engines/types";
import { soundLine } from "@/tools/engines/video-filter/plan";
import { type Choice, Choices } from "./choices";
import type { OptionsSpec } from "./types";
import { unfixable } from "./types";

/**
 * What the encoder said, per codec, for this video's size (the stage re-renders when the panel
 * writes it into the value; the engine's schema drops it). Undefined while asking.
 */
type Availability = Partial<Record<CodecTarget, boolean>> & {
  /** Whether this browser can decode the source's own codec (false: nothing can be re-encoded). */
  decode?: boolean;
};
/**
 * `picked`: the codec was chosen (by the user, or named by the page) and is never switched for one
 * this browser can write. `locked`: a pair page (hevc-to-h264); the URL is the promise, no picker.
 */
type CodecValue = CodecOptions & { avail?: Availability; picked?: boolean; locked?: boolean };

/** The size the codec writes (an odd edge is cut for H.264 and HEVC), as "640×360". */
const outSize = (info: MediaInfo, c: CodecTarget) => {
  const size = planFor(info, c).size;
  return formatDimensions(size.width, size.height);
};

const name = (c: string | undefined) => (c ? (codecLabel[c] ?? c.toUpperCase()) : "unknown");

/** Asks the browser's encoder about each codec at this size and bitrate. */
async function probe(info: MediaInfo): Promise<Availability> {
  const v = info.video;
  if (!v) return {};
  const out: Availability = {};
  // The source must decode before anything can be re-encoded (HEVC often needs hardware support).
  if (v.codecString && typeof VideoDecoder !== "undefined") {
    try {
      const r = await VideoDecoder.isConfigSupported({ codec: v.codecString });
      out.decode = r.supported === true;
    } catch {
      out.decode = undefined;
    }
  }
  await Promise.all(
    codecTargets.map(async (c) => {
      try {
        // Probed at the size it would write: an odd edge is cut for H.264 and HEVC.
        const size = planFor(info, c).size;
        out[c] = await canEncodeVideo(c, {
          width: size.width,
          height: size.height,
          bitrate: planFor(info, c).bitrate,
        });
      } catch {
        out[c] = false;
      }
    }),
  );
  return out;
}

/** Codec strings a <video> is asked about (mid-range profiles and levels). */
const PLAY_TYPE: Record<CodecTarget, string> = {
  avc: 'video/mp4; codecs="avc1.640028"',
  hevc: 'video/mp4; codecs="hvc1.1.6.L120.B0"',
  vp9: 'video/webm; codecs="vp09.00.40.08"',
  av1: 'video/mp4; codecs="av01.0.08M.08"',
};
function canPlay(c: CodecTarget): boolean {
  if (typeof document === "undefined") return false;
  return document.createElement("video").canPlayType(PLAY_TYPE[c]) !== "";
}

/** The default: H.264 for anything that is not H.264 (plays everywhere); HEVC for H.264 sources. */
function defaultCodec(info: MediaInfo): CodecTarget {
  return info.video?.codec === "avc" ? "hevc" : "avc";
}

function containerLine(c: CodecTarget, info: MediaInfo) {
  const plan = planFor(info, c);
  return containerLabel[plan.to];
}

export const codecSpec: OptionsSpec<CodecValue> = {
  verb: "Change codec",
  // The result plays in the preview only where this browser says it can play that codec.
  previewResult: (o) => canPlay(o.codec),
  nextStep: { slug: "video-info", label: "Check the result" },
  defaults: (info, preset) => ({
    codec: isCodecTarget(preset.codec) ? preset.codec : defaultCodec(info),
    // A page that names its target (hevc-to-h264) keeps it even when this browser cannot write it.
    picked: isCodecTarget(preset.codec),
    locked: preset.lockTarget === true,
  }),
  blocked: (o, info) => {
    const v = info.video;
    if (!v) return unfixable("This file has no video track. Choose a video file.");
    if (needsFfmpeg(info, sourceName(info)))
      // No codec choice here can clear either case; the converter is the way out (ADR-0141). A
      // picture this browser cannot decode (HEVC in Chrome without platform support) is in a
      // container this page reads, so only the reason differs (QA 2026-11-19: "Convert this MP4
      // file to MP4 first").
      return unfixable(
        v.decodable === false
          ? `This browser cannot read the ${name(v.codec)} picture in this file. Convert it to H.264 with the video converter.`
          : `This tool reads MP4, MOV, WebM and MKV. Convert this ${info.container} file to MP4 first; the converter re-encodes it to H.264.`,
        { slug: "video-converter", label: "Convert to MP4" },
      );
    if (sameCodec(info, o.codec))
      return {
        reason: `This video is already ${name(o.codec)}. ${o.codec === "avc" ? "It plays on practically every device." : "Choose another codec to change it."}`,
        settled: o.codec === "avc" ? true : undefined,
      };
    if (!o.avail) return `Checking whether this browser can encode ${name(o.codec)}`;
    if (o.avail.decode === false)
      return `This browser cannot decode ${name(v.codec)} video, so it cannot re-encode it. Try a browser on a device that plays ${name(v.codec)}${v.codec === "hevc" ? ", such as Safari on a recent Mac or iPhone" : ""}.`;
    if (o.avail[o.codec] === false)
      return o.locked
        ? {
            reason: `This browser cannot write ${name(o.codec)} at ${outSize(info, o.codec)}. Try another browser or device, or see which codecs this one can write.`,
            action: { slug: "change-video-codec", label: "See the codecs available here" },
          }
        : `This browser cannot write ${name(o.codec)} at ${outSize(info, o.codec)}. Choose a codec marked available, or try another browser or device.`;
    return undefined;
  },
  summary: (o, info) => {
    const v = info.video;
    if (!v || sameCodec(info, o.codec) || !o.avail?.[o.codec]) return undefined;
    const plan = planFor(info, o.codec);
    const audio =
      plan.sound === "none"
        ? 0
        : plan.sound === "copy"
          ? (info.audio?.[0]?.bitrate ?? 128_000)
          : 128_000;
    const bytes = Math.round(((plan.bitrate + audio) * info.durationSec) / 8);
    const sound =
      plan.sound === "encode" && plan.to === "webm"
        ? "The sound is encoded to Opus."
        : soundLine(plan.sound, false, writtenSoundCodec(plan.to, soundEncodersNow()));
    const slow =
      o.codec === "av1" || o.codec === "vp9"
        ? ` ${name(o.codec)} is often slow to write on this kind of device; the progress line shows the time left.`
        : "";
    return `Output ${name(o.codec)} in ${containerLabel[plan.to]}, about ${formatBytes(bytes)} (the source is ${formatBytes(info.sizeBytes)}). The picture is re-encoded; ${sound.charAt(0).toLowerCase()}${sound.slice(1)}${slow}`;
  },
  result: (o, info, output) => {
    const v = info.video;
    if (!v) return undefined;
    const smaller = output.bytes < info.sizeBytes;
    return {
      title: `Now ${name(o.codec)}: ${formatBytes(output.bytes)}`,
      detail:
        o.codec === "avc"
          ? "H.264 plays in every browser, phone, TV and editor. The preview plays the result."
          : `${smaller ? "Smaller than the source at a similar picture." : "Larger than the source: it was already efficiently encoded."} Check that it plays where you need it before deleting the original.`,
    };
  },
  Panel({ value, onChange, info, preset }) {
    const labelId = useId();
    const avail = value.avail;
    const v = info.video;
    // A pair page names the source it is for; another codec converts the same way.
    const from = isCodecTarget(preset.from) ? preset.from : undefined;
    const otherSource = from !== undefined && v !== undefined && !sameCodec(info, from);
    // Ask the encoder once per file; if the default codec is not available and the user has not
    // chosen, move to the first one that is.
    useEffect(() => {
      let cancelled = false;
      void probe(info).then((a) => {
        if (cancelled) return;
        const current = value.codec;
        const fallback = codecTargets.find((c) => a[c] && !sameCodec(info, c));
        onChange({
          ...value,
          avail: a,
          codec: !value.picked && !a[current] && fallback ? fallback : current,
        });
      });
      return () => {
        cancelled = true;
      };
    }, [info]);
    const options: Choice<CodecTarget>[] = codecTargets.map((c) => ({
      value: c,
      label: name(c),
      detail: `${codecUse[c]} · ${containerLine(c, info)}`,
      tag: sameCodec(info, c)
        ? "Current codec"
        : !avail
          ? "Checking"
          : avail[c]
            ? "Available here"
            : "Not in this browser",
    }));
    return (
      <div className="flex flex-col gap-6">
        {v && (
          <div>
            <p className="font-medium text-sm">Now</p>
            <p className="tabular mt-1 text-body" data-testid="codec-source">
              {name(v.codec)} in {info.container}, {formatDimensions(v.width, v.height)}
              {info.audio?.[0] ? `, ${name(info.audio[0].codec)} sound` : ", no sound"}
            </p>
            {otherSource && !sameCodec(info, value.codec) && (
              <p className="mt-1 text-fg-muted text-xs">
                This video is {name(v.codec)}, not {name(from)}. It converts to {name(value.codec)}{" "}
                the same way.
              </p>
            )}
          </div>
        )}
        {value.locked ? (
          <div>
            <p className="font-medium text-sm">New codec</p>
            <p className="tabular mt-1 text-body">
              {name(value.codec)} in {containerLine(value.codec, info)}
            </p>
            {avail?.[value.codec] !== false && (
              <p className="mt-1 text-fg-muted text-xs">
                {avail
                  ? `This browser can encode ${name(value.codec)} at ${v ? outSize(info, value.codec) : "this size"}.`
                  : `Checking whether this browser can encode ${name(value.codec)}`}
              </p>
            )}
          </div>
        ) : (
          <div>
            <p id={labelId} className="font-medium text-sm">
              New codec
            </p>
            <div className="mt-2">
              <Choices
                name="codec"
                aria-labelledby={labelId}
                value={value.codec}
                onChange={(codec) => onChange({ ...value, codec, picked: true })}
                options={options}
              />
            </div>
            <p className="mt-2 text-fg-muted text-xs">
              Availability is what this browser reports it can write at{" "}
              {v ? formatDimensions(v.width, v.height) : "this video's size"}; it differs between
              browsers and devices.
            </p>
          </div>
        )}
      </div>
    );
  },
};
