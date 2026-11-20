"use client";

import { Pause, Play, SquareSplitHorizontal, Volume2, VolumeX, ZoomIn } from "lucide-react";
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
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/format";
import { useMediaQuery } from "@/lib/use-media-query";
import type { MediaInfo } from "@/tools/engines/types";
import { ABSwitch } from "./compare/ab-switch";
import { useCompareFor } from "./compare/context";
import type { PreviewTrack } from "./options/types";
import { usePreviewGestures } from "./preview-gestures";
import { togglePlayback, usePlayerKeys } from "./shortcuts";

/**
 * Preview on the dark stage with the minimal controls of design system §8.3 under it: play or pause,
 * the time in tabular figures, a seek slider and mute. Native controls are off (their toolbar differs
 * per browser and added a run of tab stops before a page's own timeline). Space plays and pauses it
 * from anywhere in the workspace (components/tool/shortcuts). A page with an overlay (crop) has its
 * own scrubber and shows no bar. Nothing here animates: play, pause and seeking are 1:1 (§6.3).
 *
 * Playing a result the stage set up to compare (compare/context), the bar gets Compare: the source
 * appears over the picture behind a divider, or beside it (compare/picture-compare), with a zoom to
 * actual pixels on a mouse; a sound result gets a Before/After switch under the bar instead.
 */
export function VideoPreview({
  file,
  info,
  videoRef,
  videoStyle,
  overlay,
  track,
  bar = true,
  jobRuns = true,
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
  /**
   * False when the job cannot run either (the stage shows why): the line for a file this browser
   * cannot play then says only that there is no preview.
   */
  jobRuns?: boolean;
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
  const compare = useCompareFor(file);
  const wipeable = compare?.spec.what === "picture" ? compare : undefined;
  const [comparing, setComparing] = useState(false);
  // Mounted from opening until its close fade ends (PictureCompare `onClosed`).
  const [layerMounted, setLayerMounted] = useState(false);
  const [layer, setLayer] = useState<CompareModule>();
  const compareButton = useRef<HTMLButtonElement>(null);
  const playButton = useRef<HTMLButtonElement>(null);
  const [zoom, setZoom] = useState(false);
  const [zoomable, setZoomable] = useState(false);
  const [compareFailed, setCompareFailed] = useState(false);
  // Zoom to actual pixels is for a mouse on a screen wide enough to keep the seek bar usable.
  const finePointer = useMediaQuery("(pointer: fine) and (min-width: 40rem)");
  const toggleCompare = () => {
    if (comparing) {
      setComparing(false);
      setZoom(false);
      return;
    }
    setComparing(true);
    setLayerMounted(true);
    // Loaded on the first press: the done state carries none of it until then.
    if (!layer) void loadCompare().then((m) => setLayer(() => m));
  };
  const onCompareFail = useCallback(() => {
    // The Compare button goes: focus it held moves to Play rather than falling to the page.
    if (document.activeElement === compareButton.current) playButton.current?.focus();
    setComparing(false);
    setLayerMounted(false);
    setZoom(false);
    setCompareFailed(true);
  }, []);
  const onCompareClosed = useCallback(() => setLayerMounted(false), []);
  const soundSwitch =
    compare?.spec.what === "sound" ? (
      <ABSwitch media={own} compare={compare} tone="page" />
    ) : undefined;
  // A source the browser's player cannot open (MKV in Safari, AVI and WMV everywhere) fires `error`
  // at once (measured 2026-11-19); it gets one quiet line instead of a black frame and a dead bar.
  const [unplayable, setUnplayable] = useState(false);
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    setUnplayable(false);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  // A picture the browser cannot decode (HEVC in Chrome without platform support) plays no better:
  // Chrome fires no `error` there and shows a black frame with a working bar.
  // `info` is the source's, also when a result plays here: it speaks for this file only when it is
  // that file.
  const noPicture =
    unplayable || (info?.video?.decodable === false && info.sizeBytes === file.size);
  const noPreview = jobRuns
    ? "No preview in this browser. The file can still be processed."
    : "No preview in this browser.";
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
      onError={() => setUnplayable(true)}
      className={cn(
        "h-full w-full transition-transform duration-(--duration-base) ease-(--ease-in-out) motion-reduce:transition-none",
        noPicture && "invisible",
      )}
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
        {noPicture && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center text-gray-300 text-sm">
            {noPreview}
          </p>
        )}
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
        onPointerDown={noPicture ? undefined : gestures.onPointerDown}
        onPointerUp={noPicture ? undefined : gestures.onPointerUp}
        onDoubleClick={noPicture ? undefined : gestures.onDoubleClick}
      >
        {/* No picture: the same box, so nothing moves, with one quiet line in it (the overlay
            branch above does the same). */}
        {picture}
        {noPicture && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center text-gray-300 text-sm">
            {noPreview}
          </p>
        )}
        {gestures.overlay}
        {layerMounted && layer && compare && (
          <layer.PictureCompare
            master={own}
            box={box}
            compare={compare}
            open={comparing}
            zoom={zoom}
            onZoomable={setZoomable}
            onFail={onCompareFail}
            onClosed={onCompareClosed}
          />
        )}
      </div>
      {bar && (
        // No picture: the bar keeps its height but is not seen or reachable (nothing to play).
        <div className={noPicture ? "invisible" : "contents"} aria-hidden={noPicture || undefined}>
          <PlaybackBar
            video={own}
            src={url}
            playRef={playButton}
            extra={
              wipeable && !compareFailed ? (
                <>
                  {comparing && finePointer && zoomable && (
                    <button
                      type="button"
                      className={iconButton}
                      aria-label="Actual pixels"
                      aria-pressed={zoom}
                      onClick={() => setZoom((z) => !z)}
                    >
                      <ZoomIn size={20} strokeWidth={1.5} aria-hidden />
                    </button>
                  )}
                  <button
                    ref={compareButton}
                    type="button"
                    className={cn(iconButton, "sm:w-auto sm:gap-2 sm:px-3")}
                    aria-label="Compare with the original"
                    aria-pressed={comparing}
                    data-action="compare"
                    onClick={toggleCompare}
                  >
                    <SquareSplitHorizontal size={20} strokeWidth={1.5} aria-hidden />
                    <span aria-hidden className="hidden text-sm sm:inline">
                      Compare
                    </span>
                  </button>
                </>
              ) : undefined
            }
            trailing={soundSwitch}
          />
        </div>
      )}
      {soundSwitch && !bar && <div className="mb-2 flex justify-end">{soundSwitch}</div>}
      {/* Always present when a compare is offered, so its one line is announced when it appears;
          empty, it takes back the column's gap. */}
      {wipeable && (
        <p aria-live="polite" className="text-fg-muted text-sm empty:-mt-2">
          {compareFailed ? "The original does not play in this browser." : ""}
        </p>
      )}
    </div>
  );
}

const loadCompare = () => import("./compare/picture-compare");
type CompareModule = Awaited<ReturnType<typeof loadCompare>>;

// A pressed toggle (Mute, Compare, Actual pixels) keeps the hover fill: one step, so on or off reads
// without a second icon.
const iconButton =
  "flex size-11 shrink-0 items-center justify-center rounded-md text-fg hover:bg-bg-subtle aria-pressed:bg-bg-subtle aria-pressed:text-fg focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:opacity-50";

/**
 * Play or pause, time, seek and mute for the preview. It is rendered with the picture from the first
 * frame (disabled until the length is known), so its line never arrives late and moves the page.
 */
function PlaybackBar({
  video,
  src,
  extra,
  trailing,
  playRef,
}: {
  video: RefObject<HTMLVideoElement | null>;
  src: string | undefined;
  /** The Play button, for moving focus to it (a Compare button that goes away). */
  playRef?: RefObject<HTMLButtonElement | null>;
  /** Buttons before Mute (Compare and its zoom on a result). */
  extra?: ReactNode;
  /**
   * After Mute: the sound switch. One element in one place, placed by CSS: its own right-aligned row
   * under the bar below 640 px (the bar's gap above, more below), in the bar row from 640 px. A
   * phone turned to landscape crosses 640 px mid-play; nothing remounts, so the side heard stays.
   */
  trailing?: ReactNode;
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
    <div className="flex flex-wrap items-center gap-2">
      <button
        ref={playRef}
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
      {extra}
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
      {trailing && (
        <div className="mb-2 flex basis-full justify-end sm:mb-0 sm:basis-auto">{trailing}</div>
      )}
    </div>
  );
}
