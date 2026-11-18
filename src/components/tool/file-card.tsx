"use client";

import { Button } from "@/components/ui/button";
import { formatBytes, formatDimensions, formatDuration } from "@/lib/format";
import { codecName } from "@/tools/engines/convert-video/plan";
import type { MediaInfo } from "@/tools/engines/types";

/** Filename with middle truncation so the extension stays visible (design system §8.5). */
export function FileName({ name }: { name: string }) {
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot) : "";
  const base = dot > 0 ? name.slice(0, dot) : name;
  return (
    <span className="flex min-w-0 font-medium">
      <span className="truncate">{base}</span>
      <span className="shrink-0">{ext}</span>
    </span>
  );
}

export function FileCard({
  file,
  info,
  onRemove,
  unreadable = false,
}: {
  file: File;
  info?: MediaInfo;
  onRemove?: () => void;
  /** The file could not be read (error state): say so instead of "Reading the file". */
  unreadable?: boolean;
}) {
  const v = info?.video;
  const a = info?.audio?.[0];
  const audioName = a && (a.codec.startsWith("pcm") ? "PCM" : codecName(a.codec));
  // A subtitle file read on the page: its format and cue count, not "no audio".
  const cues = !v && !a ? info?.subtitles?.[0]?.cues : undefined;
  const meta =
    cues !== undefined && info
      ? [
          formatBytes(file.size),
          info.container,
          `${cues.toLocaleString("en")} ${cues === 1 ? "cue" : "cues"}`,
          formatDuration(info.durationSec),
        ]
      : [
          formatBytes(file.size),
          v && formatDimensions(v.width, v.height),
          info && formatDuration(info.durationSec),
          codecName(v?.codec),
          audioName &&
            `${audioName}${a.channels === 1 ? " mono" : a.channels === 2 ? " stereo" : ""}`,
          info && !a && "no audio",
        ].filter(Boolean);
  return (
    <div className="flex items-center gap-4 rounded-md bg-bg-subtle px-4 py-3 text-sm">
      <div className="min-w-0 flex-1">
        <FileName name={file.name} />
        {/* Wraps rather than truncates so the codec and audio facts survive at 375px. */}
        <p className="tabular mt-0.5 text-fg-muted text-xs">
          {info ? meta.join(" · ") : unreadable ? "Could not read" : "Reading the file"}
        </p>
      </div>
      {onRemove && (
        <Button
          variant="quiet"
          size="sm"
          className="min-h-11"
          onClick={onRemove}
          // Two cards can sit on one stage (a video and its subtitle file): say which one goes.
          aria-label={`Remove ${file.name}`}
        >
          Remove
        </Button>
      )}
    </div>
  );
}
