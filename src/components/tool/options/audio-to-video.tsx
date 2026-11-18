"use client";

import { useEffect, useId, useRef } from "react";
import { ImagePick } from "@/components/tool/audio-video/image-pick";
import { StillHero } from "@/components/tool/audio-video/still-hero";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { formatDimensions, formatDuration, withUnit } from "@/lib/format";
import {
  type AudioToVideoOptions,
  cardText,
  type Shape,
  SOUND_KBPS,
  shapeOf,
  sizeOf,
  stillKey,
} from "@/tools/engines/audio-to-video/options";
import { renderStill } from "@/tools/engines/audio-to-video/still";
import type { MediaInfo } from "@/tools/engines/types";
import type { OptionsPanelProps, OptionsSpec } from "./types";

type O = AudioToVideoOptions;

const copies = (info: MediaInfo) => info.audio?.[0]?.codec === "aac";
const facts = (file: File, info: MediaInfo) => ({
  name: file.name,
  title: info.tags?.title,
  artist: info.tags?.artist,
});

const soundWords = (info: MediaInfo) =>
  copies(info)
    ? "The AAC sound is copied as it is, not re-encoded."
    : `The sound is encoded once to AAC at ${withUnit(SOUND_KBPS, "kbps")}.`;

export const audioToVideoSpec: OptionsSpec<O> = {
  verb: "Make video",
  defaults: (_info, preset) => ({
    picture: preset.picture === "image" ? "image" : "card",
    theme: "dark",
    shape: "16:9",
    fit: "blur",
  }),
  // The page runner draws the still (UI font, image decoders) when needed, then the worker encodes.
  route: () => "page",
  Hero: StillHero,
  previewResult: true,
  nextStep: { slug: "add-subtitles-to-video", label: "Add lyrics or a transcript as subtitles" },
  blocked: (o, info) => {
    if (!info.audio?.length) return "This file has no sound to put under a picture.";
    if (o.picture === "image" && !o.image) return "Choose an image first, or use a title card.";
    return undefined;
  },
  summary: (o, info) => {
    const s = sizeOf(o);
    return `A ${formatDimensions(s.width, s.height)} MP4, ${formatDuration(info.durationSec)} long, with the picture written once a second because it does not move. ${soundWords(info)} Runs on this device.`;
  },
  result: (o, info) => {
    const s = sizeOf(o);
    return {
      title: `Video made: ${formatDuration(info.durationSec)} at ${formatDimensions(s.width, s.height)}`,
      detail: `${soundWords(info)} The preview plays the new video.`,
      before: false,
    };
  },
  Panel: AudioToVideoPanel,
};

/** Keeps `still` (the PNG the engine encodes) in step with the options, a moment after each change. */
function useStill(value: O, onChange: (o: O) => void, file: File, info: MediaInfo, batch: boolean) {
  const latest = useRef(value);
  latest.current = value;
  const change = useRef(onChange);
  change.current = onChange;
  const f = facts(file, info);
  const key = stillKey(value, f);
  const ready = value.picture === "card" || !!value.image;
  useEffect(() => {
    // A batch draws each file's own card in the page runner.
    if (batch || !ready || latest.current.stillKey === key) return;
    let live = true;
    const t = setTimeout(() => {
      void renderStill(latest.current, f).then((r) => {
        if (!live || !r || stillKey(latest.current, f) !== r.key) return;
        change.current({ ...latest.current, still: r.blob, stillKey: r.key });
      });
    }, 150);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // `key` stands for everything drawn, the file's facts included.
  }, [key, ready, batch]);
}

function AudioToVideoPanel({ value, onChange, info, media, disabled }: OptionsPanelProps<O>) {
  const pictureId = useId();
  const shapeId = useId();
  const fitId = useId();
  const themeId = useId();
  const batch = (media.batch?.length ?? 0) > 1;
  useStill(value, onChange, media.file, info, batch);
  const own = cardText({}, facts(media.file, info));
  const shapes: { value: Shape; label: string }[] = [
    { value: "16:9", label: "16:9" },
    { value: "1:1", label: "Square" },
    { value: "9:16", label: "Vertical" },
    ...(value.picture === "image" && value.image
      ? [{ value: "image" as Shape, label: "Image's shape" }]
      : []),
  ];
  const shape = shapeOf(value);
  return (
    <div className="flex flex-col gap-6">
      <Field label="Picture" labelId={pictureId}>
        <Segmented<O["picture"]>
          name="still-picture"
          aria-labelledby={pictureId}
          value={value.picture}
          onChange={(picture) => onChange({ ...value, picture })}
          options={[
            { value: "card", label: "Title card" },
            { value: "image", label: "Image" },
          ]}
        />
      </Field>
      {value.picture === "image" ? (
        <ImagePick
          label="Choose an image"
          hint="Album art, a photo or a logo. JPEG, PNG or WebP."
          value={value.image}
          disabled={disabled}
          onChange={(image) =>
            onChange({
              ...value,
              image,
              shape: !image && value.shape === "image" ? "16:9" : value.shape,
            })
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          <Field
            label="Title"
            htmlFor="still-title"
            hint={
              batch
                ? "Leave empty to use each file's own title."
                : "From the file's title tag or name until you type."
            }
          >
            <Input
              id="still-title"
              value={value.title ?? (batch ? "" : own.title)}
              maxLength={200}
              autoComplete="off"
              placeholder={batch ? "Each file's own title" : undefined}
              disabled={disabled}
              onChange={(e) =>
                onChange({
                  ...value,
                  title:
                    e.target.value === own.title && !batch
                      ? undefined
                      : e.target.value || undefined,
                })
              }
            />
          </Field>
          <Field
            label="Second line"
            htmlFor="still-line"
            hint="An artist, a show or an episode. Optional."
          >
            <Input
              id="still-line"
              value={value.line ?? own.line}
              maxLength={200}
              autoComplete="off"
              disabled={disabled}
              onChange={(e) => onChange({ ...value, line: e.target.value })}
            />
          </Field>
          <Field label="Colours" labelId={themeId}>
            <Segmented<O["theme"]>
              name="still-theme"
              aria-labelledby={themeId}
              value={value.theme}
              onChange={(theme) => onChange({ ...value, theme })}
              options={[
                { value: "dark", label: "Light on dark" },
                { value: "light", label: "Dark on light" },
              ]}
            />
          </Field>
        </div>
      )}
      <Field
        label="Shape"
        labelId={shapeId}
        hint="16:9 for YouTube and most players; square or vertical for feeds and stories."
      >
        <Segmented<Shape>
          name="still-shape"
          aria-labelledby={shapeId}
          value={shape}
          columns={shapes.length > 3 ? 2 : undefined}
          onChange={(s) => onChange({ ...value, shape: s })}
          options={shapes}
        />
      </Field>
      {value.picture === "image" && value.image && shape !== "image" && (
        <Field label="Fit" labelId={fitId} hint="How the image sits in a frame of another shape.">
          <Segmented<O["fit"]>
            name="still-fit"
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
      )}
    </div>
  );
}
