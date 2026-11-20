"use client";

import { useId } from "react";
import { Field } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { formatBytes, formatDimensions } from "@/lib/format";
import { encodedSize } from "@/tools/engines/crop/math";
import { audioCopied, sourceName } from "@/tools/engines/crop/plan";
import {
  type StabilizeOptions,
  type Strength,
  stabilizeWords,
  strengthPlans,
  strengths,
} from "@/tools/engines/stabilize/options";
import type { MediaInfo } from "@/tools/engines/types";
import { pictureContainer, pictureEstimate } from "@/tools/engines/video-filter/plan";
import { nativeOnly } from "./native-only";
import { z } from "./remember-schema";
import type { OptionsPanelProps, OptionsSpec } from "./types";
import { unfixable } from "./types";

type O = StabilizeOptions;

const sizeOf = (info: MediaInfo) => ({
  width: info.video?.width ?? 0,
  height: info.video?.height ?? 0,
});

function soundWords(info: MediaInfo) {
  if (!info.audio?.length) return "no sound";
  return audioCopied(info, pictureContainer(sourceName(info))) ? "sound copied" : "sound in AAC";
}

const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

const strengthHint: Record<Strength, string> = {
  light: "Takes out quick shake and keeps every deliberate move.",
  medium: "Smooths a hand-held shot while following pans and walks.",
  strong: "Close to a tripod or a gimbal; slow moves become very gentle.",
};

export const stabilizeSpec: OptionsSpec<O> = {
  verb: "Stabilize",
  remember: {
    schema: z.object({
      strength: z.enum(["light", "medium", "strong"]),
      edges: z.enum(["zoom", "borders"]),
    }),
  },
  defaults: () => ({ strength: "medium", edges: "zoom" }),
  previewResult: true,
  nextStep: { slug: "trim-video", label: "Trim video" },
  blocked: (_o, info) => {
    if (!info.video) return unfixable("This file has no video track. Choose a video file.");
    const native = nativeOnly(info, "this file");
    if (native) return native;
    if (info.durationSec < 0.2) return "This video is too short to steady: it needs a few frames.";
    return undefined;
  },
  summary: (o, info) => {
    if (!info.video) return undefined;
    const e = encodedSize(sizeOf(info));
    const est = pictureEstimate(info, sizeOf(info));
    return `${capital(stabilizeWords(o))} · H.264 ${formatDimensions(e.width, e.height)} · ${soundWords(info)} · about ${formatBytes(est.bytes)}`;
  },
  result: () => ({ title: "Stabilized" }),
  Panel: StabilizePanel,
};

function StabilizePanel({ value, onChange }: OptionsPanelProps<O>) {
  const strengthId = useId();
  const edgesId = useId();
  return (
    <div className="flex flex-col gap-6">
      <Field label="Strength" labelId={strengthId} hint={strengthHint[value.strength]}>
        <Segmented
          name="stabilize-strength"
          aria-labelledby={strengthId}
          value={value.strength}
          onChange={(strength) => onChange({ ...value, strength })}
          options={strengths.map((s) => ({ value: s, label: strengthPlans[s].label }))}
        />
      </Field>
      <Field
        label="Edges"
        labelId={edgesId}
        hint={
          value.edges === "zoom"
            ? "Enlarged just enough to hide the moving edges."
            : "Full size; black appears where the frame has moved away from an edge."
        }
      >
        <Segmented
          name="stabilize-edges"
          aria-labelledby={edgesId}
          value={value.edges}
          onChange={(edges) => onChange({ ...value, edges })}
          options={[
            { value: "zoom", label: "Zoom to fill" },
            { value: "borders", label: "Show borders" },
          ]}
        />
      </Field>
    </div>
  );
}
