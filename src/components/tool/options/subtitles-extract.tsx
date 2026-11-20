"use client";

import { useId } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import type { SubtitlesExtractOptions } from "@/tools/engines/subtitles-extract";
import {
  isText,
  kindLabel,
  type SubtitleKind,
  type SubtitleTrack,
  trackTitle,
} from "@/tools/engines/subtitles-extract/model";
import type { MediaInfo } from "@/tools/engines/types";
import { z } from "./remember-schema";
import type { OptionsPanelProps, OptionsSpec } from "./types";
import { unfixable } from "./types";

type O = SubtitlesExtractOptions;
type Target = O["format"];

/** The file's subtitle tracks as this page read them (see `inspect`). */
export function tracksOf(info: MediaInfo): SubtitleTrack[] {
  return (info.subtitles ?? []).flatMap((s, i) =>
    s.id === undefined
      ? []
      : [
          {
            id: s.id,
            index: s.index ?? i,
            kind: (s.kind ?? "other") as SubtitleKind,
            codec: s.codec,
            language: s.language,
            name: s.name,
            default: s.default,
            forced: s.forced,
          },
        ],
  );
}

const textTracks = (info: MediaInfo) => tracksOf(info).filter((t) => isText(t.kind));
const chosen = (o: O, info: MediaInfo) =>
  textTracks(info).filter((t) => !o.tracks || o.tracks.includes(t.id));

const titleOf = (t: SubtitleTrack) => trackTitle(t);

const targetName = (t: SubtitleTrack, target: Target) =>
  target === "srt"
    ? "SRT"
    : target === "vtt"
      ? "WebVTT"
      : t.kind === "ass"
        ? kindLabel(t)
        : t.kind === "vtt"
          ? "WebVTT"
          : "SRT";

/** How one track comes out: "English (SRT)", "French (ASS → SRT: styling dropped)". */
function outcome(t: SubtitleTrack, target: Target): string {
  const out = targetName(t, target);
  const from = kindLabel(t);
  if (t.kind === "ass" && out !== from)
    return `${titleOf(t)} (${from} → ${out}: styles and positions dropped)`;
  return `${titleOf(t)} (${out})`;
}

export const subtitlesExtractSpec: OptionsSpec<O> = {
  verb: "Extract subtitles",
  remember: { schema: z.object({ format: z.enum(["srt", "vtt", "original"]) }) },
  defaults: () => ({ format: "srt" }),
  /**
   * The media inspector does not list subtitle tracks, so this page reads them itself from the
   * container header (quick: no media is read) and asks the inspector for the rest.
   */
  inspect: async (file) => {
    const [{ listSubtitleTracks }, { EngineClient }] = await Promise.all([
      import("@/tools/engines/subtitles-extract/tracks"),
      import("@/tools/workers/client"),
    ]);
    const list = await listSubtitleTracks(file);
    const client = new EngineClient();
    let info: MediaInfo;
    try {
      info = await client.inspect(file);
    } catch (e) {
      // A file the inspector cannot open can still have its subtitles read.
      if (list.tracks.length === 0) throw e;
      info = {
        container: list.container === "matroska" ? "Matroska" : "MP4",
        durationSec: 0,
        sizeBytes: file.size,
      };
    } finally {
      client.dispose();
    }
    return {
      ...info,
      subtitles: list.tracks.map((t) => ({
        codec: t.codec,
        language: t.language,
        id: t.id,
        index: t.index,
        kind: t.kind,
        name: t.name,
        default: t.default,
        forced: t.forced,
      })),
    };
  },
  nextStep: { slug: "subtitle-converter", label: "Convert the subtitles to another format" },
  zipName: (_o, fileName) => `${fileName.replace(/\.[^.]+$/, "")}-subtitles.zip`,
  blocked: (o, info) => {
    const all = tracksOf(info);
    if (all.length === 0) {
      const c = info.container.toLowerCase();
      if (c.includes("transport") || c.includes("mpeg-ts"))
        return "Broadcast recordings (MPEG-TS) carry subtitles as pictures or teletext, which this tool cannot turn into text.";
      return unfixable(
        "This video has no subtitle track. Subtitles drawn into the picture are part of the video and cannot be taken out as text. Choose a video with a subtitle track.",
      );
    }
    if (textTracks(info).length === 0)
      return "The subtitle tracks in this file are pictures of text (PGS or VobSub), not text. Turning them into text needs character recognition, which this tool does not do.";
    if (chosen(o, info).length === 0) return "Choose at least one track.";
    return undefined;
  },
  summary: (o, info) => {
    const list = chosen(o, info);
    const n = list.length;
    return `${n === 1 ? "Writes one file" : `Writes ${n} files`}: ${list.map((t) => outcome(t, o.format)).join(", ")}. The text is copied out of the file; the video is not touched.`;
  },
  result: (_o, _info, out) => ({
    title: out.files === 1 ? "Subtitles extracted" : `${out.files} subtitle tracks extracted`,
    detail:
      "Each file is named after the video and its language, so a player that finds it beside the video loads it.",
    before: false,
  }),
  Panel: ExtractPanel,
};

function ExtractPanel({ value, onChange, info, media, disabled }: OptionsPanelProps<O>) {
  const formatId = useId();
  const tracksId = useId();
  const batch = (media.batch?.length ?? 0) > 1;
  const all = tracksOf(info);
  const text = all.filter((t) => isText(t.kind));
  const selected = new Set(value.tracks ?? text.map((t) => t.id));
  const toggle = (id: number, on: boolean) => {
    const next = text.map((t) => t.id).filter((x) => (x === id ? on : selected.has(x)));
    onChange({ ...value, tracks: next.length === text.length ? undefined : next });
  };
  return (
    <div className="flex flex-col gap-6">
      {batch ? (
        <p className="text-sm">
          Every text subtitle track of each file is written, named with its language.
        </p>
      ) : (
        all.length > 0 && (
          <Field
            label="Tracks"
            labelId={tracksId}
            hint="Picture tracks (PGS, VobSub) cannot become text here."
          >
            <ul aria-labelledby={tracksId} className="flex flex-col gap-3">
              {all.map((t) => {
                const readable = isText(t.kind);
                const facts = [kindLabel(t), t.default && "default", t.forced && "forced"]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <li key={t.id} className="flex min-h-11 items-center">
                    <Checkbox
                      label={titleOf(t)}
                      hint={readable ? facts : `${facts}: not text`}
                      checked={readable && selected.has(t.id)}
                      disabled={disabled || !readable}
                      onChange={(e) => toggle(t.id, e.target.checked)}
                    />
                  </li>
                );
              })}
            </ul>
          </Field>
        )
      )}
      <Field
        label="Save as"
        labelId={formatId}
        hint={
          value.format === "original"
            ? "ASS stays ASS with its styles; SRT and MP4 timed text become SRT; WebVTT stays WebVTT."
            : value.format === "vtt"
              ? "WebVTT is what web players and HTML5 video read."
              : "SRT opens in almost every player and editor. Italic, bold and underline are kept."
        }
      >
        <Segmented<Target>
          name="subtitle-format"
          aria-labelledby={formatId}
          value={value.format}
          onChange={(format) => onChange({ ...value, format })}
          options={[
            { value: "srt", label: "SRT" },
            { value: "vtt", label: "WebVTT" },
            { value: "original", label: "Original" },
          ]}
        />
      </Field>
    </div>
  );
}
