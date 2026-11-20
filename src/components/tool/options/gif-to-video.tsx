"use client";

import { useId } from "react";
import { ImagePreview } from "@/components/tool/image-preview";
import { VideoPreview } from "@/components/tool/video-preview";
import { Field } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { formatBytes, formatCount, formatDimensions, formatDuration, NBSP } from "@/lib/format";
import { ffmpegDownloadSize } from "@/tools/engines/ffmpeg/size";
import { GifParseError, parseGif } from "@/tools/engines/gif-to-video/gif";
import {
  evenSize,
  frameCountOf,
  type GifToVideoOptions,
  gifInfo,
  repeatChoices,
} from "@/tools/engines/gif-to-video/options";
import type { MediaInfo } from "@/tools/engines/types";
import { z } from "./remember-schema";
import type { HeroProps, OptionsSpec } from "./types";

/** 8 MB, the smallest size target the compress pages offer: below it, compressing is not the next step. */
const SMALL = 8 * 1_000_000;

const nativeDecoder = () => typeof ImageDecoder !== "undefined";
const targetName = (o: GifToVideoOptions) => (o.to === "webm" ? "WebM" : "MP4");
const repeatLabel = (n: number) => (n === 1 ? "Once" : `${n} times`);
/** GIFs are seconds long, so tenths matter: "2.4 s", then m:ss past a minute. */
const seconds = (s: number) => (s < 60 ? `${s.toFixed(1)}${NBSP}s` : formatDuration(s));

/** The GIF itself while it is being prepared, then the video once it exists (previewResult). */
function GifHero({ file, info }: HeroProps<GifToVideoOptions>) {
  if (file.type.startsWith("video/")) return <VideoPreview file={file} info={info} />;
  return <ImagePreview blob={file} info={info} alt={`The GIF ${file.name}`} />;
}

function oddNote(info: MediaInfo): string {
  const v = info.video;
  if (!v) return "";
  const e = evenSize(v.width, v.height);
  return e.width !== v.width || e.height !== v.height
    ? ` ${formatDimensions(v.width, v.height)} becomes ${formatDimensions(e.width, e.height)}: H.264 needs even edges.`
    : "";
}

export const gifToVideoSpec: OptionsSpec<GifToVideoOptions> = {
  verb: "Convert",
  inspect: async (file) => {
    try {
      return gifInfo(parseGif(new Uint8Array(await file.arrayBuffer())), file.size);
    } catch (e) {
      if (e instanceof GifParseError)
        throw {
          code: "unsupported-input",
          message: e.message,
          hint: "Choose an animated .gif file.",
        };
      throw e;
    }
  },
  Hero: GifHero,
  remember: {
    schema: z.object({
      to: z.enum(["mp4", "webm"]),
      repeat: z.int().check(z.minimum(1), z.maximum(10)),
    }),
  },
  defaults: (_info, preset) => ({ to: preset.to === "webm" ? "webm" : "mp4", repeat: 1 }),
  route: () => (nativeDecoder() ? "worker" : "page"),
  summary: (o, info) => {
    const v = info.video;
    if (!v) return undefined;
    const e = evenSize(v.width, v.height);
    const frames = frameCountOf(info) * o.repeat;
    const engine = nativeDecoder() ? "" : ` Needs a one-time download of ${ffmpegDownloadSize()}.`;
    return `Output ${formatDimensions(e.width, e.height)} ${targetName(o)}, ${seconds(info.durationSec * o.repeat)}, ${formatCount(frames, "frame")} of ${o.to === "webm" ? "VP9" : "H.264"} with the GIF's own timing and no sound track.${oddNote(info)} Transparent areas become white.${engine}`;
  },
  previewResult: true,
  // The source is a GIF, which a video player cannot play in step (ADR-0134).
  compare: false,
  nextStep: { slug: "compress-video", label: "Compress video" },
  result: (o, info, output) => {
    const before = info.sizeBytes;
    const change = before > 0 ? Math.round((1 - output.bytes / before) * 100) : 0;
    const name = targetName(o);
    const now = `Now ${o.to === "webm" ? "a" : "an"} ${name}: ${formatBytes(output.bytes)}`;
    // The saving is in the title, so the meta line does not repeat it (change: false). A result
    // already under the smallest size limit on this site gets no "compress" next step.
    const next = output.bytes < SMALL ? null : undefined;
    return change >= 0
      ? {
          title: `${now}, ${change}% smaller than the GIF`,
          detail: `The preview plays the ${name}. Frame timing is the GIF's own; there is no sound, because a GIF has none.`,
          change: false,
          next,
        }
      : {
          title: `${now}, ${-change}% larger than the GIF`,
          detail: `Small, flat-colour GIFs sometimes compress better as GIF. The ${name} still plays and uploads where a GIF is refused.`,
          change: false,
          next,
        };
  },
  Panel({ value, onChange, info }) {
    const repeatId = useId();
    const frames = frameCountOf(info);
    return (
      <div className="flex flex-col gap-6">
        <p className="tabular text-sm">
          <span className="font-medium">GIF</span>
          <span className="text-fg-muted">
            {" "}
            · {formatCount(frames, "frame")} · {seconds(info.durationSec)} per loop
          </span>
        </p>
        <Field
          label="Play the animation"
          labelId={repeatId}
          trailing={seconds(info.durationSec * value.repeat)}
          hint="Apps loop short videos by themselves. Repeat when the video has to last longer, or where videos play once and stop."
        >
          <Segmented
            name="repeat"
            aria-labelledby={repeatId}
            value={String(value.repeat)}
            options={repeatChoices.map((n) => ({ value: String(n), label: repeatLabel(n) }))}
            onChange={(r) => onChange({ ...value, repeat: Number(r) })}
          />
        </Field>
      </div>
    );
  },
};
