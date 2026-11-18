"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { TrimTimeline } from "@/components/tool/timeline/trim-timeline";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { NumberInput } from "@/components/ui/number-input";
import { formatTimecode } from "@/lib/format";
import type { TrimOptions } from "@/tools/engines/trim";
import { losslessStart, startMoved, startNote } from "@/tools/engines/trim/math";
import type { MediaInfo } from "@/tools/engines/types";
import { PLAY_SHORTCUT, useWorkspaceKeys } from "../shortcuts";
import type { OptionsPanelProps, OptionsSpec } from "./types";

/** Where the output really starts: the key frame at or before Start, unless the cut is frame-accurate. */
const actualStart = (o: TrimOptions, info: MediaInfo) =>
  o.precise || !info.video ? o.start : losslessStart(o.start, info.video.keyframes);

/** Length of the output, from where it really starts. */
const keptLength = (o: TrimOptions, info: MediaInfo) => Math.max(0, o.end - actualStart(o, info));

/** Clips this short are often wanted as a GIF next; longer ones are shared, so compressed. */
const GIF_LENGTH = 15;

export const trimSpec: OptionsSpec<TrimOptions> = {
  verb: "Trim",
  ownPlayback: true,
  defaults: (info) => ({ start: 0, end: info.durationSec, precise: false }),
  // Key frame times let the timeline mark them and the summary say where a lossless cut really starts.
  inspectKeyframes: true,
  previewResult: true,
  shortcuts: [
    { keys: "I", label: "Set the start at the playhead" },
    { keys: "O", label: "Set the end at the playhead" },
    PLAY_SHORTCUT,
    { keys: "← →", label: "Move a focused handle one frame" },
    { keys: "Shift ← →", label: "Move a focused handle one second" },
  ],
  // Start at or after End would write a single frame (or nothing): say so before anything runs.
  blocked: (o, info) => {
    const frame = 1 / (info.video?.fps || 30);
    if (o.end - o.start < frame)
      return "The end is at or before the start. Move the end later, or the start earlier, so there is something to keep.";
    return undefined;
  },
  summary: (o, info) => {
    if (o.precise)
      return "Frame-accurate: the cut lands on your frames, and the video is re-encoded.";
    if (!info.video) return "The sound is copied without re-encoding.";
    // Same snap as the engine (engines/trim/math): the cut starts on the key frame at or before Start.
    return `${startNote(o.start, actualStart(o, info))}. Streams copied, nothing re-encoded.`;
  },
  result: (o, info) => {
    const kept = keptLength(o, info);
    const start = actualStart(o, info);
    return {
      title: `Kept ${formatTimecode(kept)} of ${formatTimecode(info.durationSec)}`,
      detail: o.precise
        ? "Cut on the exact frames you chose; the video was re-encoded. The preview plays the result."
        : `${startNote(o.start, start)}. The streams were copied, not re-encoded. The preview plays the result.`,
      next:
        kept <= GIF_LENGTH && info.video
          ? { slug: "video-to-gif", label: "Make a GIF of this clip" }
          : { slug: "compress-video", label: "Compress the trimmed clip" },
    };
  },
  Below: TrimBelow,
  Panel({ value, onChange, info }) {
    const fps = info.video?.fps ?? 30;
    const frame = 1 / fps;
    const snap = (t: number) => Math.round(t / frame) * frame;
    return (
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Start"
            htmlFor="start"
            trailing="s"
            hint="Drag the handles, press I and O at the playhead, or type exact seconds."
          >
            <TimeInput
              id="start"
              value={value.start}
              onCommit={(t) =>
                onChange({ ...value, start: snap(Math.min(Math.max(0, t), value.end - frame)) })
              }
            />
          </Field>
          <Field label="End" htmlFor="end" trailing="s">
            <TimeInput
              id="end"
              value={value.end}
              onCommit={(t) =>
                onChange({
                  ...value,
                  end: snap(Math.max(Math.min(info.durationSec, t), value.start + frame)),
                })
              }
            />
          </Field>
        </div>
        <Checkbox
          label="Frame-accurate cut"
          hint="Re-encodes so the cut lands exactly on the frames you chose. Without it the start moves back to the key frame before it, and nothing is re-encoded."
          checked={value.precise}
          onChange={(e) => onChange({ ...value, precise: e.target.checked })}
        />
      </div>
    );
  },
} satisfies OptionsSpec<TrimOptions> & {
  Below: React.ComponentType<OptionsPanelProps<TrimOptions>>;
};

/**
 * The trim page's primary control: the kept length in large type, the timeline with key frame ticks
 * (lossless) and the real start marked, then Set start / Set end at the playhead (I / O) and a
 * button that plays the selection on repeat.
 */
function TrimBelow({ value, onChange, info, media, disabled }: OptionsPanelProps<TrimOptions>) {
  const root = useRef<HTMLDivElement>(null);
  const fps = info.video?.fps ?? 30;
  const frame = 1 / fps;
  const snap = (t: number) =>
    Math.min(info.durationSec, Math.max(0, Math.round(t / frame) * frame));
  const start = actualStart(value, info);
  const kept = keptLength(value, info);
  const moved = !value.precise && startMoved(value.start, start);
  const playing = usePlaying(media.video);

  const playhead = () => media.video.current?.currentTime ?? 0;
  const setStart = () => {
    const t = snap(playhead());
    onChange({
      ...value,
      start: Math.min(t, value.end - frame),
      // A start past the end takes the end along to the last frame, so I always does something.
      end: t >= value.end ? info.durationSec : value.end,
    });
  };
  const setEnd = () => {
    const t = snap(playhead());
    onChange({
      ...value,
      end: Math.max(t, value.start + frame),
      start: t <= value.start ? 0 : value.start,
    });
  };
  const playSelection = () => {
    const el = media.video.current;
    if (!el) return;
    if (!el.paused) {
      el.pause();
      return;
    }
    if (el.currentTime < start || el.currentTime >= value.end - frame / 2) el.currentTime = start;
    void el.play().catch(() => undefined);
  };
  useWorkspaceKeys(
    root,
    [
      { key: "i", run: setStart },
      { key: "o", run: setEnd },
    ],
    !disabled,
  );

  return (
    <div ref={root} className="flex flex-col gap-4">
      {/* Not a live region: it changes on every frame of a handle drag, and the handles announce
          their own times (aria-valuetext). */}
      <div>
        <p className="tabular text-h2">
          Kept {formatTimecode(kept)}{" "}
          <span className="text-fg-muted">of {formatTimecode(info.durationSec)}</span>
        </p>
        <p className="tabular mt-1 text-fg-muted text-sm">
          {formatTimecode(start)} to {formatTimecode(value.end)}
          {moved && `, from the key frame before ${formatTimecode(value.start)}`}
        </p>
      </div>
      <TrimTimeline
        disabled={disabled}
        file={media.file}
        video={media.video}
        duration={info.durationSec}
        fps={fps}
        value={{ start: value.start, end: value.end }}
        onChange={(r) => onChange({ ...value, start: r.start, end: r.end })}
        keyframes={value.precise ? undefined : info.video?.keyframes}
        actualStart={value.precise ? undefined : start}
        repeat
        showLength={false}
      />
      <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:gap-3">
        <Button
          variant="secondary"
          size="md"
          className="min-h-11"
          disabled={disabled}
          onClick={setStart}
          aria-keyshortcuts="I"
          title="Set the start at the playhead (I)"
        >
          Set start
        </Button>
        <Button
          variant="secondary"
          size="md"
          className="min-h-11"
          disabled={disabled}
          onClick={setEnd}
          aria-keyshortcuts="O"
          title="Set the end at the playhead (O)"
        >
          Set end
        </Button>
        <Button
          variant="ghost"
          size="md"
          className="min-h-11"
          disabled={disabled}
          onClick={playSelection}
          aria-label={playing ? "Pause" : "Play the selection"}
        >
          {playing ? (
            <Pause size={16} strokeWidth={1.5} aria-hidden />
          ) : (
            <Play size={16} strokeWidth={1.5} aria-hidden />
          )}
          {playing ? "Pause" : "Play"}
        </Button>
      </div>
      {!value.precise && (info.video?.keyframes?.length ?? 0) > 0 && (
        <p className="text-fg-muted text-xs">
          Ticks under the filmstrip are key frames: a lossless cut starts on one.
        </p>
      )}
    </div>
  );
}

/** Whether the preview is playing, from its own events. */
export function usePlaying(video: React.RefObject<HTMLMediaElement | null>) {
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    let raf = 0;
    let off: (() => void) | undefined;
    let tries = 0;
    // The preview element mounts one commit after its object URL exists; wait for it briefly.
    const attach = () => {
      const el = video.current;
      if (!el) {
        if (tries++ < 120) raf = requestAnimationFrame(attach);
        return;
      }
      const sync = () => setPlaying(!el.paused);
      el.addEventListener("play", sync);
      el.addEventListener("pause", sync);
      el.addEventListener("ended", sync);
      sync();
      off = () => {
        el.removeEventListener("play", sync);
        el.removeEventListener("pause", sync);
        el.removeEventListener("ended", sync);
      };
    };
    attach();
    return () => {
      cancelAnimationFrame(raf);
      off?.();
    };
  }, [video]);
  return playing;
}

/** Free typing while focused; the value is clamped and snapped when you leave the field or press Enter. Shared with other range panels (video-to-gif). */
export function TimeInput({
  id,
  value,
  onCommit,
}: {
  id: string;
  value: number;
  onCommit: (t: number) => void;
}) {
  const shown = (Math.round(value * 100) / 100).toString();
  const [text, setText] = useState(shown);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(shown);
  }, [shown, editing]);
  const commit = () => {
    setEditing(false);
    const n = Number(text);
    if (text.trim() !== "" && Number.isFinite(n)) onCommit(n);
    else setText(shown);
  };
  return (
    <NumberInput
      id={id}
      min={0}
      step={0.01}
      value={text}
      onFocus={() => setEditing(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}
