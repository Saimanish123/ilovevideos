"use client";

import { FlipHorizontal2, FlipVertical2, RotateCcw, RotateCw } from "lucide-react";
import { type ComponentType, useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatDimensions } from "@/lib/format";
import { containerFor, type RotateOptions } from "@/tools/engines/rotate";
import {
  addRotation,
  type Flip,
  isIdentity,
  isMetadataRotation,
  type Rotation,
  rotatedDimensions,
  rotations,
} from "@/tools/engines/rotate/math";
import type { MediaInfo } from "@/tools/engines/types";
import { PLAY_SHORTCUT, useWorkspaceKeys } from "../shortcuts";
import { isFlip } from "./idle/rotate";
import type { OptionsSpec } from "./types";

const isRotation = (v: unknown): v is Rotation =>
  typeof v === "number" && (rotations as readonly number[]).includes(v);

const rotationLabel: Record<Rotation, string> = {
  0: "No rotation",
  90: "90° clockwise",
  180: "180°",
  270: "90° anticlockwise",
};
const flipLabel: Record<Flip, string> = {
  none: "",
  horizontal: "mirrored left to right",
  vertical: "flipped top to bottom",
};

/** Four large icon buttons: two act (a quarter turn each way), two toggle (the flips). */
function ActionButton({
  icon: Icon,
  label,
  onClick,
  pressed,
  shortcut,
}: {
  icon: ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean }>;
  label: string;
  onClick: () => void;
  pressed?: boolean;
  shortcut: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      aria-keyshortcuts={shortcut}
      className={cn(
        "flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-md border px-3 py-3 text-sm transition-[background-color,color,border-color,scale] duration-(--duration-fast) ease-out focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 not-focus-visible:active:scale-97 disabled:active:scale-100 motion-reduce:active:scale-100",
        pressed
          ? "border-fg bg-bg-subtle font-medium text-fg"
          : "border-border bg-bg text-fg hover:bg-bg-subtle",
      )}
    >
      <Icon size={20} strokeWidth={1.5} aria-hidden />
      {label}
    </button>
  );
}

/** Whether the run only rewrites the rotation flag (lossless) for this file. */
const flagOnly = (o: RotateOptions, info: MediaInfo) =>
  isMetadataRotation(containerFor(`file.${info.container.toLowerCase()}`), o.flip);

/** The file's own rotation flag when it turns the picture a quarter (phones filming upright). */
const sidewaysFlag = (info: MediaInfo) => {
  const r = (((info.video?.rotation ?? 0) % 360) + 360) % 360;
  return r === 90 || r === 270 ? r : undefined;
};

/** "Rotated 90° clockwise, mirrored left to right" from the options. */
function describe(o: RotateOptions): string {
  const parts = [
    o.rotate !== 0 ? rotationLabel[o.rotate] : undefined,
    o.flip !== "none" ? flipLabel[o.flip] : undefined,
  ].filter(Boolean);
  const text = parts.join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const rotateSpec: OptionsSpec<RotateOptions> = {
  verb: "Rotate",
  previewResult: true,
  nextStep: { slug: "compress-video", label: "Compress it to share" },
  shortcuts: [
    { keys: "R", label: "Rotate right" },
    { keys: "Shift R", label: "Rotate left" },
    { keys: "H", label: "Flip horizontal" },
    { keys: "V", label: "Flip vertical" },
    PLAY_SHORTCUT,
  ],
  result: (o, info) => {
    const v = info.video;
    const dims = v ? rotatedDimensions(v.width, v.height, o.rotate) : undefined;
    const size =
      v && dims && o.rotate % 180 !== 0
        ? `: ${formatDimensions(v.width, v.height)} → ${formatDimensions(dims.width, dims.height)}`
        : "";
    return {
      title: `${describe(o)}${size}`,
      detail: flagOnly(o, info)
        ? "Only the rotation flag changed; the video is the same bits as before. The preview plays the result."
        : "Every frame was redrawn and re-encoded. The preview plays the result.",
      // A flag rewrite keeps the size; a re-encode changes it for reasons that are not a saving.
      change: false,
    };
  },
  defaults: (_info, preset) => ({
    rotate: isRotation(preset.rotate) ? preset.rotate : 0,
    flip: isFlip(preset.flip) ? preset.flip : "none",
  }),
  blocked: (o, info) => {
    if (!info.video) return "This file has no video track to rotate.";
    if (isIdentity(o.rotate, o.flip)) return "Choose a rotation or a flip first.";
    return undefined;
  },
  // The dimensions are the panel's headline; this line says what the run costs.
  summary: (o, info) => {
    if (!info.video || isIdentity(o.rotate, o.flip)) return undefined;
    if (flagOnly(o, info))
      return "Lossless: only the rotation flag in the file header changes; the video is copied as it is.";
    const why =
      o.flip !== "none"
        ? "A flip rewrites every pixel"
        : "This container has no rotation flag, so every frame is redrawn";
    return `${why} and the video is re-encoded. Runs on this device.`;
  },
  previewStyle: (o, info) => {
    const v = info.video;
    if (!v || v.width <= 0 || v.height <= 0) return undefined;
    // The container keeps the source aspect ratio, so a quarter turn is scaled to fit inside it.
    const fit = o.rotate % 180 === 0 ? 1 : Math.min(v.width / v.height, v.height / v.width);
    const flip =
      o.flip === "horizontal" ? "scaleX(-1) " : o.flip === "vertical" ? "scaleY(-1) " : "";
    return { transform: `${flip}rotate(${o.rotate}deg) scale(${fit})` };
  },
  Panel({ value, onChange, info, preset }) {
    const root = useRef<HTMLDivElement>(null);
    const v = info.video;
    const dims = v ? rotatedDimensions(v.width, v.height, value.rotate) : undefined;
    const identity = isIdentity(value.rotate, value.flip);
    // The flip page leads with the flips: that is the job its visitors came for.
    const flipFirst = isFlip(preset.flip) && preset.flip !== "none";
    const turn = (delta: 90 | -90) =>
      onChange({ ...value, rotate: addRotation(value.rotate, delta) });
    const flip = (f: Exclude<Flip, "none">) =>
      onChange({ ...value, flip: value.flip === f ? "none" : f });
    useWorkspaceKeys(root, [
      { key: "r", shift: false, run: () => turn(90) },
      { key: "r", shift: true, run: () => turn(-90) },
      { key: "h", run: () => flip("horizontal") },
      { key: "v", run: () => flip("vertical") },
    ]);
    const sideways = sidewaysFlag(info);
    const rotateButtons = (
      <>
        <ActionButton
          icon={RotateCcw}
          label="Rotate left"
          shortcut="Shift+R"
          onClick={() => turn(-90)}
        />
        <ActionButton icon={RotateCw} label="Rotate right" shortcut="R" onClick={() => turn(90)} />
      </>
    );
    const flipButtons = (
      <>
        <ActionButton
          icon={FlipHorizontal2}
          label="Flip horizontal"
          shortcut="H"
          pressed={value.flip === "horizontal"}
          onClick={() => flip("horizontal")}
        />
        <ActionButton
          icon={FlipVertical2}
          label="Flip vertical"
          shortcut="V"
          pressed={value.flip === "vertical"}
          onClick={() => flip("vertical")}
        />
      </>
    );
    return (
      <div ref={root} className="flex flex-col gap-6">
        <div aria-live="polite">
          {v && dims && (
            <p className="tabular text-h2" data-testid="rotate-dimensions">
              {value.rotate % 180 === 0 ? (
                formatDimensions(v.width, v.height)
              ) : (
                <>
                  <span className="text-fg-muted">{formatDimensions(v.width, v.height)} →</span>{" "}
                  {formatDimensions(dims.width, dims.height)}
                </>
              )}
            </p>
          )}
          <p className="mt-1 text-sm">
            <span className="font-medium">
              {identity ? "Original orientation" : describe(value)}
            </span>
            {!identity && (
              <span className="text-fg-muted">
                {" "}
                · {flagOnly(value, info) ? "lossless, flag only" : "re-encoded"}
              </span>
            )}
          </p>
        </div>
        <fieldset className="flex flex-col gap-3">
          <legend className="font-medium text-sm">
            {flipFirst ? "Flip and rotate" : "Rotate and flip"}
          </legend>
          <div className="grid grid-cols-2 gap-3">
            {flipFirst ? flipButtons : rotateButtons}
            {flipFirst ? rotateButtons : flipButtons}
          </div>
          <p className="text-fg-muted text-xs">
            The preview shows the result as you press. Each turn is a quarter; a flip is a toggle.
          </p>
        </fieldset>
        {sideways !== undefined && (
          <p className="text-fg-muted text-sm" data-testid="sideways-note">
            This file already carries a {sideways}° rotation flag, the way phones save video filmed
            upright. Browsers, phones and most players apply it, as the preview does: if the picture
            above looks right, it needs no turn. Rotating here changes that flag.
          </p>
        )}
        {!identity && (
          <div className="-mt-3 flex">
            <Button
              variant="ghost"
              size="md"
              className="-ml-4 min-h-11"
              onClick={() => onChange({ rotate: 0, flip: "none" })}
            >
              Reset
            </Button>
          </div>
        )}
      </div>
    );
  },
};
