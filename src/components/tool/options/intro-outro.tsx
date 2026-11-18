"use client";

import { Film, ImageIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { FileName } from "@/components/tool/file-card";
import { MoreOptions } from "@/components/tool/regions/more-options";
import { UnitField } from "@/components/tool/regions/percent-field";
import { ColourField } from "@/components/tool/text-time/colour-field";
import { buttonVariants } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/cn";
import { formatDimensions, formatDuration, withUnit } from "@/lib/format";
import { needsFfmpeg, sourceName } from "@/tools/engines/crop/plan";
import {
  CARD_SEC,
  type Card,
  cardWords,
  fitRect,
  type IntroOutroOptions,
  MAX_CARD_SEC,
  outputSize,
  suggestedTitle,
  timeline,
} from "@/tools/engines/intro-outro/options";
import { drawTitle } from "@/tools/engines/intro-outro/title";
import type { MediaInfo } from "@/tools/engines/types";
import type { OptionsPanelProps, OptionsSpec } from "./types";

type O = IntroOutroOptions;
type Role = "intro" | "outro";
type Kind = "none" | Card["kind"];

const sizeOf = (info: MediaInfo) => ({
  width: info.video?.width ?? 0,
  height: info.video?.height ?? 0,
});

function pageFamily(): string {
  if (typeof document === "undefined") return "sans-serif";
  return (
    getComputedStyle(document.documentElement).getPropertyValue("--font-sans").trim() ||
    "sans-serif"
  );
}

const fpsWords = (info: MediaInfo) => {
  const f = info.video?.fps;
  return f && Number.isFinite(f) ? `${Math.round(f * 100) / 100} fps` : "its frame rate";
};

/** Why a card cannot be used yet, or undefined. */
function cardProblem(c: Card | undefined, role: Role): string | undefined {
  if (c?.kind === "title" && !c.text.trim())
    return `Type the ${role}'s title, or choose a picture or a clip for it.`;
  return undefined;
}

export const introOutroSpec: OptionsSpec<O> = {
  verb: "Add intro and outro",
  verbFor: (o) =>
    o.intro && !o.outro ? "Add intro" : !o.intro && o.outro ? "Add outro" : "Add intro and outro",
  // The title is filled from the file's title tag here, or from a readable file name by the panel.
  defaults: (info) => ({
    intro: {
      kind: "title",
      text: suggestedTitle("", info.tags?.title),
      background: "#000000",
      durationSec: CARD_SEC,
    },
    transition: "crossfade",
    fadeSec: 0.5,
    fit: "contain",
    bars: "#000000",
  }),
  previewResult: true,
  nextStep: { slug: "compress-video", label: "Compress video" },
  blocked: (o, info, _inputs, file) => {
    if (!info.video) return "This file has no video track to add an intro or outro to.";
    if (needsFfmpeg(info, file?.name ?? sourceName(info)))
      return {
        reason:
          info.video.decodable === false
            ? "This browser cannot decode this video's picture, so nothing can be added to it here."
            : "This format is read only by the fallback engine, which cannot add an intro or outro. Convert it to MP4 first.",
        action: { slug: "video-converter", label: "Convert to MP4" },
      };
    if (!o.intro && !o.outro) return "Choose an intro, an outro or both.";
    return cardProblem(o.intro, "intro") ?? cardProblem(o.outro, "outro");
  },
  summary: (o, info) => {
    if (!info.video) return undefined;
    const tl = timeline(o, info.durationSec);
    const size = outputSize(sizeOf(info));
    const parts = [
      o.intro ? `${cardWords(o.intro)} first` : "",
      o.outro ? `${cardWords(o.outro)} last` : "",
    ].filter(Boolean);
    const join = o.transition === "crossfade" ? `${withUnit(o.fadeSec, "s")} crossfades` : "cuts";
    const first = parts.join(" · ");
    return `${first.charAt(0).toUpperCase()}${first.slice(1)} · ${join} · ${formatDuration(tl.total)} · H.264 ${formatDimensions(size.width, size.height)}, ${fpsWords(info)} · AAC · on this device`;
  },
  result: (o) => ({
    title: o.intro && o.outro ? "Intro and outro added" : o.intro ? "Intro added" : "Outro added",
    change: false,
  }),
  Panel: IntroOutroPanel,
};

function IntroOutroPanel({ value, onChange, info, media, disabled }: OptionsPanelProps<O>) {
  const transitionId = useId();
  const fitId = useId();
  // Once per file: an empty default title takes a readable file name ("Trip to Lisbon.mp4").
  const named = useRef<File | null>(null);
  useEffect(() => {
    if (named.current === media.file) return;
    named.current = media.file;
    const intro = value.intro;
    if (intro?.kind !== "title" || intro.text) return;
    const text = suggestedTitle(media.file.name);
    if (text) onChange({ ...value, intro: { ...intro, text } });
  }, [media.file, value, onChange]);
  if (!info.video) return null;
  const frame = outputSize(sizeOf(info));
  return (
    <div className="flex flex-col gap-6">
      <CardSlot
        end="intro"
        card={value.intro}
        frame={frame}
        o={value}
        disabled={disabled}
        onChange={(intro) => onChange({ ...value, intro })}
      />
      <CardSlot
        end="outro"
        card={value.outro}
        frame={frame}
        o={value}
        disabled={disabled}
        onChange={(outro) => onChange({ ...value, outro })}
      />
      <Field
        label="Transition"
        labelId={transitionId}
        hint={
          value.transition === "crossfade"
            ? "The intro fades into the video and the video into the outro, picture and sound."
            : "Straight from one to the next."
        }
      >
        <Segmented<O["transition"]>
          name="intro-transition"
          aria-labelledby={transitionId}
          value={value.transition}
          onChange={(transition) => onChange({ ...value, transition })}
          options={[
            { value: "crossfade", label: "Crossfade" },
            { value: "cut", label: "Cut" },
          ]}
        />
      </Field>
      <MoreOptions>
        <Field
          label="Crossfade length"
          htmlFor="intro-fade"
          hint="At most half of the intro, the outro or the video."
        >
          <UnitField
            id="intro-fade"
            label="Crossfade length in seconds"
            value={value.fadeSec}
            min={0.1}
            max={2}
            step={0.1}
            decimals={1}
            unit="s"
            onCommit={(n) => onChange({ ...value, fadeSec: n })}
          />
        </Field>
        <Field
          label="Clips and pictures of another shape"
          labelId={fitId}
          hint={
            value.fit === "contain"
              ? "Shown whole, with bars in the colour below."
              : "Fill the frame; the edges that do not fit are cut off."
          }
        >
          <Segmented<O["fit"]>
            name="intro-fit"
            aria-labelledby={fitId}
            value={value.fit}
            onChange={(fit) => onChange({ ...value, fit })}
            options={[
              { value: "contain", label: "Fit inside" },
              { value: "cover", label: "Fill the frame" },
            ]}
          />
        </Field>
        {value.fit === "contain" && (
          <ColourField
            name="intro-bars"
            label="Bar colour"
            value={value.bars}
            disabled={disabled}
            onChange={(bars) => onChange({ ...value, bars })}
          />
        )}
      </MoreOptions>
    </div>
  );
}

const KINDS: { value: Kind; label: string }[] = [
  { value: "none", label: "None" },
  { value: "title", label: "Title" },
  { value: "image", label: "Picture" },
  { value: "clip", label: "Clip" },
];

const roleName = (r: Role) => (r === "intro" ? "Intro" : "Outro");

/** One end of the video: nothing, a title card, a picture or a clip, with its preview. */
function CardSlot({
  end: role,
  card,
  frame,
  o,
  disabled,
  onChange,
}: {
  end: Role;
  card: Card | undefined;
  frame: { width: number; height: number };
  o: O;
  disabled?: boolean;
  onChange: (c: Card | undefined) => void;
}) {
  const kindId = useId();
  const textId = useId();
  const durId = useId();
  const fileId = useId();
  // What was typed or picked stays while the user flips between kinds.
  const [kept, setKept] = useState<Partial<Record<Card["kind"], Card>>>({});
  const [error, setError] = useState<string>();
  const [reading, setReading] = useState(false);
  // Picture or clip chosen, file not picked yet.
  const [wanted, setWanted] = useState<Kind>();
  const pick = (k: Kind) => {
    setError(undefined);
    if (card) setKept((m) => ({ ...m, [card.kind]: card }));
    if (k === "none") return onChange(undefined);
    const back = kept[k];
    if (back) return onChange(back);
    if (k === "title")
      return onChange({ kind: "title", text: "", background: "#000000", durationSec: CARD_SEC });
    // Picture and clip wait for a file.
    onChange(undefined);
    setWanted(k);
  };
  const shown: Kind = card ? card.kind : (wanted ?? "none");
  const read = async (file: File | undefined, k: "image" | "clip") => {
    if (!file) return;
    setReading(true);
    setError(undefined);
    try {
      onChange(await readCardFile(file, k));
      setWanted(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : `${file.name} could not be read.`);
    } finally {
      setReading(false);
    }
  };
  return (
    <section aria-labelledby={kindId} className="flex flex-col gap-3">
      <Field label={roleName(role)} labelId={kindId}>
        <Segmented<Kind>
          name={`${role}-kind`}
          aria-labelledby={kindId}
          value={shown}
          onChange={pick}
          options={KINDS}
        />
      </Field>
      {(card || shown !== "none") && (
        <div className="flex gap-3">
          {card && <CardPreview card={card} frame={frame} o={o} />}
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            {card?.kind === "title" && (
              <>
                <label htmlFor={textId} className="sr-only">
                  {roleName(role)} title
                </label>
                <textarea
                  id={textId}
                  rows={2}
                  maxLength={200}
                  value={card.text}
                  disabled={disabled}
                  placeholder={role === "intro" ? "Title of the video" : "Thanks for watching"}
                  onChange={(e) => onChange({ ...card, text: e.target.value })}
                  className="w-full rounded-md border border-border bg-bg-raised px-3 py-2 text-fg text-sm pointer-coarse:text-body placeholder:text-fg-muted transition-colors duration-(--duration-instant) hover:border-border-strong focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:opacity-50"
                />
              </>
            )}
            {(shown === "image" || shown === "clip") && (
              <>
                {card && card.kind !== "title" ? (
                  <div className="flex items-center gap-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <FileName name={card.name} />
                      <span className="tabular block text-fg-muted text-xs">
                        {formatDimensions(Math.round(card.width), Math.round(card.height))}
                        {card.kind === "clip" ? ` · ${formatDuration(card.durationSec)}` : ""}
                      </span>
                    </div>
                  </div>
                ) : null}
                <label
                  htmlFor={fileId}
                  className={cn(
                    buttonVariants({ variant: "secondary", size: "sm" }),
                    "min-h-11 w-fit gap-2 has-focus-visible:outline-2 has-focus-visible:outline-ring has-focus-visible:outline-offset-2",
                    disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
                  )}
                >
                  {shown === "image" ? (
                    <ImageIcon size={16} strokeWidth={1.5} aria-hidden />
                  ) : (
                    <Film size={16} strokeWidth={1.5} aria-hidden />
                  )}
                  {reading
                    ? "Reading the file"
                    : card
                      ? `Choose another ${shown === "image" ? "picture" : "clip"}`
                      : `Choose the ${role} ${shown === "image" ? "picture" : "clip"}`}
                  <input
                    id={fileId}
                    type="file"
                    accept={
                      shown === "image"
                        ? "image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                        : "video/*,.mp4,.mov,.m4v,.webm,.mkv"
                    }
                    className="sr-only"
                    disabled={disabled}
                    onChange={(e) => {
                      void read(e.target.files?.[0], shown === "image" ? "image" : "clip");
                      e.target.value = "";
                    }}
                  />
                </label>
              </>
            )}
            {card && card.kind !== "clip" && (
              <div className="flex items-center gap-2">
                <label htmlFor={durId} className="text-fg-muted text-sm">
                  Shows for
                </label>
                <UnitField
                  id={durId}
                  label={`${roleName(role)} length in seconds`}
                  value={card.durationSec}
                  min={1}
                  max={30}
                  unit="s"
                  onCommit={(n) => onChange({ ...card, durationSec: n })}
                />
              </div>
            )}
          </div>
        </div>
      )}
      {card?.kind === "title" && (
        <ColourField
          name={`${role}-colour`}
          presets={false}
          label="Card colour"
          value={card.background}
          disabled={disabled}
          onChange={(background) => onChange({ ...card, background })}
        />
      )}
      {error && (
        <p className="text-sm" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

/** A picture's or a clip's size (and a clip's length), read on the page. */
async function readCardFile(file: File, kind: "image" | "clip"): Promise<Card> {
  const url = URL.createObjectURL(file);
  try {
    if (kind === "image") {
      const img = new Image();
      img.src = url;
      try {
        await img.decode();
      } catch {
        throw new Error(`${file.name} is not a PNG, JPEG or WebP picture.`);
      }
      return {
        kind: "image",
        file,
        name: file.name,
        width: img.naturalWidth,
        height: img.naturalHeight,
        durationSec: CARD_SEC,
      };
    }
    const v = document.createElement("video");
    v.muted = true;
    v.preload = "metadata";
    v.src = url;
    await new Promise<void>((resolve, reject) => {
      v.onloadedmetadata = () => resolve();
      v.onerror = () => reject(new Error(`${file.name} cannot be played in this browser.`));
    });
    if (!v.videoWidth || !Number.isFinite(v.duration) || v.duration <= 0)
      throw new Error(`${file.name} has no picture to use.`);
    if (v.duration > MAX_CARD_SEC)
      throw new Error(
        `${file.name} is ${formatDuration(v.duration)} long; an intro or outro can be up to ${formatDuration(MAX_CARD_SEC)}. To join long videos, use merge videos.`,
      );
    return {
      kind: "clip",
      file,
      name: file.name,
      width: v.videoWidth,
      height: v.videoHeight,
      durationSec: v.duration,
      hasAudio: false,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The card as it will look in the frame, small: the title drawn by the same code, or the picture. */
function CardPreview({
  card,
  frame,
  o,
}: {
  card: Card;
  frame: { width: number; height: number };
  o: O;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [url, setUrl] = useState<string>();
  const file = card.kind === "title" ? undefined : card.file;
  useEffect(() => {
    if (!file) return;
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  // 96 px on the long side, the frame's shape.
  const k = 96 / Math.max(frame.width, frame.height);
  const w = Math.round(frame.width * k);
  const h = Math.round(frame.height * k);
  useEffect(() => {
    const c = ref.current;
    if (!c || card.kind !== "title") return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const s = (w * dpr) / frame.width;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    drawTitle(ctx, frame, card, pageFamily());
  }, [card, frame, w, h]);
  if (card.kind === "title")
    return (
      <canvas
        ref={ref}
        aria-hidden
        className="shrink-0 rounded-sm"
        style={{ width: w, height: h }}
      />
    );
  const r = fitRect({ width: card.width, height: card.height }, { width: w, height: h }, o.fit);
  return (
    <div
      aria-hidden
      className="relative shrink-0 overflow-hidden rounded-sm"
      style={{ width: w, height: h, backgroundColor: o.bars }}
    >
      {url &&
        (card.kind === "image" ? (
          <img
            src={url}
            alt=""
            className="absolute max-w-none"
            style={{ left: r.x, top: r.y, width: r.width, height: r.height }}
          />
        ) : (
          <video
            src={`${url}#t=0.1`}
            muted
            playsInline
            preload="metadata"
            className="absolute max-w-none"
            style={{ left: r.x, top: r.y, width: r.width, height: r.height }}
          />
        ))}
    </div>
  );
}
