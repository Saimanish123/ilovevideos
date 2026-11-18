"use client";

import { Camera } from "lucide-react";
import { Suspense, useCallback, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { formatDimensions } from "@/lib/format";
import type { CaptureProps } from "../options/types";
import { useFormatWords } from "./format-probe";
import { DiscardButton, LevelMeter, LiveLine, RecordingControls } from "./lazy-live";
import { canUseDevices, listDevices, stopAll, thisOs } from "./media";
import { ActionBar, CaptureError, CaptureLayout, DeviceSelect, MoreOptions } from "./parts";
import { preloadRecorder, useRecording } from "./use-recording";

type Lines = "720" | "1080";

/**
 * Webcam recorder (idle.Capture, ADR-0099). The camera turns on only when asked; then the preview
 * shows what will be recorded, mirrored like a mirror (the file is not, unless chosen), with the
 * camera's real size and frame rate. An optional 3-2-1 count gives a moment to settle before the
 * recording starts. Pause, resume and stop as on the other recorders.
 */
export function WebcamCapture({ onStart, onCaptured }: CaptureProps) {
  const rec = useRecording(onCaptured);
  const ids = useId();
  const [supported, setSupported] = useState(true);
  useEffect(() => setSupported(canUseDevices()), []);
  const [stream, setStream] = useState<MediaStream>();
  const [opening, setOpening] = useState(false);
  // "off" for no microphone; "" for the default one; else a device id.
  const [micSel, setMicSel] = useState("");
  const mic = micSel !== "off";
  const [lines, setLines] = useState<Lines>("1080");
  const [countdown, setCountdown] = useState(true);
  const [mirrorPreview, setMirrorPreview] = useState(true);
  const [mirrorFile, setMirrorFile] = useState(false);
  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [camId, setCamId] = useState<string>();

  const [count, setCount] = useState<number>();
  const video = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | undefined>(undefined);
  streamRef.current = stream;

  const open = useCallback(
    async (o: { camId?: string; micId?: string; lines: Lines; mic: boolean }) => {
      setOpening(true);
      rec.setError(undefined);
      // One camera at a time: some cannot be opened twice.
      stopAll(streamRef.current);
      try {
        const s = await (await import("./devices")).openCamera(
          o.camId,
          Number(o.lines),
          o.mic,
          o.micId,
        );
        setStream(s);
        const [v] = s.getVideoTracks();
        const [a] = s.getAudioTracks();
        setCamId(v?.getSettings().deviceId);
        if (a) setMicSel(a.getSettings().deviceId ?? "");
        const [c, m] = await Promise.all([listDevices("videoinput"), listDevices("audioinput")]);
        setCams(c);
        setMics(m);
      } catch (e) {
        setStream(undefined);
        rec.fail(e);
      } finally {
        setOpening(false);
      }
    },
    [rec.setError, rec.fail],
  );

  useEffect(() => {
    if (video.current) video.current.srcObject = stream ?? null;
  }, [stream]);
  useEffect(
    () => () => {
      stopAll(streamRef.current);
    },
    [],
  );

  const camTrack = stream?.getVideoTracks()[0];
  const micTrack = stream?.getAudioTracks()[0];
  const settings = camTrack?.getSettings();

  const begin = async () => {
    if (!camTrack) return;
    onStart();
    await rec.start(
      {
        kind: "webcam",
        video: camTrack,
        audio: micTrack ? [micTrack] : [],
        mirror: mirrorFile,
        fps: Math.min(30, Math.round(settings?.frameRate ?? 30)) || 30,
        mic: !!micTrack,
        os: thisOs(),
      },
      camTrack,
    );
  };

  // 3, 2, 1: one step a second, then the recording starts; Cancel clears the count.
  useEffect(() => {
    if (count === undefined) return;
    const t = setTimeout(() => {
      if (count > 1) setCount(count - 1);
      else {
        setCount(undefined);
        void begin();
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [count]);
  const startRecording = () => (countdown ? setCount(3) : void begin());
  const cancelCount = () => setCount(undefined);

  const recording = rec.phase !== "idle";
  const ratio = settings?.width && settings.height ? settings.width / settings.height : 16 / 9;
  const micId = mic && micSel ? micSel : undefined;
  const reopen = (patch: Partial<{ camId: string; micId: string; lines: Lines; mic: boolean }>) => {
    if (!stream) return;
    void open({ camId, micId, lines, mic, ...patch });
  };
  // After a discard, focus returns to Start recording rather than falling to the page.
  const refocus = useRef(false);
  useEffect(() => {
    if (rec.phase !== "idle" || !refocus.current) return;
    refocus.current = false;
    document.querySelector<HTMLElement>("[data-start-recording]")?.focus();
  }, [rec.phase]);
  const words = useFormatWords(mic);

  if (!supported)
    return (
      <CaptureLayout
        stage={<Placeholder />}
        panel={
          <p className="text-body">
            This browser cannot use a camera here. Use a current Chrome, Edge, Firefox or Safari.
          </p>
        }
      />
    );

  return (
    <CaptureLayout
      stage={
        stream ? (
          <div
            className="relative mx-auto overflow-hidden rounded-lg bg-bg-stage"
            // Width from the preview cap and the camera's shape, so a capped preview keeps its shape.
            style={{
              aspectRatio: ratio,
              width: `min(100%, calc(var(--stage-preview-max-h) * ${ratio}))`,
            }}
          >
            <video
              ref={video}
              autoPlay
              muted
              playsInline
              aria-label="Camera preview"
              className="h-full w-full object-contain"
              style={mirrorPreview ? { transform: "scaleX(-1)" } : undefined}
            />
            {count !== undefined && (
              <span
                aria-hidden
                className="tabular absolute inset-0 flex items-center justify-center text-display text-gray-0"
              >
                {count}
              </span>
            )}
          </div>
        ) : (
          <Placeholder />
        )
      }
      panel={
        recording ? (
          <Suspense fallback={null}>
            {micTrack && <LevelMeter track={micTrack} />}
            {rec.note && <p className="text-fg-muted text-sm">{rec.note}</p>}
            <DiscardButton
              seconds={rec.stats.seconds}
              disabled={rec.phase === "starting" || rec.phase === "finishing"}
              onDiscard={() => {
                refocus.current = true;
                void rec.discard();
              }}
            />
            <RecordingControls
              phase={rec.phase}
              onPause={rec.pause}
              onResume={rec.resume}
              onStop={() => void rec.stop()}
            >
              <LiveLine phase={rec.phase} stats={rec.stats} />
            </RecordingControls>
          </Suspense>
        ) : (
          <>
            <fieldset
              disabled={opening || count !== undefined}
              className="flex flex-col gap-6 disabled:opacity-60"
            >
              {stream && cams.length > 1 && (
                <DeviceSelect
                  label="Camera"
                  devices={cams}
                  value={camId}
                  onChange={(id) => {
                    setCamId(id);
                    reopen({ camId: id });
                  }}
                />
              )}
              <DeviceSelect
                label="Microphone"
                devices={mics}
                value={micSel}
                onChange={(id) => {
                  setMicSel(id);
                  reopen({ mic: id !== "off", micId: id === "off" || !id ? undefined : id });
                }}
                none="No microphone"
                fallback="Microphone"
              />
              {micTrack && (
                <Suspense fallback={null}>
                  <LevelMeter track={micTrack} />
                </Suspense>
              )}
              <Field
                label="Resolution"
                labelId={`${ids}-res`}
                hint="The camera gives its nearest size when it cannot do this one."
              >
                <Segmented
                  name="lines"
                  aria-labelledby={`${ids}-res`}
                  value={lines}
                  onChange={(v) => {
                    setLines(v);
                    reopen({ lines: v });
                  }}
                  options={[
                    { value: "720", label: "720p" },
                    { value: "1080", label: "1080p" },
                  ]}
                />
              </Field>
              <Checkbox
                label="Count down 3, 2, 1"
                hint="A moment to settle before recording starts."
                checked={countdown}
                onChange={(e) => setCountdown(e.target.checked)}
              />
              <MoreOptions>
                <Checkbox
                  label="Mirror the preview"
                  hint="Like a mirror, which most people find easier to frame in."
                  checked={mirrorPreview}
                  onChange={(e) => setMirrorPreview(e.target.checked)}
                />
                <Checkbox
                  label="Mirror the recording"
                  hint="Off keeps text and faces the right way round, as others see you."
                  checked={mirrorFile}
                  onChange={(e) => setMirrorFile(e.target.checked)}
                />
              </MoreOptions>
            </fieldset>
            <ActionBar>
              {rec.error ? (
                <CaptureError message={rec.error.message} hint={rec.error.hint} />
              ) : (
                <p className="tabular text-fg-muted text-sm" role="status" aria-live="polite">
                  {count !== undefined
                    ? `Recording starts in ${count}`
                    : opening
                      ? "Turning on the camera"
                      : words === null
                        ? "This browser cannot encode video here"
                        : settings?.width && settings.height
                          ? `${formatDimensions(settings.width, settings.height)} · ${Math.round(settings.frameRate ?? 30)} fps · ${(words ?? "MP4").split(" · ")[0]} · on this device`
                          : `${words ?? "MP4 · H.264, AAC"} · on this device`}
                </p>
              )}
              {count !== undefined ? (
                <Button
                  variant="secondary"
                  size="lg"
                  className="w-full"
                  onClick={cancelCount}
                  data-action="cancel"
                >
                  Cancel
                </Button>
              ) : stream ? (
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full"
                  onClick={startRecording}
                  disabled={opening}
                  data-action="run"
                  data-start-recording=""
                  onPointerEnter={preloadRecorder}
                  onFocus={preloadRecorder}
                >
                  Start recording
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full"
                  onClick={() => {
                    preloadRecorder();
                    void open({ camId, micId, lines, mic });
                  }}
                  disabled={opening}
                  data-action="run"
                >
                  Turn on camera
                </Button>
              )}
            </ActionBar>
          </>
        )
      }
    />
  );
}

function Placeholder() {
  return (
    <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-bg-stage text-gray-400">
      <Camera size={24} strokeWidth={1.5} aria-hidden />
    </div>
  );
}
