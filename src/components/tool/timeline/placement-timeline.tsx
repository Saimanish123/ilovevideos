"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWaveform } from "@/components/tool/audio/use-waveform";
import { Waveform } from "@/components/tool/audio/waveform";
import { formatTimecode } from "@/lib/format";
import {
  type Balance,
  balanceGains,
  gainAt,
  placement,
  sourceTime,
} from "@/tools/engines/add-audio/math";
import type { MediaInfo } from "@/tools/engines/types";
import { VideoPreview } from "../video-preview";
import { startDrag, TimelineTrack, useTimeAt } from "./timeline-track";

export interface PlacementValue {
  mode: "replace" | "mix";
  offset: number;
  skip: number;
  loop: boolean;
  fadeOut: number;
  volume: number;
  balance: Balance;
}

const snap = (t: number) => Math.round(t * 100) / 100;

/**
 * Where the new audio goes on the video: the video's filmstrip on top, the audio clip (its
 * waveform) in a lane below, drawn to scale. Drag the clip, or use the arrow keys on it (0.1 s,
 * Shift 1 s), to move it: right starts it later in the video, left past the start skips into the
 * audio. Loops repeat the clip to the end; the fade-out is the dimmed wedge at the cut. The preview
 * above plays the video with the new audio in place, at the chosen balance, so the placement can be
 * heard before anything is written. Pointer tracking is 1:1, no animation (design system §6.3).
 * Without `audio` (the video is in, the audio is still being read or not added yet) it draws the
 * same frame with an empty lane, so the audio fills it in place and nothing below moves.
 */
export function PlacementTimeline({
  video,
  audio,
  value,
  onChange,
  disabled = false,
}: {
  video: { file: File; info: MediaInfo };
  audio?: { file: File; info: MediaInfo };
  value: PlacementValue;
  onChange: (next: { offset: number; skip: number }) => void;
  disabled?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const laneRef = useRef<HTMLDivElement>(null);
  const videoDuration = video.info.durationSec;
  const audioDuration = audio?.info.durationSec ?? 0;
  const place = useMemo(
    () => placement(videoDuration, audioDuration, value),
    [videoDuration, audioDuration, value],
  );
  const hasOriginal = (video.info.audio?.length ?? 0) > 0;
  const mixing = value.mode === "mix" && hasOriginal;
  const gains = mixing ? balanceGains[value.balance] : { added: value.volume, original: 0 };
  const wave = useWaveform(audio?.file, 200);
  const [audioUrl, setAudioUrl] = useState<string>();
  useEffect(() => {
    if (!audio) return;
    const u = URL.createObjectURL(audio.file);
    setAudioUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [audio]);

  const timeAt = useTimeAt(trackRef, videoDuration, snap);
  const laneTimeAt = useTimeAt(laneRef, videoDuration, snap);

  // Preview: the video's own sound is muted (replace) or turned down (mix), and the new audio
  // follows the video's clock, including its fade.
  useEffect(() => {
    const v = videoRef.current;
    const a = audioRef.current;
    if (!v || !a) return;
    v.muted = !mixing;
    v.volume = Math.min(1, gains.original || 1);
    let raf = 0;
    const sync = () => {
      const t = v.currentTime;
      const st = sourceTime(t, place, value.skip);
      if (st === undefined || v.paused) {
        if (!a.paused) a.pause();
      } else {
        a.volume = Math.min(1, Math.max(0, gainAt(t, place, gains.added, value.skip)));
        if (a.paused || Math.abs(a.currentTime - st) > 0.2) a.currentTime = st;
        if (a.paused) void a.play().catch(() => undefined);
      }
      if (!v.paused) raf = requestAnimationFrame(sync);
    };
    const onPlay = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(sync);
    };
    const onStop = () => {
      cancelAnimationFrame(raf);
      a.pause();
    };
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onStop);
    v.addEventListener("seeked", sync);
    if (!v.paused) onPlay();
    return () => {
      cancelAnimationFrame(raf);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onStop);
      v.removeEventListener("seeked", sync);
    };
  }, [place, value.skip, mixing, gains.added, gains.original]);

  const position = value.offset - value.skip;
  const minPos = -Math.max(0, audioDuration - 0.1);
  const maxPos = Math.max(0, videoDuration - 0.1);
  const setPosition = useCallback(
    (p: number) => {
      const c = snap(Math.min(maxPos, Math.max(minPos, p)));
      onChange({ offset: Math.max(0, c), skip: Math.max(0, -c) });
    },
    [minPos, maxPos, onChange],
  );

  const pct = (t: number) => (videoDuration > 0 ? (t / videoDuration) * 100 : 0);
  const length = place.end - place.start;
  // The visible waveform: the audio after the skip, one copy per pass, drawn to the video's scale.
  const passPeaks = useMemo(() => {
    const peaks = wave.peaks;
    if (!peaks || !(audioDuration > 0)) return undefined;
    const from = Math.floor((value.skip / audioDuration) * peaks.length);
    return peaks.subarray(Math.min(from, peaks.length - 1));
  }, [wave.peaks, value.skip, audioDuration]);
  const passes = Math.max(1, Math.ceil(place.passes - 1e-6));
  const passWidth = length > 0 ? (place.passLength / length) * 100 : 100;

  return (
    <div className="flex select-none flex-col gap-3">
      <VideoPreview file={video.file} info={video.info} videoRef={videoRef} />
      {audioUrl && (
        // biome-ignore lint/a11y/useMediaCaption: follows the preview above; the user's own audio
        <audio ref={audioRef} src={audioUrl} preload="auto" className="hidden" />
      )}
      <div className="tabular flex flex-wrap justify-between gap-x-3 text-fg-muted text-xs">
        {audio ? (
          <span>
            Audio <span className="text-fg">{formatTimecode(place.start)}</span> to{" "}
            <span className="text-fg">{formatTimecode(place.end)}</span>
            {value.skip > 0 && <> · starts {formatTimecode(value.skip)} into the file</>}
          </span>
        ) : (
          <span>No audio yet</span>
        )}
        <span>
          {!audio
            ? `Video ${formatTimecode(videoDuration)}`
            : value.loop && place.passes > 1
              ? `Plays ${Math.round(place.passes * 10) / 10} times`
              : place.cut
                ? place.fade > 0
                  ? `Cut at the video's end, fades out over ${Math.round(place.fade * 10) / 10} s`
                  : "Cut at the video's end"
                : `Video ${formatTimecode(videoDuration)}`}
        </span>
      </div>
      <TimelineTrack
        file={video.file}
        video={videoRef}
        duration={videoDuration}
        disabled={disabled}
        trackRef={trackRef}
        timeAt={timeAt}
      />
      {/* Without audio the lane is an empty place for it: a light well, not a heavy dark bar. */}
      <div
        ref={laneRef}
        className={
          audio
            ? "relative h-12 rounded-md bg-bg-stage"
            : "relative h-12 rounded-md border border-border bg-bg-subtle"
        }
      >
        {length > 0 && (
          <div
            role="slider"
            tabIndex={disabled ? -1 : 0}
            aria-label="Audio position"
            aria-disabled={disabled || undefined}
            aria-valuemin={Math.round(minPos * 100) / 100}
            aria-valuemax={Math.round(maxPos * 100) / 100}
            aria-valuenow={Math.round(position * 100) / 100}
            aria-valuetext={
              value.skip > 0
                ? `Starts with the video, ${formatTimecode(value.skip)} into the audio`
                : `Starts at ${formatTimecode(value.offset)} in the video`
            }
            // The hit area is at least 44 px wide, centred on the drawn clip, so a short sting on a
            // long video can still be grabbed. The ring is drawn on the clip itself (peer).
            className="peer absolute inset-y-0 z-10 -translate-x-1/2 cursor-grab touch-none outline-none active:cursor-grabbing"
            style={{
              left: `${pct(place.start + length / 2)}%`,
              width: `max(2.75rem, ${pct(length)}%)`,
            }}
            onPointerDown={(e) => {
              if (disabled) return;
              const origin = laneTimeAt(e.clientX);
              const start = position;
              startDrag(e, (x) => setPosition(start + (laneTimeAt(x) - origin)));
            }}
            onKeyDown={(e) => {
              if (disabled) return;
              const step = e.shiftKey ? 1 : 0.1;
              let next: number | undefined;
              if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = position - step;
              else if (e.key === "ArrowRight" || e.key === "ArrowUp") next = position + step;
              else if (e.key === "Home") next = 0;
              if (next === undefined) return;
              e.preventDefault();
              setPosition(next);
            }}
          />
        )}
        {length > 0 && (
          <div
            className="pointer-events-none absolute inset-y-0 overflow-hidden rounded-sm border border-gray-400 bg-gray-800 peer-focus-visible:stage-focus"
            style={{ left: `${pct(place.start)}%`, width: `${pct(length)}%` }}
            aria-hidden
          >
            <div className="absolute inset-0 flex">
              {Array.from({ length: passes }, (_, i) => (
                <div
                  key={`pass-${i.toString()}`}
                  className="h-full shrink-0 border-gray-500 border-r px-px"
                  style={{ width: `${passWidth}%` }}
                >
                  <Waveform peaks={passPeaks} bright={1} />
                </div>
              ))}
            </div>
            {place.fade > 0 && (
              <div
                className="pointer-events-none absolute inset-y-0 right-0 bg-overlay"
                style={{
                  width: `${(place.fade / length) * 100}%`,
                  clipPath: "polygon(0 0, 100% 0, 100% 100%)",
                }}
                aria-hidden
              />
            )}
          </div>
        )}
      </div>
      <p className="text-fg-muted text-xs">
        {audio
          ? "Drag the audio clip to move it. Past the start, it skips into the audio instead."
          : "The audio file appears in this lane once it is added and read."}
      </p>
    </div>
  );
}
