"use client";

import { Music } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { FileName } from "@/components/tool/file-card";
import { buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { NumberInput } from "@/components/ui/number-input";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/cn";
import { formatDimensions, formatDuration, withUnit } from "@/lib/format";
import { blurredBackdrop, drawFitted } from "@/tools/engines/audio-to-video/draw";
import {
  fadeOf,
  type ImagesToVideoOptions,
  MAX_IMAGES,
  MUSIC_FADE_SEC,
  perImage,
  SLIDE_FPS,
  type SlideShape,
  slideSize,
} from "@/tools/engines/images-to-video/plan";
import type { MediaInfo } from "@/tools/engines/types";
import { between, z } from "./remember-schema";
import type { OptionsPanelProps, OptionsSpec, StageInput } from "./types";

type O = ImagesToVideoOptions;

const firstOf = (inputs?: StageInput[], info?: MediaInfo) => {
  const v = inputs?.[0]?.info.video ?? info?.video;
  return v ? { width: v.width, height: v.height } : undefined;
};
const count = (inputs?: StageInput[]) => inputs?.length ?? 1;

/** A picture read on the page: its size, as a MediaInfo the stage can list. */
async function readPicture(file: File): Promise<MediaInfo> {
  if (file.type.startsWith("audio/") || /\.(mp3|m4a|wav|flac|ogg|opus|aac)$/i.test(file.name))
    throw {
      code: "unsupported-input",
      message: "It is a sound file: add it under Music in the settings instead.",
    };
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw {
      code: "unsupported-input",
      message: "This browser cannot decode it. JPEG, PNG, WebP and GIF work everywhere.",
    };
  }
  const info: MediaInfo = {
    container: "image",
    durationSec: 0,
    sizeBytes: file.size,
    video: { codec: file.type || "image", width: bitmap.width, height: bitmap.height, fps: 0 },
  };
  bitmap.close();
  return info;
}

function soundLine(o: O, total: number): string {
  if (!o.music) return "No sound.";
  if (o.music.durationSec > total + 0.05)
    return `${o.music.name} is cut at ${formatDuration(total)} and fades out over the last ${withUnit(MUSIC_FADE_SEC, "s")}.`;
  if (o.music.durationSec < total - 0.5)
    return `${o.music.name} ends at ${formatDuration(o.music.durationSec)}; the rest is silent. Fit to the music to match them.`;
  return `${o.music.name} plays to the end.`;
}

export const imagesToVideoSpec: OptionsSpec<O> = {
  verb: "Make slideshow",
  multiple: { min: 1, max: MAX_IMAGES, noun: "image" },
  inspect: readPicture,
  remember: {
    schema: z.object({
      seconds: between(0.5, 60),
      transition: z.enum(["none", "crossfade"]),
      motion: z.boolean(),
      shape: z.enum(["16:9", "1:1", "9:16", "4:5", "first"]),
      fit: z.enum(["blur", "black", "fill"]),
      fitMusic: z.boolean(),
    }),
  },
  defaults: (_info, preset) => ({
    seconds: typeof preset.seconds === "number" ? preset.seconds : 3,
    transition: "crossfade",
    motion: preset.motion === true,
    shape: "16:9",
    fit: "blur",
    fitMusic: false,
  }),
  previewResult: true,
  // A new video from stills: nothing to set it against (ADR-0134).
  compare: false,
  nextStep: { slug: "compress-video", label: "Make the video smaller for sending" },
  blocked: (_o, _info, inputs) => {
    if (!inputs?.length) return "Add at least one image.";
    if (inputs.length > MAX_IMAGES) return `One slideshow takes at most ${MAX_IMAGES} images.`;
    return undefined;
  },
  summary: (o, info, inputs) => {
    const n = count(inputs);
    const d = perImage(o, n);
    const x = fadeOf(o, d);
    const size = slideSize(o.shape, firstOf(inputs, info));
    const total = n * d;
    const how = `${withUnit(Number(d.toFixed(2)), "s")} each${x > 0 ? ` with a ${withUnit(x, "s")} crossfade` : ""}${o.motion ? " and a slow zoom" : ""}`;
    return `${withUnit(n, n === 1 ? "image" : "images")}, ${how}: ${formatDuration(total)} of ${formatDimensions(size.width, size.height)} video at ${withUnit(SLIDE_FPS, "fps")}. ${soundLine(o, total)}`;
  },
  result: (o, info, out) => {
    const n = out.inputs?.length ?? 1;
    const d = perImage(o, n);
    const size = slideSize(o.shape, firstOf(out.inputs, info));
    return {
      title: `Slideshow made: ${formatDuration(n * d)}, ${formatDimensions(size.width, size.height)}`,
      detail: `${withUnit(n, n === 1 ? "image" : "images")} in the order you set. The preview plays the video.`,
      before: false,
    };
  },
  Panel: SlideshowPanel,
};

/** A small live picture of the first slide in the chosen frame, so shape and fit are seen, not guessed. */
function FirstSlide({ o, input }: { o: O; input?: StageInput }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const size = slideSize(o.shape, input?.info.video);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !input) return;
    let live = true;
    const w = 320;
    const h = Math.round((w * size.height) / size.width);
    void createImageBitmap(input.file).then((bitmap) => {
      if (!live) {
        bitmap.close();
        return;
      }
      canvas.width = w;
      canvas.height = h;
      const c = canvas.getContext("2d");
      if (c) {
        const src = { width: bitmap.width, height: bitmap.height };
        drawFitted(
          c,
          bitmap,
          src,
          { x: 0, y: 0, width: w, height: h },
          o.fit,
          o.fit === "blur" ? blurredBackdrop(bitmap, src, { width: w, height: h }) : undefined,
        );
      }
      bitmap.close();
    });
    return () => {
      live = false;
    };
  }, [input, o.fit, size.width, size.height]);
  if (!input) return null;
  return (
    <div className="flex items-center justify-center rounded-md bg-bg-stage p-3">
      <canvas
        ref={ref}
        role="img"
        aria-label={`The first image in a ${formatDimensions(size.width, size.height)} frame`}
        className="h-auto max-h-48 max-w-full"
      />
    </div>
  );
}

/** Music input: an audio file whose length is read on the page, with Remove. */
function MusicPick({
  value,
  onChange,
  disabled,
}: {
  value: O["music"];
  onChange: (m: O["music"]) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [error, setError] = useState<string>();
  const [reading, setReading] = useState(false);
  const read = async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    try {
      const { EngineClient } = await import("@/tools/workers/client");
      const client = new EngineClient();
      try {
        const info = await client.inspect(file);
        if (!info.audio?.length || !(info.durationSec > 0)) throw new Error("no sound");
        onChange({ name: file.name, blob: file, durationSec: info.durationSec });
        setError(undefined);
      } finally {
        client.dispose();
      }
    } catch {
      setError(`${file.name} could not be read as music. MP3, M4A, WAV, FLAC and OGG work.`);
    } finally {
      setReading(false);
    }
  };
  if (value)
    return (
      <div className="flex items-center gap-3 rounded-md bg-bg-subtle px-4 py-3 text-sm">
        <Music size={20} strokeWidth={1.5} aria-hidden className="shrink-0 text-fg-muted" />
        <div className="min-w-0 flex-1">
          <FileName name={value.name} />
          <p className="tabular mt-0.5 text-fg-muted text-xs">
            {formatDuration(value.durationSec)}
          </p>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(undefined)}
          className={cn(buttonVariants({ variant: "quiet", size: "md" }), "min-h-11 px-3")}
        >
          Remove
        </button>
      </div>
    );
  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={id}
        className="inline-flex min-h-11 cursor-pointer items-center gap-2 self-start rounded-md border border-border bg-bg px-4 font-medium text-sm has-focus-visible:outline-2 has-focus-visible:outline-ring has-focus-visible:outline-offset-2"
      >
        <Music size={16} strokeWidth={1.5} aria-hidden />
        {reading ? "Reading the music" : "Add music"}
        <input
          id={id}
          type="file"
          accept="audio/*"
          className="sr-only"
          disabled={disabled || reading}
          onChange={(e) => {
            void read(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>
      {error && (
        <p className="text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

const SECONDS = [2, 3, 5] as const;

function SlideshowPanel({ value, onChange, info, media, disabled }: OptionsPanelProps<O>) {
  const secId = useId();
  const transitionId = useId();
  const shapeId = useId();
  const fitId = useId();
  const musicId = useId();
  const inputs = media.inputs;
  const n = count(inputs);
  const d = perImage(value, n);
  const fitted = value.fitMusic && !!value.music;
  const secPreset = SECONDS.find((s) => s === value.seconds);
  const shapes: { value: SlideShape; label: string }[] = [
    { value: "16:9", label: "16:9" },
    { value: "1:1", label: "Square" },
    { value: "9:16", label: "Vertical" },
    { value: "4:5", label: "4:5" },
    { value: "first", label: "First image" },
  ];
  const size = slideSize(value.shape, firstOf(inputs, info));
  return (
    <div className="flex flex-col gap-6">
      <FirstSlide o={value} input={inputs?.[0]} />
      <Field
        label="Each image"
        labelId={secId}
        trailing={fitted ? `${withUnit(Number(d.toFixed(2)), "s")} to fit the music` : undefined}
        hint="How long each picture stays on screen."
      >
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <Segmented<string>
              name="slide-seconds"
              aria-labelledby={secId}
              value={fitted || !secPreset ? "" : String(secPreset)}
              onChange={(s) => onChange({ ...value, seconds: Number(s), fitMusic: false })}
              options={SECONDS.map((s) => ({ value: String(s), label: withUnit(s, "s") }))}
            />
          </div>
          <div className="w-20 shrink-0">
            <NumberInput
              aria-label="Seconds for each image"
              min={0.5}
              max={60}
              step={0.5}
              className="h-11"
              disabled={disabled || fitted}
              value={Number(d.toFixed(2))}
              onChange={(e) => {
                const x = Number(e.target.value);
                if (Number.isFinite(x) && x >= 0.5 && x <= 60)
                  onChange({ ...value, seconds: x, fitMusic: false });
              }}
            />
          </div>
        </div>
      </Field>
      <Field label="Between images" labelId={transitionId}>
        <Segmented<O["transition"]>
          name="slide-transition"
          aria-labelledby={transitionId}
          value={value.transition}
          onChange={(transition) => onChange({ ...value, transition })}
          options={[
            { value: "crossfade", label: "Crossfade" },
            { value: "none", label: "Cut" },
          ]}
        />
      </Field>
      <Checkbox
        label="Slow zoom"
        hint="Each picture drifts in or out a little while it shows (the Ken Burns effect)."
        checked={value.motion}
        disabled={disabled}
        onChange={(e) => onChange({ ...value, motion: e.target.checked })}
      />
      <Field
        label="Music"
        labelId={musicId}
        hint="Optional. Cut to the slideshow's length, or the slideshow fitted to it."
      >
        <div className="flex flex-col gap-3">
          <MusicPick
            value={value.music}
            disabled={disabled}
            onChange={(music) =>
              onChange({ ...value, music, fitMusic: music ? value.fitMusic : false })
            }
          />
          {value.music && (
            <Checkbox
              label="Fit the slideshow to the music"
              hint={`Each image then shows for ${withUnit(Number((value.music.durationSec / n).toFixed(2)), "s")}.`}
              checked={value.fitMusic}
              disabled={disabled}
              onChange={(e) => onChange({ ...value, fitMusic: e.target.checked })}
            />
          )}
        </div>
      </Field>
      <details className="text-sm">
        <summary className="flex min-h-11 cursor-pointer items-center font-medium">
          Shape and fit · {formatDimensions(size.width, size.height)}
        </summary>
        <div className="mt-2 flex flex-col gap-6">
          <Field
            label="Shape"
            labelId={shapeId}
            hint="16:9 for YouTube and screens; square, 4:5 or vertical for feeds and stories."
          >
            <Segmented<SlideShape>
              name="slide-shape"
              aria-labelledby={shapeId}
              columns={3}
              value={value.shape}
              onChange={(shape) => onChange({ ...value, shape })}
              options={shapes}
            />
          </Field>
          <Field
            label="Fit"
            labelId={fitId}
            hint="How a picture of another shape sits in the frame."
          >
            <Segmented<O["fit"]>
              name="slide-fit"
              aria-labelledby={fitId}
              value={value.fit}
              onChange={(fit) => onChange({ ...value, fit })}
              options={[
                { value: "blur", label: "Blurred" },
                { value: "black", label: "Black" },
                { value: "fill", label: "Fill" },
              ]}
            />
          </Field>
        </div>
      </details>
    </div>
  );
}
