"use client";

import { FileText } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { FileName } from "@/components/tool/file-card";
import { MoreOptions } from "@/components/tool/regions/more-options";
import { UnitField } from "@/components/tool/regions/percent-field";
import { usePlayhead } from "@/components/tool/regions/use-playhead";
import { ColourField } from "@/components/tool/text-time/colour-field";
import { CueGuide } from "@/components/tool/text-time/cue-guide";
import { CueTimeline } from "@/components/tool/text-time/cue-timeline";
import { PictureCanvas } from "@/components/tool/text-time/picture-canvas";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import { baseName, formatDuration } from "@/lib/format";
import { audioCopied, encodedSoundWords, sourceName } from "@/tools/engines/crop/plan";
import { ffmpegDownloadSize } from "@/tools/engines/ffmpeg/size";
import { compositeContainer } from "@/tools/engines/overlay/composite";
import { CueRenderer, FONT_STACK } from "@/tools/engines/overlay/text";
import { soundEncodersNow } from "@/tools/engines/sound-codec";
import { formatNames } from "@/tools/engines/subtitles";
import { decodeSubtitleBytes } from "@/tools/engines/subtitles/decode";
import {
  languageByCode,
  languageFromFile,
  languages,
  UNDETERMINED,
} from "@/tools/engines/subtitles/languages";
import {
  type AddSubtitlesOptions,
  missingGlyph,
  planRoute,
  planSubtitles,
  type SubtitlePlan,
} from "@/tools/engines/subtitles-add/options";
import { burnCues } from "@/tools/engines/subtitles-add/phrases";
import {
  bandHeight,
  cueStyle,
  highestPosition,
  type Look,
  lookBox,
  lookLineWidth,
  lookPosition,
  lookSizes,
  textPx,
} from "@/tools/engines/subtitles-add/style";
import { allText, readTrack, type TrackDoc, trackText } from "@/tools/engines/subtitles-add/track";
import { isText, type SubtitleTrack, trackTitle } from "@/tools/engines/subtitles-extract/model";
import {
  extractTracks,
  listSubtitleTracks,
  sourceText,
} from "@/tools/engines/subtitles-extract/tracks";
import type { MediaInfo } from "@/tools/engines/types";
import { handedSubtitle } from "./idle/subtitles-add";
import { z } from "./remember-schema";
import type { OptionsPanelProps, OptionsSpec } from "./types";

type O = AddSubtitlesOptions;

/**
 * Parsed once per stored subtitle object and video length; the stage calls summary and blocked on
 * every render. With a length, cues after the end of the video are left out, as the engine does.
 */
const parsed = new WeakMap<object, Map<number, { track?: TrackDoc; error?: string }>>();
function trackOf(o: O, durationSec = 0): { track?: TrackDoc; error?: string } {
  const sub = o.subtitle;
  if (!sub) return {};
  const byLength = parsed.get(sub) ?? new Map();
  parsed.set(sub, byLength);
  let r = byLength.get(durationSec);
  if (!r) {
    try {
      r = { track: readTrack(sub.text, sub.name, durationSec || undefined) };
    } catch (e) {
      r = { error: (e as Error).message };
    }
    byLength.set(durationSec, r);
  }
  return r;
}

function planOf(o: O, info: MediaInfo, fileName: string): SubtitlePlan | undefined {
  const { track } = trackOf(o, info.durationSec);
  if (!track) return undefined;
  return planSubtitles(
    info,
    fileName,
    o,
    track.doc.format,
    missingGlyph(allText(track)) === undefined,
  );
}

/**
 * True when the burn-in draws in one of the looks (the canvas renderer, or libass told the look for a
 * file only ffmpeg reads); false for soft tracks and for ASS scripts kept in their own styling.
 */
function styledBurn(o: O, track: TrackDoc | undefined, p: SubtitlePlan | undefined): boolean {
  if (p?.mode !== "burn" || !track) return false;
  return !(p.renderer === "libass" && track.doc.format === "ass" && o.keepStyling);
}

/** The page's sans for the preview (the worker draws with the same Geist from /wasm/fonts). */
function pageFamily(): string {
  if (typeof document === "undefined") return FONT_STACK;
  const v = getComputedStyle(document.documentElement).getPropertyValue("--font-sans").trim();
  return v || FONT_STACK;
}

const lookNames: Record<Look, string> = {
  classic: "Classic",
  boxed: "Boxed",
  social: "Bold social",
};

const sizeOf = (info: MediaInfo) => ({
  width: info.video?.width ?? 0,
  height: info.video?.height ?? 0,
});

/** "Bold social · short phrases, estimated timing". */
function lookWords(o: O): string {
  return `${lookNames[o.look]}${o.phrases ? " · short phrases, estimated timing" : ""}`;
}

/** The stage's summary/blocked/result get no file name; the container's own extension stands in. */
const nameFor = (info: MediaInfo) => sourceName(info);

const count = (n: number, one = "cue", many = `${one}s`) =>
  `${n.toLocaleString("en")} ${n === 1 ? one : many}`;
const languageName = (code: string) =>
  code === UNDETERMINED ? "language not set" : (languageByCode.get(code)?.name ?? code);

const languageOptions = [
  { value: UNDETERMINED, label: "Not set" },
  ...languages.map((l) => ({ value: l.code, label: l.name })),
];

function softWhat(p: Extract<SubtitlePlan, { mode: "soft" }>): string {
  const into =
    p.ext === "mkv" ? "MKV" : p.ext === "webm" ? "WebM" : p.ext === "mov" ? "MOV" : "MP4";
  const codec =
    p.codec === "mov_text" ? "mov_text" : p.codec === "webvtt" ? "WebVTT" : p.codec.toUpperCase();
  // mov_text is a codec name few people know: say what it is for.
  if (p.codec === "mov_text") return `${into}'s own subtitle track`;
  return `${/^[AEFHILMNORSX]/.test(codec) ? "an" : "a"} ${codec} track in the ${into}`;
}

/** "MP4's own subtitle track", "SRT track in the MKV": for the one-line summary. */
const softShort = (p: Extract<SubtitlePlan, { mode: "soft" }>) => softWhat(p).replace(/^an? /, "");

/** What happens to the sound when the subtitles are burned in, by the path the run takes. */
function burnSound(info: MediaInfo, p: Extract<SubtitlePlan, { mode: "burn" }>): string {
  const a = info.audio?.[0]?.codec;
  if (!a) return "no sound";
  const copied =
    planRoute(p) === "page"
      ? p.ext === "mkv" || a === "aac" || a === "mp3"
      : audioCopied(info, compositeContainer(nameFor(info)));
  if (copied) return "sound copied";
  // ffmpeg.wasm writes AAC; the native path follows this browser's encoders.
  return planRoute(p) === "page"
    ? "sound in AAC"
    : encodedSoundWords(compositeContainer(nameFor(info)), soundEncodersNow());
}

/** Reads a subtitle file into the stored shape, with the language its name or header states. */
async function readSubtitleFile(
  file: File,
): Promise<{ subtitle: NonNullable<O["subtitle"]>; language?: string }> {
  const { text } = decodeSubtitleBytes(new Uint8Array(await file.arrayBuffer()));
  let header: string | undefined;
  try {
    header = readTrack(text, file.name).doc.header;
  } catch {
    // the panel shows the parse error from the stored text
  }
  return {
    subtitle: { name: file.name, text },
    language: languageFromFile(file.name, header)?.code,
  };
}

export const addSubtitlesSpec: OptionsSpec<O> = {
  verb: "Add subtitles",
  // One subtitle file belongs to one video: never a batch.
  batch: false,
  acceptHandoff: async (file) =>
    /\.(srt|vtt|ass|ssa|sbv)$/i.test(file.name) ? readSubtitleFile(file) : undefined,
  remember: {
    schema: z.object({
      mode: z.enum(["soft", "burn"]),
      showByDefault: z.boolean(),
      size: z.enum(["small", "medium", "large"]),
      keepStyling: z.boolean(),
      look: z.enum(["classic", "boxed", "social"]),
    }),
  },
  defaults: (_info, preset) => ({
    mode: preset.mode === "burn" ? "burn" : "soft",
    subtitle: handedSubtitle(preset),
    language: typeof preset.language === "string" ? preset.language : UNDETERMINED,
    showByDefault: true,
    size: "medium",
    keepStyling: true,
    look: preset.look === "boxed" || preset.look === "social" ? preset.look : "classic",
    color: "#ffffff",
    phrases: preset.look === "social",
  }),
  route: (o, info, fileName) => {
    const p = planOf(o, info, fileName);
    return p ? planRoute(p) : "worker";
  },
  previewResult: true,
  // Burned in: the picture changed, so a wipe. A soft track leaves the picture as it was (ADR-0134).
  compare: (o) => (o.mode === "burn" ? { what: "picture" } : false),
  nextStep: { slug: "compress-video", label: "Compress video" },
  previewTrack: (o, info, phase) => {
    const { track } = trackOf(o, info.durationSec);
    if (!track || (phase === "done" && o.mode === "burn")) return undefined;
    // A styled burn-in is drawn over the preview by the page's own renderer (Overlay).
    if (styledBurn(o, track, planOf(o, info, nameFor(info)))) return undefined;
    const l = languageByCode.get(o.language);
    return {
      vtt: trackText(track, "vtt"),
      language: l?.code1 ?? "und",
      label: l?.name ?? "Subtitles",
    };
  },
  blocked: (o, info) => {
    if (!info.video) return "This file has no video track to add subtitles to.";
    if (!o.subtitle) return "Add the subtitle file first.";
    const { track, error } = trackOf(o, info.durationSec);
    if (error) return error;
    if (track && track.doc.cues.length === 0)
      return track.beyond > 0
        ? "Every cue starts after the video ends. Check that this subtitle file belongs to this video."
        : "The subtitle file has no cue with a length.";
    return undefined;
  },
  summary: (o, info) => {
    const p = planOf(o, info, nameFor(info));
    const { track } = trackOf(o, info.durationSec);
    if (!p || !track) return undefined;
    const tool = planRoute(p) === "page" ? ` · ${ffmpegDownloadSize()} download, once` : "";
    const lang = languageName(o.language);
    if (p.mode === "soft")
      return `${lang[0]?.toUpperCase()}${lang.slice(1)} · ${softShort(p)} · nothing re-encoded${tool}`;
    const look = styledBurn(o, track, p) ? lookWords(o) : "ASS styling kept";
    return `Burned in · ${look} · H.264 · ${burnSound(info, p)}${tool}`;
  },
  result: (o, info) => {
    const p = planOf(o, info, nameFor(info));
    const { track } = trackOf(o, info.durationSec);
    if (!p || !track) return undefined;
    return { change: false, title: p.mode === "soft" ? "Subtitles added" : "Subtitles burned in" };
  },
  Overlay: BurnPreview,
  Below({ value, info, media, disabled }) {
    const { track } = trackOf(value, info.durationSec);
    if (value.mode !== "burn" || !track || !info.video) return null;
    return (
      <CueTimeline
        file={media.file}
        video={media.video}
        duration={info.durationSec}
        cues={burnCues(track.doc.cues, value)}
        phrases={value.phrases}
        disabled={disabled}
      />
    );
  },
  Panel({ value, onChange, info, media, disabled }) {
    const modeId = useId();
    const { track, error } = trackOf(value, info.durationSec);
    const p = planOf(value, info, media.file.name);
    const missing = track && track.doc.format === "ass" ? missingGlyph(allText(track)) : undefined;
    const late = track?.beyond ?? 0;
    return (
      <div className="flex flex-col gap-6">
        <SubtitlePicker
          value={value}
          disabled={disabled}
          onPick={(subtitle, detected) =>
            onChange({ ...value, subtitle, language: detected ?? value.language })
          }
          onRemove={() => onChange({ ...value, subtitle: undefined })}
        />
        {!value.subtitle && (
          <VideoTracks
            file={media.file}
            disabled={disabled}
            onPick={(subtitle, language) =>
              onChange({ ...value, subtitle, mode: "burn", language: language ?? value.language })
            }
          />
        )}
        {error && (
          <p className="text-sm" role="alert">
            {error}
          </p>
        )}
        {track && (
          <div className="-mt-3 flex flex-col gap-1 text-fg-muted text-xs">
            {track.dropped > 0 && (
              <p>
                {count(track.dropped)} with no length {track.dropped === 1 ? "is" : "are"} left out.
              </p>
            )}
            {late > 0 && (
              <p>
                {count(late)} {late === 1 ? "starts" : "start"} after the video ends at{" "}
                {formatDuration(info.durationSec)} and {late === 1 ? "is" : "are"} left out.
              </p>
            )}
          </div>
        )}
        <Field
          label="How to add them"
          labelId={modeId}
          hint={
            value.mode === "soft"
              ? "A track viewers switch on or off. Nothing is re-encoded; each player draws it in its own style."
              : "Drawn into the picture, so it shows everywhere, including apps that ignore subtitle tracks. Re-encodes the video."
          }
        >
          <Segmented
            name="subtitle-mode"
            aria-labelledby={modeId}
            value={value.mode}
            onChange={(mode) => onChange({ ...value, mode })}
            options={[
              { value: "soft", label: "Soft track" },
              { value: "burn", label: "Burn in" },
            ]}
          />
        </Field>
        {value.mode === "soft" ? (
          <>
            <Field
              label="Language"
              htmlFor="subtitle-language"
              hint="Stored with the track so players can name it in their subtitle menu."
            >
              <Select
                id="subtitle-language"
                value={value.language}
                onValueChange={(language) => onChange({ ...value, language })}
                options={languageOptions}
              />
            </Field>
            <Checkbox
              label="Show by default"
              hint="Marks the track as default, so most players show it without being asked."
              checked={value.showByDefault}
              onChange={(e) => onChange({ ...value, showByDefault: e.target.checked })}
            />
          </>
        ) : (
          <>
            {track?.doc.format === "ass" && (
              <Checkbox
                label="Keep the ASS styling"
                disabled={missing !== undefined}
                hint={
                  missing !== undefined
                    ? `The bundled font has no “${missing}”, so the script's styling cannot be kept; the text is drawn in the look below.`
                    : "Colours, positions and sizes from the script, with the Geist font, which covers Latin and Cyrillic letters. Slower than the other looks."
                }
                checked={value.keepStyling && missing === undefined}
                onChange={(e) => onChange({ ...value, keepStyling: e.target.checked })}
              />
            )}
            {styledBurn(value, track, p) && (
              <BurnStyle value={value} onChange={onChange} info={info} disabled={disabled} />
            )}
          </>
        )}
      </div>
    );
  },
};

const SUB_ACCEPT = ".srt,.vtt,.ass,.ssa,.sbv,text/vtt,application/x-subrip";

/** The second input of this page: a drop target and a file button for the subtitle file. */
function SubtitlePicker({
  value,
  disabled,
  onPick,
  onRemove,
}: {
  value: O;
  disabled?: boolean;
  onPick: (subtitle: NonNullable<O["subtitle"]>, language?: string) => void;
  onRemove: () => void;
}) {
  const inputId = useId();
  const [over, setOver] = useState(false);
  const [reading, setReading] = useState(false);
  const { track } = trackOf(value);
  const read = async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    try {
      const { subtitle, language } = await readSubtitleFile(file);
      onPick(subtitle, language);
    } finally {
      setReading(false);
    }
  };
  const sub = value.subtitle;
  if (sub)
    return (
      <div className="flex items-center gap-3 rounded-md bg-bg-subtle px-4 py-3 text-sm">
        <FileText size={20} strokeWidth={1.5} aria-hidden className="shrink-0 text-fg-muted" />
        <div className="min-w-0 flex-1">
          <FileName name={sub.name} />
          <p className="tabular mt-0.5 text-fg-muted text-xs">
            {track
              ? `${formatNames[track.doc.format]} · ${count(track.doc.cues.length)} · ends ${formatDuration(
                  track.doc.cues.reduce((m, c) => Math.max(m, c.end), 0) / 1000,
                )}`
              : "Could not be read"}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="min-h-11"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Remove ${sub.name}`}
        >
          Remove
        </Button>
      </div>
    );
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a drop target; the file button inside is the keyboard path
    <div
      className={cn(
        "flex flex-col items-center gap-2 rounded-md border px-4 py-5 text-center text-sm transition-colors duration-(--duration-instant)",
        over
          ? "border-solid border-fg bg-bg-raised"
          : "border-dashed border-border-strong bg-bg-subtle",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void read(e.dataTransfer.files[0]);
      }}
    >
      <label
        htmlFor={inputId}
        className={cn(
          buttonVariants({ variant: "secondary", size: "sm" }),
          "min-h-11 cursor-pointer has-focus-visible:outline-2 has-focus-visible:outline-ring has-focus-visible:outline-offset-2",
        )}
      >
        {reading ? "Reading the file" : "Choose the subtitle file"}
        <input
          id={inputId}
          type="file"
          accept={SUB_ACCEPT}
          className="sr-only"
          disabled={disabled}
          onChange={(e) => void read(e.target.files?.[0])}
        />
      </label>
      <p className="text-fg-muted text-xs">Or drop it here.</p>
    </div>
  );
}

/** The burned-in cues over the preview, drawn by the worker's own renderer, and the position band. */
function BurnPreview(props: OptionsPanelProps<O>) {
  const { track } = trackOf(props.value, props.info.durationSec);
  const p = planOf(props.value, props.info, props.media.file.name);
  if (!props.info.video || !styledBurn(props.value, track, p) || !track) return null;
  return <BurnPreviewOn {...props} track={track} />;
}

function BurnPreviewOn({
  value,
  onChange,
  info,
  media,
  disabled,
  track,
}: OptionsPanelProps<O> & { track: TrackDoc }) {
  const w = info.video?.width ?? 0;
  const h = info.video?.height ?? 0;
  const source = useMemo(() => ({ width: w, height: h }), [w, h]);
  const now = usePlayhead(media.video);
  const style = useMemo(() => cueStyle(value, source, pageFamily()), [value, source]);
  const renderer = useMemo(
    () => new CueRenderer(burnCues(track.doc.cues, value), w, h, value.size, style),
    [track, value, w, h, style],
  );
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D) => renderer.draw(ctx, now),
    [renderer, now],
  );
  const band = bandHeight(style);
  return (
    <PictureCanvas source={source} draw={draw}>
      <CueGuide
        source={source}
        position={style.bottom / Math.max(1, h)}
        min={highestPosition(style, h)}
        bandHeight={band}
        bandWidth={Math.min(w, style.maxWidth + style.outline * 2)}
        disabled={disabled}
        onChange={(position) => onChange({ ...value, position })}
      />
    </PictureCanvas>
  );
}

const LOOKS: { value: Look; label: string }[] = [
  { value: "classic", label: "Classic" },
  { value: "boxed", label: "Boxed" },
  { value: "social", label: "Bold social" },
];
const lookHints: Record<Look, string> = {
  classic: "White with a black outline, the way players draw subtitles.",
  boxed: "On a see-through box behind each line, readable over busy footage.",
  social: "Large and bold, above the part of a vertical feed the app covers.",
};

/** The look of a burn-in drawn by the canvas renderer (or libass told the same look). */
function BurnStyle({
  value,
  onChange,
  info,
  disabled,
}: {
  value: O;
  onChange: (o: O) => void;
  info: MediaInfo;
  disabled?: boolean;
}) {
  const lookId = useId();
  const sizeId = useId();
  const v = sizeOf(info);
  const root = Math.sqrt(Math.max(1, v.width * v.height));
  const share = value.fontShare;
  const sizePreset =
    share === undefined
      ? value.size
      : (Object.keys(lookSizes[value.look]) as O["size"][]).find(
          (k) => Math.abs(lookSizes[value.look][k] - share) < 1e-6,
        );
  const position = value.position ?? lookPosition(value.look, v);
  return (
    <>
      <Field label="Look" labelId={lookId} hint={lookHints[value.look]}>
        <Segmented<Look>
          name="subtitle-look"
          aria-labelledby={lookId}
          value={value.look}
          onChange={(look) =>
            onChange({
              ...value,
              look,
              fontShare: undefined,
              position: undefined,
              boxOpacity: undefined,
              lineWidth: undefined,
              phrases: look === "social",
            })
          }
          options={LOOKS}
        />
      </Field>
      <Field label="Text size" labelId={sizeId}>
        <Segmented<string>
          name="subtitle-size"
          aria-labelledby={sizeId}
          value={sizePreset ?? ""}
          onChange={(size) => onChange({ ...value, size: size as O["size"], fontShare: undefined })}
          options={[
            { value: "small", label: "Small" },
            { value: "medium", label: "Medium" },
            { value: "large", label: "Large" },
          ]}
        />
      </Field>
      <ColourField
        name="subtitle-colour"
        label="Text colour"
        value={value.color}
        disabled={disabled}
        custom={false}
        onChange={(color) => onChange({ ...value, color })}
      />
      <Checkbox
        label="Short phrases"
        hint="Shows long cues a few words at a time. The file has no word times, so each phrase's time is shared out by its length: close, not exact."
        checked={value.phrases}
        disabled={disabled}
        onChange={(e) => onChange({ ...value, phrases: e.target.checked })}
      />
      <MoreOptions>
        <Field label="Exact text size" htmlFor="subtitle-size-px">
          <UnitField
            id="subtitle-size-px"
            label="Text size in pixels"
            value={textPx(value, v)}
            min={12}
            max={Math.max(13, Math.round(root * 0.15))}
            unit="px"
            onCommit={(n) =>
              onChange({ ...value, fontShare: Math.min(0.15, Math.max(0.01, n / root)) })
            }
          />
        </Field>
        <ColourField
          name="subtitle-colour-custom"
          label="Any text colour"
          value={value.color}
          disabled={disabled}
          presets={false}
          onChange={(color) => onChange({ ...value, color })}
        />
        <Field
          label="Height above the bottom"
          htmlFor="subtitle-position"
          trailing="of the picture"
          hint="Or drag the band on the picture. Cues marked for the top stay at the top."
        >
          <UnitField
            id="subtitle-position"
            label="Bottom of the text, in percent of the picture above its bottom edge"
            value={(1 - position) * 100}
            min={0}
            max={Math.round((1 - highestPosition(cueStyle(value, v), v.height)) * 100)}
            unit="%"
            onCommit={(n) => onChange({ ...value, position: 1 - n / 100 })}
          />
        </Field>
        <Field
          label="Box behind the text"
          htmlFor="subtitle-box"
          trailing="opaque"
          hint="0 for none. A box keeps text readable over snow, sky and busy scenes."
        >
          <UnitField
            id="subtitle-box"
            label="Box opacity in percent"
            value={(value.boxOpacity ?? lookBox(value.look)) * 100}
            min={0}
            max={100}
            unit="%"
            onCommit={(n) => onChange({ ...value, boxOpacity: n / 100 })}
          />
        </Field>
        <Field
          label="Line width"
          htmlFor="subtitle-width"
          trailing="of the picture's width"
          hint="Longer lines wrap at this width. Narrower keeps text clear of the sides."
        >
          <UnitField
            id="subtitle-width"
            label="Line width in percent of the width"
            value={(value.lineWidth ?? lookLineWidth(value.look, v)) * 100}
            min={30}
            max={100}
            unit="%"
            onCommit={(n) => onChange({ ...value, lineWidth: n / 100 })}
          />
        </Field>
      </MoreOptions>
    </>
  );
}

/** "en", "fr.forced", or the track's number, for the name of a track read out of the video. */
const trackStem = (t: SubtitleTrack) =>
  `${languageFromCode(t.language) ?? `track${t.index + 1}`}${t.forced ? ".forced" : ""}`;
const languageFromCode = (code?: string) =>
  code ? (languageByCode.get(code)?.code1 ?? code) : undefined;

/**
 * Text subtitle tracks already inside the video, offered for burning in: reading one gives the same
 * cues as a file would (subtitles-extract reads them without decoding anything).
 */
function VideoTracks({
  file,
  disabled,
  onPick,
}: {
  file: File;
  disabled?: boolean;
  onPick: (subtitle: NonNullable<O["subtitle"]>, language?: string) => void;
}) {
  const labelId = useId();
  const [tracks, setTracks] = useState<SubtitleTrack[]>([]);
  const [reading, setReading] = useState<number>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    let live = true;
    listSubtitleTracks(file)
      .then((l) => {
        if (live) setTracks(l.tracks.filter((t) => isText(t.kind)));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [file]);
  if (tracks.length === 0) return null;
  const use = async (t: SubtitleTrack) => {
    setReading(t.id);
    setError(undefined);
    try {
      const [x] = await extractTracks(file, [t.id], new AbortController().signal, () => undefined);
      if (!x || x.cues.length === 0) throw new Error("empty");
      const ext = t.kind === "ass" ? "ass" : t.kind === "vtt" ? "vtt" : "srt";
      onPick(
        { name: `${baseName(file.name)}.${trackStem(t)}.${ext}`, text: sourceText(x) },
        t.language ? (languageByCode.get(t.language)?.code ?? undefined) : undefined,
      );
    } catch {
      setError(`${trackTitle(t)} has no cues this page can read.`);
    } finally {
      setReading(undefined);
    }
  };
  return (
    <div className="-mt-3 flex flex-col gap-2">
      <p id={labelId} className="text-fg-muted text-xs">
        Or burn in a subtitle track this video already has:
      </p>
      <ul aria-labelledby={labelId} className="flex flex-wrap gap-2">
        {tracks.map((t) => (
          <li key={t.id}>
            <Button
              variant="secondary"
              size="sm"
              className="min-h-11"
              disabled={disabled || reading !== undefined}
              onClick={() => void use(t)}
            >
              {reading === t.id ? "Reading the track" : trackTitle(t)}
            </Button>
          </li>
        ))}
      </ul>
      {error && (
        <p className="text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
