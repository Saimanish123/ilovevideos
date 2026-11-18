"use client";

import { Monitor } from "lucide-react";
import { Suspense, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { bubbleRect, type Corner } from "@/tools/engines/capture/light";
import type { CaptureProps } from "../options/types";
import { useFormatWords } from "./format-probe";
import { DiscardButton, LevelMeter, LiveLine, RecordingControls } from "./lazy-live";
import { preloadScreen, ScreenBlocked, ScreenPreview } from "./lazy-screen";
import {
  AccessError,
  canShareScreen,
  listDevices,
  permissionOf,
  shareScreen,
  stopAll,
} from "./media";
import { ActionBar, CaptureError, CaptureLayout, DeviceSelect, MoreOptions } from "./parts";
import { preloadRecorder, useRecording } from "./use-recording";

type Size = "full" | "1080" | "720";

/**
 * Screen recorder (idle.Capture, ADR-0099). Before: what goes into the recording (microphone, the
 * shared tab's or screen's sound, a camera bubble), with a live level once the microphone is
 * allowed. Start opens the browser's own share dialog. While recording: the shared picture, the
 * real time and size, pause, resume and stop; Stop sharing in the browser's bar finishes too.
 * Phones and tablets cannot share their screen with a page: the page says so and points on.
 */
export function ScreenCapture({ onStart, onCaptured }: CaptureProps) {
  const rec = useRecording(onCaptured);
  const [supported, setSupported] = useState(true);
  useEffect(() => setSupported(canShareScreen()), []);

  // "off" for no microphone; "" for the default one; else a device id. The same for the camera.
  const [micSel, setMicSel] = useState("");
  const mic = micSel !== "off";
  const micId = mic && micSel ? micSel : undefined;
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [micTrack, setMicTrack] = useState<MediaStreamTrack>();
  const [micState, setMicState] = useState<PermissionState>("prompt");
  const [sound, setSound] = useState(true);
  const [camSel, setCamSel] = useState("off");
  const bubble = camSel !== "off";
  const camId = bubble && camSel ? camSel : undefined;
  const [corner, setCorner] = useState<Corner>("bottom-right");
  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);
  const [fps, setFps] = useState<"30" | "60">("30");
  const [size, setSize] = useState<Size>("full");
  const [display, setDisplay] = useState<MediaStream>();
  const [camera, setCamera] = useState<MediaStream>();
  const [choosing, setChoosing] = useState(false);
  const [notice, setNotice] = useState<string>();
  const ids = useId();
  const micRef = useRef<MediaStreamTrack | undefined>(undefined);
  micRef.current = micTrack;

  // A microphone already allowed is listed by name; it is not opened (and the browser's recording
  // light stays off) until recording starts.
  useEffect(() => {
    if (!supported || !mic) return;
    void permissionOf("microphone").then(async (s) => {
      setMicState(s);
      if (s === "granted") setMics(await listDevices("audioinput"));
    });
    void permissionOf("camera").then(async (s) => {
      if (s === "granted") setCams(await listDevices("videoinput"));
    });
  }, [supported, mic]);
  useEffect(() => {
    if (mic) return;
    stopAll(micRef.current ? [micRef.current] : []);
    setMicTrack(undefined);
  }, [mic]);
  useEffect(
    () => () => {
      stopAll(micRef.current ? [micRef.current] : []);
    },
    [],
  );

  const displayRef = useRef<MediaStream | undefined>(undefined);
  const cameraRef = useRef<MediaStream | undefined>(undefined);
  displayRef.current = display;
  cameraRef.current = camera;
  useEffect(
    () => () => {
      stopAll(displayRef.current);
      stopAll(cameraRef.current);
    },
    [],
  );

  const release = () => {
    stopAll(displayRef.current);
    stopAll(cameraRef.current);
    setDisplay(undefined);
    setCamera(undefined);
  };

  const pressed = useRef(false);
  const start = async () => {
    // A double press opens one share dialog.
    if (pressed.current) return;
    pressed.current = true;
    try {
      await startOnce();
    } finally {
      pressed.current = false;
    }
  };
  const startOnce = async () => {
    rec.setError(undefined);
    setNotice(undefined);
    setChoosing(true);
    let shared: MediaStream;
    try {
      // First, straight from the click: browsers only open the share dialog from a gesture.
      shared = await shareScreen(sound, Number(fps));
    } catch (e) {
      setChoosing(false);
      if (e instanceof AccessError && e.failure === "dismissed") {
        setNotice("Nothing was shared · Start recording opens the dialog again");
        return;
      }
      rec.fail(e);
      return;
    }
    setChoosing(false);
    // The rest needs no gesture: it loads with the encoder (ADR-0104).
    await (await import("./screen-start")).afterShare(shared, {
      mic,
      micId,
      micTrack: micRef.current,
      bubble,
      camId,
      corner,
      fps: Number(fps),
      maxLines: size === "full" ? undefined : Number(size),
      sound,
      rec,
      onStart,
      setMicTrack,
      setMicState,
      setMics,
      setCams,
      setDisplay,
      setCamera,
      setNotice,
      release,
    });
  };

  const stop = async () => {
    await rec.stop();
  };
  // After a discard, focus returns to Start recording rather than falling to the page.
  const refocus = useRef(false);
  const discard = async () => {
    refocus.current = true;
    await rec.discard();
    release();
  };
  useEffect(() => {
    if (rec.phase !== "idle" || !refocus.current) return;
    refocus.current = false;
    document.querySelector<HTMLElement>("[data-start-recording]")?.focus();
  }, [rec.phase]);
  const words = useFormatWords(mic || sound);
  const [phone, setPhone] = useState(false);
  useEffect(() => setPhone(matchMedia("(pointer: coarse)").matches), []);

  const recording = rec.phase !== "idle";
  if (!supported)
    return (
      <CaptureLayout
        stage={phone ? undefined : <Placeholder />}
        panel={
          <Suspense fallback={null}>
            <ScreenBlocked phone={phone} />
          </Suspense>
        }
      />
    );

  return (
    <CaptureLayout
      stage={
        recording && display ? (
          <Suspense fallback={<Placeholder />}>
            <ScreenPreview display={display} camera={camera} corner={corner} />
          </Suspense>
        ) : (
          <Placeholder corner={bubble ? corner : undefined} />
        )
      }
      panel={
        recording ? (
          <Suspense fallback={null}>
            {micRef.current && <LevelMeter track={micRef.current} />}
            {(notice || rec.note) && <p className="text-fg-muted text-sm">{rec.note ?? notice}</p>}
            <DiscardButton
              seconds={rec.stats.seconds}
              disabled={rec.phase === "starting" || rec.phase === "finishing"}
              onDiscard={() => void discard()}
            />
            <RecordingControls
              phase={rec.phase}
              onPause={rec.pause}
              onResume={rec.resume}
              onStop={() => void stop()}
            >
              <LiveLine phase={rec.phase} stats={rec.stats} />
            </RecordingControls>
          </Suspense>
        ) : (
          <>
            <fieldset disabled={choosing} className="flex flex-col gap-6 disabled:opacity-60">
              <DeviceSelect
                label="Microphone"
                devices={mics}
                value={micSel}
                onChange={setMicSel}
                none="No microphone"
                fallback="Microphone"
                hint={
                  mic && micState !== "granted"
                    ? "The browser asks for the microphone when you start."
                    : undefined
                }
              />
              <Checkbox
                label="Record the shared sound"
                hint="The sound of a tab, a window or the screen, where the browser's dialog offers it."
                checked={sound}
                onChange={(e) => setSound(e.target.checked)}
              />
              <DeviceSelect
                label="Camera bubble"
                devices={cams}
                value={camSel}
                onChange={setCamSel}
                none="No camera bubble"
                fallback="Camera"
                hint={bubble ? undefined : "Your camera in a circle in a corner of the recording."}
              />
              {bubble && (
                <Field label="Corner" labelId={`${ids}-corner`}>
                  <Segmented
                    name="corner"
                    aria-labelledby={`${ids}-corner`}
                    value={corner}
                    onChange={setCorner}
                    columns={2}
                    options={[
                      { value: "top-left", label: "Top left" },
                      { value: "top-right", label: "Top right" },
                      { value: "bottom-left", label: "Bottom left" },
                      { value: "bottom-right", label: "Bottom right" },
                    ]}
                  />
                </Field>
              )}
              <MoreOptions>
                <Field
                  label="Frame rate"
                  labelId={`${ids}-fps`}
                  hint="60 fps for scrolling, games and animation; 30 fps for everything else."
                >
                  <Segmented
                    name="fps"
                    aria-labelledby={`${ids}-fps`}
                    value={fps}
                    onChange={setFps}
                    options={[
                      { value: "30", label: "30 fps" },
                      { value: "60", label: "60 fps" },
                    ]}
                  />
                </Field>
                <Field
                  label="Size"
                  labelId={`${ids}-size`}
                  hint="Full keeps text sharp. A smaller size makes a smaller file."
                >
                  <Segmented
                    name="size"
                    aria-labelledby={`${ids}-size`}
                    value={size}
                    onChange={setSize}
                    options={[
                      { value: "full", label: "Full" },
                      { value: "1080", label: "1080p" },
                      { value: "720", label: "720p" },
                    ]}
                  />
                </Field>
              </MoreOptions>
            </fieldset>
            <ActionBar>
              {rec.error ? (
                <CaptureError message={rec.error.message} hint={rec.error.hint} />
              ) : (
                <p className="text-fg-muted text-sm" role="status" aria-live="polite">
                  {choosing
                    ? "Choose a tab, window or screen in the browser's dialog."
                    : (notice ??
                      (words === null
                        ? "This browser cannot encode video here"
                        : `${words ?? "MP4 · H.264, AAC"} · on this device`))}
                </p>
              )}
              <Button
                variant="primary"
                size="lg"
                className="w-full"
                onClick={() => void start()}
                disabled={choosing}
                data-action="run"
                data-start-recording=""
                onPointerEnter={() => {
                  preloadRecorder();
                  preloadScreen();
                }}
                onFocus={() => {
                  preloadRecorder();
                  preloadScreen();
                }}
              >
                Start recording
              </Button>
            </ActionBar>
          </>
        )
      }
    />
  );
}

/** The dark stage before anything is shared; marks where the camera bubble will sit. */
function Placeholder({ corner }: { corner?: Corner }) {
  const r = corner ? bubbleRect(1600, 900, corner) : undefined;
  return (
    <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg bg-bg-stage text-gray-400">
      <Monitor size={24} strokeWidth={1.5} aria-hidden />
      {r && (
        <span
          aria-hidden
          className="absolute aspect-square rounded-full border border-gray-400"
          style={{
            left: `${(r.x / 1600) * 100}%`,
            top: `${(r.y / 900) * 100}%`,
            width: `${(r.size / 1600) * 100}%`,
          }}
        />
      )}
    </div>
  );
}
