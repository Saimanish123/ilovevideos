"use client";

import { useId } from "react";
import { CoverHero, type CoverOptions } from "@/components/tool/metadata/cover-frame";
import { CoverPicker } from "@/components/tool/metadata/cover-picker";
import {
  DateCard,
  type DateOptions,
  DatePanel,
  describeChange,
} from "@/components/tool/metadata/date-panel";
import { shownValues, TagCard } from "@/components/tool/metadata/tag-card";
import { useEditable } from "@/components/tool/metadata/use-editable";
import { MoreOptions } from "@/components/tool/regions/more-options";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatDimensions } from "@/lib/format";
import {
  describeEdit,
  fieldLabels,
  fieldMax,
  holdsCover,
  type TagField,
  type TagFormat,
  validDate,
} from "@/tools/engines/edit-metadata/fields";
import { snapToFrame } from "@/tools/engines/frame-extract/math";
import type { MediaInfo } from "@/tools/engines/types";
import type { Blocked, OptionsPanelProps, OptionsSpec } from "./types";
import { unfixable } from "./types";

/** One spec, two pages: tags (edit-video-metadata) and the recording date (`task: "date"`). */
type O = DateOptions & CoverOptions;

/** The tag system from the media inspector's container name; undefined when this tool cannot write it. */
export function tagFormatOf(info: MediaInfo): TagFormat | undefined {
  const c = info.container.toLowerCase();
  if (c === "mp4") return "mp4";
  if (c.includes("quicktime")) return "mov";
  if (c === "mp3") return "mp3";
  if (c === "flac") return "flac";
  return undefined;
}

/** Why this file cannot be edited, with the converter that makes it editable. */
function notEditable(info: MediaInfo): Blocked {
  const c = info.container.toLowerCase();
  const also = "MP4, MOV, M4A, MP3 and FLAC files can.";
  if (c.includes("webm"))
    return {
      reason: `WebM tags cannot be edited here yet. ${also}`,
      action: { slug: "webm-to-mp4", label: "Convert WebM to MP4" },
    };
  if (c.includes("matroska"))
    return {
      reason: `MKV tags cannot be edited here yet. ${also}`,
      action: { slug: "mkv-to-mp4", label: "Convert MKV to MP4" },
    };
  if (c.includes("wav"))
    return {
      reason: `WAV files have no widely read place for tags. ${also}`,
      action: { slug: "wav-to-flac", label: "Convert WAV to FLAC, losslessly" },
    };
  return {
    reason: `${info.container} tags cannot be edited here. ${also}`,
    action: info.video
      ? { slug: "video-converter", label: "Convert to MP4" }
      : { slug: "audio-converter", label: "Convert to M4A or MP3" },
  };
}

const changed = (o: O) =>
  Object.values(o.set).some((v) => v !== undefined) || o.cover !== undefined;

const DATE_FORMATS = "Only MP4 and MOV files carry a recording date this tool can change.";

export const editMetadataSpec: OptionsSpec<O> = {
  verb: "Save tags",
  defaults: (info, preset) =>
    preset.task === "cover"
      ? {
          set: {},
          task: "cover",
          coverInQuickTime: true,
          // A tenth of the way in: past a fade from black, still near the start.
          time: snapToFrame(info.durationSec * 0.1, info.video?.fps ?? 30, info.durationSec),
        }
      : preset.task === "date"
        ? { set: {}, task: "date", dates: { mode: "set", local: "", offsetMin: 0 } }
        : { set: {} },
  // The output is new tag bytes around slices of the source File: on the page nothing is copied.
  route: () => "page",
  Hero: (props) =>
    (props.preset?.task ?? props.value?.task) === "cover" ? (
      <CoverHero {...props} />
    ) : (props.preset?.task ?? props.value?.task) === "date" ? (
      <DateCard {...props} />
    ) : (
      <TagCard {...props} />
    ),
  previewResult: true,
  // A stream copy: identical picture and sound (ADR-0134).
  compare: false,
  nextStep: { slug: "video-info", label: "Check every field of the new copy" },
  blocked: (o, info) => {
    if (o.task === "cover") {
      const f = tagFormatOf(info);
      if (f !== "mp4" && f !== "mov")
        return {
          reason:
            "Only MP4 and MOV files have a place for a thumbnail that file browsers read. Convert this file to MP4 first.",
          action: { slug: "video-converter", label: "Convert to MP4" },
          fixable: false,
        };
      if (!info.video)
        return unfixable("This file has no picture to take a thumbnail from. Choose a video file.");
      if (!o.cover) return "Reading the frame on the preview";
      return undefined;
    }
    if (o.task === "date") {
      const f = tagFormatOf(info);
      if (f !== "mp4" && f !== "mov")
        return {
          reason: `${DATE_FORMATS} Convert this file to MP4 first.`,
          action: { slug: "video-converter", label: "Convert to MP4" },
        };
      const c = o.dates;
      if (!c || (c.mode === "set" && !c.local)) return "Reading the date the file carries";
      if (c.mode === "shift" && c.seconds === 0) return "Choose how far to move the date.";
      if (c.mode === "set" && `${c.local}/${c.offsetMin}` === o.from)
        return "Pick the new date and time.";
      return undefined;
    }
    if (!tagFormatOf(info)) return notEditable(info);
    if (o.set.date !== undefined && !validDate(o.set.date.trim()))
      return "Write the date as a year (2024) or a full date (2024-06-01).";
    if (!changed(o)) return "Change a field or the cover to write a new copy.";
    return undefined;
  },
  summary: (o) =>
    o.task === "cover"
      ? `Thumbnail${o.cover ? ` ${formatDimensions(o.cover.width, o.cover.height)} JPEG` : ""} · picture and sound unchanged`
      : o.task === "date"
        ? `${describeChange(o.dates)} · picture and sound unchanged`
        : `${describeEdit(o)}. Only the tag block is rewritten: the video and sound are the original bytes, nothing is re-encoded.`,
  result: (o) =>
    o.task === "cover"
      ? {
          title: "Thumbnail set",
          detail:
            "macOS Finder and Quick Look show it; apps that ignore embedded covers keep the first frame.",
          before: false,
        }
      : o.task === "date"
        ? {
            title: "Date changed",
            detail:
              "The downloaded file's own date is when you save it; apps that sort by filming date read the date inside.",
            before: false,
          }
        : {
            title: "Tags saved",
            detail: `${describeEdit(o)}. The card is read back from the new copy; the video and sound are the original bytes.`,
            change: false,
          },
  Panel: (props) =>
    props.value.task === "cover" ? null : props.value.task === "date" ? (
      <DatePanel {...props} />
    ) : (
      <EditMetadataPanel {...props} />
    ),
};

const FIELDS_SHOWN: TagField[] = ["title", "artist", "album", "date"];
const FIELDS_MORE: TagField[] = ["genre", "comment"];

const hints: Partial<Record<TagField, string>> = {
  title: "What players, file browsers and video sites show instead of the file name.",
  artist: "The creator, author or channel.",
  date: "A year (2024) or a full date (2024-06-01). The recording time stays as it is.",
};

function EditMetadataPanel({ value, onChange, info, media, disabled }: OptionsPanelProps<O>) {
  const batch = (media.batch?.length ?? 0) > 1;
  const read = useEditable(batch ? undefined : media.file);
  const current = read.status === "done" ? read.tags.values : {};
  const format = tagFormatOf(info);
  const shown = shownValues(current, value.set);
  const coverId = useId();

  const setField = (f: TagField, text: string) => {
    const set = { ...value.set };
    // A value equal to the file's own is no change. In a batch every typed value is written and an
    // empty field keeps each file's own.
    if (batch ? text.trim() === "" : text.trim() === (current[f] ?? "").trim()) delete set[f];
    else set[f] = text;
    onChange({ ...value, set });
  };

  const field = (f: TagField) => {
    const id = `tag-${f}`;
    const text = batch ? (value.set[f] ?? "") : (shown[f] ?? "");
    const bad = f === "date" && text.trim() !== "" && !validDate(text.trim());
    const common = {
      id,
      value: text,
      disabled,
      maxLength: fieldMax[f],
      placeholder: batch ? "Each file keeps its own" : f === "date" ? "YYYY-MM-DD" : undefined,
      "aria-invalid": bad || undefined,
    };
    return (
      <Field key={f} label={fieldLabels[f]} htmlFor={id} hint={hints[f]}>
        {f === "comment" ? (
          <textarea
            {...common}
            rows={3}
            onChange={(e) => setField(f, e.target.value)}
            className="w-full rounded-md border border-border bg-bg-raised px-3 py-2 text-fg text-sm pointer-coarse:text-body placeholder:text-fg-muted transition-colors duration-(--duration-instant) hover:border-border-strong focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:opacity-50"
          />
        ) : (
          <Input
            {...common}
            inputMode={f === "date" ? "numeric" : undefined}
            autoComplete="off"
            onChange={(e) => setField(f, e.target.value)}
          />
        )}
      </Field>
    );
  };

  if (!format) return null;
  return (
    <div className="flex flex-col gap-6">
      {batch && (
        <p className="text-sm">
          What you type goes into every file. Fields left empty keep each file's own value.
        </p>
      )}
      {FIELDS_SHOWN.map(field)}
      {holdsCover(format) && (
        <Field label="Cover art" labelId={coverId}>
          <CoverPicker
            value={value.cover}
            hasCover={!batch && read.status === "done" && read.tags.cover !== undefined}
            disabled={disabled}
            onChange={(cover) => onChange({ ...value, cover })}
          />
        </Field>
      )}
      <MoreOptions label="More fields">{FIELDS_MORE.map(field)}</MoreOptions>
    </div>
  );
}

/** The change-video-thumbnail page: the same spec, one file at a time (the frame is chosen per file). */
export const coverSpec: OptionsSpec<O> = {
  ...editMetadataSpec,
  verb: "Set thumbnail",
  batch: false,
};
