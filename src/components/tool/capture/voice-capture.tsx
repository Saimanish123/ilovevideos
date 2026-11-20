"use client";

import { Mic } from "lucide-react";
import { Suspense, useCallback, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { VoiceFormat } from "@/tools/engines/capture/light";
import { Choices } from "../options/choices";
import type { CaptureProps } from "../options/types";
import { DiscardButton, LevelMeter, LiveLine, RecordingControls } from "./lazy-live";
import { LiveWave } from "./lazy-wave";
import { canUseDevices, listDevices, type SoundProcessing, stopAll, thisOs } from "./media";
import { ActionBar, CaptureError, CaptureLayout, DeviceSelect, MoreOptions } from "./parts";
import { preloadRecorder, useRecording } from "./use-recording";

const formatLine: Record<VoiceFormat, string> = {
  m4a: "M4A · AAC 128 kb/s",
  wav: "WAV · 16-bit PCM",
  opus: "Opus · 64 kb/s",
};

const VOICE: SoundProcessing = {
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
};

/**
 * Voice recorder (idle.Capture, ADR-0099). One press records: the browser asks for the microphone
 * then. "Check the level" opens it first, for a level meter without recording. While recording the
 * sound draws itself on the stage, with the real time and size; pause, resume and stop. The format
 * is chosen before (the file is encoded as it is recorded).
 */
export function VoiceCapture({ onStart, onCaptured }: CaptureProps) {
  const rec = useRecording(onCaptured);
  const ids = useId();
  const [supported, setSupported] = useState(true);
  useEffect(() => setSupported(canUseDevices()), []);
  const [format, setFormat] = useState<VoiceFormat>("m4a");
  const [processing, setProcessing] = useState<SoundProcessing>(VOICE);
  const [track, setTrack] = useState<MediaStreamTrack>();
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [micId, setMicId] = useState<string>();
  const [opening, setOpening] = useState(false);
  const trackRef = useRef<MediaStreamTrack | undefined>(undefined);
  trackRef.current = track;
  useEffect(
    () => () => {
      stopAll(trackRef.current ? [trackRef.current] : []);
    },
    [],
  );

  const open = useCallback(
    async (id: string | undefined, p: SoundProcessing) => {
      setOpening(true);
      rec.setError(undefined);
      stopAll(trackRef.current ? [trackRef.current] : []);
      try {
        const t = await (await import("./devices")).openMicrophone(id, p);
        setTrack(t);
        setMicId(t.getSettings().deviceId);
        setMics(await listDevices("audioinput"));
        return t;
      } catch (e) {
        setTrack(undefined);
        rec.fail(e);
        return undefined;
      } finally {
        setOpening(false);
      }
    },
    [rec.setError, rec.fail],
  );

  const pressed = useRef(false);
  const record = async () => {
    // A double press opens one microphone and starts one recording.
    if (pressed.current) return;
    pressed.current = true;
    try {
      await recordOnce();
    } finally {
      pressed.current = false;
    }
  };
  const recordOnce = async () => {
    const t =
      trackRef.current?.readyState === "live" ? trackRef.current : await open(micId, processing);
    if (!t) return;
    onStart();
    await rec.start(
      { kind: "voice", audio: [t], voiceFormat: format, fps: 0, mic: true, os: thisOs() },
      t,
    );
  };

  const recording = rec.phase !== "idle";
  // After a discard, focus returns to Start recording rather than falling to the page.
  const refocus = useRef(false);
  useEffect(() => {
    if (rec.phase !== "idle" || !refocus.current) return;
    refocus.current = false;
    document.querySelector<HTMLElement>("[data-start-recording]")?.focus();
  }, [rec.phase]);
  const setP = (patch: Partial<SoundProcessing>) => {
    const next = { ...processing, ...patch };
    setProcessing(next);
    if (track) void open(micId, next);
  };

  if (!supported)
    return (
      <CaptureLayout
        stage={<Placeholder />}
        panel={
          <p className="text-body">
            This browser cannot use a microphone here. Use a current Chrome, Edge, Firefox or
            Safari.
          </p>
        }
      />
    );

  return (
    <CaptureLayout
      stage={
        <div className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg bg-bg-stage px-4 text-gray-400">
          {recording && track ? (
            <Suspense fallback={null}>
              <LiveWave track={track} running={rec.phase === "recording"} />
            </Suspense>
          ) : (
            <Mic size={24} strokeWidth={1.5} aria-hidden />
          )}
        </div>
      }
      panel={
        recording ? (
          <Suspense fallback={null}>
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
            <fieldset disabled={opening} className="flex flex-col gap-6 disabled:opacity-60">
              <div>
                <span id={`${ids}-format`} className="font-medium text-sm">
                  Format
                </span>
                <div className="mt-2">
                  <Choices
                    name="format"
                    aria-labelledby={`${ids}-format`}
                    value={format}
                    onChange={setFormat}
                    options={[
                      {
                        value: "m4a",
                        label: "M4A",
                        detail: "AAC, plays everywhere",
                        tag: "≈ 1 MB per min",
                      },
                      {
                        value: "wav",
                        label: "WAV",
                        detail: "Uncompressed, for editing",
                        tag: "≈ 5.8 MB per min",
                      },
                      {
                        value: "opus",
                        label: "Opus",
                        detail: "Smallest, for speech",
                        tag: "≈ 0.5 MB per min",
                      },
                    ]}
                  />
                </div>
              </div>
              {track ? (
                <div className="flex flex-col gap-4">
                  <Suspense fallback={null}>
                    <LevelMeter track={track} />
                  </Suspense>
                  {mics.length > 1 && (
                    <DeviceSelect
                      label="Microphone"
                      devices={mics}
                      value={micId}
                      onChange={(id) => {
                        setMicId(id);
                        void open(id, processing);
                      }}
                    />
                  )}
                </div>
              ) : (
                <Button
                  variant="secondary"
                  size="md"
                  className="self-start"
                  onClick={() => void open(micId, processing)}
                >
                  Check the level
                </Button>
              )}
              <MoreOptions>
                <Checkbox
                  label="Noise suppression"
                  hint="Quietens steady noise such as fans. On suits speech; off for music."
                  checked={processing.noiseSuppression}
                  onChange={(e) => setP({ noiseSuppression: e.target.checked })}
                />
                <Checkbox
                  label="Echo cancellation"
                  hint="Removes your speakers' sound from the microphone. Needed only when they play."
                  checked={processing.echoCancellation}
                  onChange={(e) => setP({ echoCancellation: e.target.checked })}
                />
                <Checkbox
                  label="Automatic level"
                  hint="Raises a quiet voice and lowers a loud one. Off keeps dynamics as played."
                  checked={processing.autoGainControl}
                  onChange={(e) => setP({ autoGainControl: e.target.checked })}
                />
              </MoreOptions>
            </fieldset>
            <ActionBar>
              {rec.error ? (
                <CaptureError message={rec.error.message} hint={rec.error.hint} />
              ) : (
                <p className="text-fg-muted text-sm" role="status" aria-live="polite">
                  {opening ? "Turning on the microphone" : `${formatLine[format]}`}
                </p>
              )}
              <Button
                variant="primary"
                size="lg"
                className="w-full"
                onClick={() => void record()}
                disabled={opening}
                data-action="run"
                data-start-recording=""
                onPointerEnter={preloadRecorder}
                onFocus={preloadRecorder}
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

function Placeholder() {
  return (
    <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-bg-stage text-gray-400">
      <Mic size={24} strokeWidth={1.5} aria-hidden />
    </div>
  );
}
