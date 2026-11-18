"use client";

import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Slider } from "@/components/ui/slider";
import { formatDuration } from "@/lib/format";
import type { MediaInfo } from "@/tools/engines/types";
import type { PreviewTrack } from "./options/types";
import { usePreviewGestures } from "./preview-gestures";
import { togglePlayback, usePlayerKeys } from "./shortcuts";

/**
 * Preview on the dark stage with the minimal controls of design system §8.3 under it: play or pause,
 * the time in tabular figures, a seek slider and mute. Native controls are off (their toolbar differs
 * per browser and added a run of tab stops before a page's own timeline). Space plays and pauses it
 * from anywhere in the workspace (components/tool/shortcuts). A page with an overlay (crop) has its
 * own scrubber and shows no bar. Nothing here animates: play, pause and seeking are 1:1 (§6.3).
 */
export function VideoPreview({
  file,
  info,
  videoRef,
  videoStyle,
  overlay,
  track,
  bar = true,
}: {
  file: File;
  info?: MediaInfo;
  videoRef?: RefObject<HTMLVideoElement | null>;
  /** Live result preview (rotate/flip). Transform moves at dur-base on the in-out curve; reduced motion snaps. */
  videoStyle?: CSSProperties;
  /**
   * Layer over the picture (a crop frame). It sits outside the clipped box so 44px handles on the
   * picture's edge keep their full hit area; native controls are hidden while it is shown.
   */
  overlay?: ReactNode;
  /** Subtitle cues drawn by the browser over the picture (spec.previewTrack). */
  track?: PreviewTrack;
  /** False when the page has its own play control (spec.ownPlayback). */
  bar?: boolean;
}) {
  const [url, setUrl] = useState<string>();
  const own = useRef<HTMLVideoElement | null>(null);
  const attach = useCallback(
    (el: HTMLVideoElement | null) => {
      own.current = el;
      if (videoRef) videoRef.current = el;
    },
    [videoRef],
  );
  const box = useRef<HTMLDivElement>(null);
  usePlayerKeys(own, { box, fps: info?.video?.fps });
  const gestures = usePreviewGestures(own, box);
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  const [trackUrl, setTrackUrl] = useState<string>();
  const vtt = track?.vtt;
  useEffect(() => {
    if (!vtt) {
      setTrackUrl(undefined);
      return;
    }
    const u = URL.createObjectURL(new Blob([vtt], { type: "text/vtt" }));
    setTrackUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [vtt]);
  const v = info?.video;
  const ratio = v && v.width > 0 && v.height > 0 ? `${v.width} / ${v.height}` : "16 / 9";
  const picture = url && (
    // biome-ignore lint/a11y/useMediaCaption: user-supplied preview; a subtitle page passes its cues as `track`
    <video
      ref={attach}
      src={url}
      playsInline
      data-cue-style={track ? "outline" : undefined}
      // Without native controls Chrome paints no first frame on "metadata"; the file is local, so "auto" costs no network.
      preload="auto"
      className="h-full w-full transition-transform duration-(--duration-base) ease-(--ease-in-out) motion-reduce:transition-none"
      style={videoStyle}
    >
      {track && trackUrl && (
        <track
          key={trackUrl}
          kind="subtitles"
          src={trackUrl}
          srcLang={track.language}
          label={track.label}
          default
        />
      )}
    </video>
  );
  if (overlay) {
    return (
      <div ref={box} className="relative w-full" style={{ aspectRatio: ratio, maxHeight: "60vh" }}>
        <div className="h-full w-full overflow-hidden rounded-lg bg-bg-stage">{picture}</div>
        {overlay}
      </div>
    );
  }
  return (
    <div className="flex w-full flex-col gap-2">
      {/* Tap or click the picture to play or pause; double-tap a side to seek (preview-gestures). */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: a pointer shortcut only; the bar's buttons and the player keys do the same from the keyboard, so the picture is not a tab stop */}
      <div
        ref={box}
        className="relative w-full overflow-hidden rounded-lg bg-bg-stage"
        style={{ aspectRatio: ratio, maxHeight: "60vh" }}
        onPointerDown={gestures.onPointerDown}
        onPointerUp={gestures.onPointerUp}
        onDoubleClick={gestures.onDoubleClick}
      >
        {picture}
        {gestures.overlay}
      </div>
      {bar && <PlaybackBar video={own} src={url} />}
    </div>
  );
}

const iconButton =
  "flex size-11 shrink-0 items-center justify-center rounded-md text-fg hover:bg-bg-subtle focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:opacity-50";

/**
 * Play or pause, time, seek and mute for the preview. It is rendered with the picture from the first
 * frame (disabled until the length is known), so its line never arrives late and moves the page.
 */
function PlaybackBar({
  video,
  src,
}: {
  video: RefObject<HTMLVideoElement | null>;
  src: string | undefined;
}) {
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);

  // Re-attached when the source changes: the <video> mounts with its first URL.
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    let raf = 0;
    let last = 0;
    // Ten updates a second while playing: the time reads in seconds and the slider's thumb moves by
    // layout (Base UI positions it with left), so every frame would be 60 renders and as many tiny
    // layout shifts for no visible gain.
    const tick = (now: number) => {
      if (now - last >= 100) {
        last = now;
        setTime(v.currentTime);
      }
      if (!v.paused) raf = requestAnimationFrame(tick);
    };
    const sync = () => {
      setPlaying(!v.paused);
      setDuration(Number.isFinite(v.duration) ? v.duration : 0);
      setMuted(v.muted);
      setTime(v.currentTime);
    };
    const onPlay = () => {
      sync();
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };
    const events = ["loadedmetadata", "durationchange", "pause", "ended", "seeked", "volumechange"];
    for (const e of events) v.addEventListener(e, sync);
    v.addEventListener("play", onPlay);
    sync();
    return () => {
      cancelAnimationFrame(raf);
      for (const e of events) v.removeEventListener(e, sync);
      v.removeEventListener("play", onPlay);
    };
  }, [src]);

  const ready = duration > 0;
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className={iconButton}
        disabled={!ready}
        aria-label={playing ? "Pause" : "Play"}
        onClick={() => togglePlayback(video.current)}
      >
        {playing ? (
          <Pause size={20} strokeWidth={1.5} aria-hidden />
        ) : (
          <Play size={20} strokeWidth={1.5} aria-hidden />
        )}
      </button>
      <p className="tabular shrink-0 whitespace-nowrap text-fg-muted text-sm">
        {formatDuration(time)} / {formatDuration(duration)}
      </p>
      {/* Arrows seek 5 s (Shift 1 s) like the player keys, Home and End jump to the ends; the
          slider's own step stays fine for dragging. */}
      <div
        className="flex min-w-0 flex-1"
        onKeyDownCapture={(e) => {
          const v = video.current;
          if (!v || !ready || e.altKey || e.metaKey || e.ctrlKey) return;
          const step = e.shiftKey ? 1 : 5;
          const to =
            e.key === "ArrowRight" || e.key === "ArrowUp"
              ? v.currentTime + step
              : e.key === "ArrowLeft" || e.key === "ArrowDown"
                ? v.currentTime - step
                : e.key === "Home"
                  ? 0
                  : e.key === "End"
                    ? duration
                    : undefined;
          if (to === undefined) return;
          e.preventDefault();
          e.stopPropagation();
          v.currentTime = Math.min(duration, Math.max(0, to));
          setTime(v.currentTime);
        }}
      >
        <Slider
          className="min-w-0 flex-1 px-2"
          value={ready ? Math.min(time, duration) : 0}
          min={0}
          max={ready ? duration : 1}
          step={0.01}
          disabled={!ready}
          aria-label="Position in the video"
          getAriaValueText={(_, t) => `${formatDuration(t)} of ${formatDuration(duration)}`}
          onValueChange={(t) => {
            const v = video.current;
            if (!v) return;
            v.currentTime = t;
            setTime(t);
          }}
        />
      </div>
      <button
        type="button"
        className={iconButton}
        disabled={!ready}
        aria-label="Mute"
        aria-pressed={muted}
        onClick={() => {
          const v = video.current;
          if (v) v.muted = !v.muted;
        }}
      >
        {muted ? (
          <VolumeX size={20} strokeWidth={1.5} aria-hidden />
        ) : (
          <Volume2 size={20} strokeWidth={1.5} aria-hidden />
        )}
      </button>
    </div>
  );
}
