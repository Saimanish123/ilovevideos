"use client";

import type { Corner } from "@/tools/engines/capture/light";
import { listDevices, stopAll, thisOs } from "./media";
import type { useRecording } from "./use-recording";

/**
 * The screen recorder after the share dialog: opens the microphone and the camera for the bubble
 * if chosen, then starts recording. Loaded with the encoder, not with the page (ADR-0104); the
 * dialog itself is opened from the click in ./screen-capture.
 */
export async function afterShare(
  shared: MediaStream,
  o: {
    mic: boolean;
    micId?: string;
    micTrack?: MediaStreamTrack;
    bubble: boolean;
    camId?: string;
    corner: Corner;
    fps: number;
    maxLines?: number;
    sound: boolean;
    rec: ReturnType<typeof useRecording>;
    onStart: () => void;
    setMicTrack: (t: MediaStreamTrack | undefined) => void;
    setMicState: (s: PermissionState) => void;
    setMics: (d: MediaDeviceInfo[]) => void;
    setCams: (d: MediaDeviceInfo[]) => void;
    setDisplay: (s: MediaStream | undefined) => void;
    setCamera: (s: MediaStream | undefined) => void;
    setNotice: (n: string | undefined) => void;
    release: () => void;
  },
): Promise<void> {
  const [screen] = shared.getVideoTracks();
  if (!screen) {
    stopAll(shared);
    return;
  }
  const devices = await import("./devices");
  let micLive = o.micTrack?.readyState === "live" ? o.micTrack : undefined;
  if (o.mic && !micLive) {
    try {
      micLive = await devices.openMicrophone(o.micId);
      o.setMicTrack(micLive);
      o.setMicState("granted");
      o.setMics(await listDevices("audioinput"));
    } catch (e) {
      stopAll(shared);
      o.rec.fail(e);
      return;
    }
  }
  let cam: MediaStream | undefined;
  if (o.bubble) {
    try {
      cam = await devices.openCamera(o.camId, 720, false);
      o.setCams(await listDevices("videoinput"));
    } catch (e) {
      stopAll(shared);
      o.rec.fail(e, "turn the camera bubble off");
      return;
    }
  }
  o.setDisplay(shared);
  o.setCamera(cam);
  o.onStart();
  const camTrack = cam?.getVideoTracks()[0];
  const ok = await o.rec.start(
    {
      kind: "screen",
      video: screen,
      audio: [...(micLive ? [micLive] : []), ...shared.getAudioTracks()],
      bubble: camTrack ? { track: camTrack, corner: o.corner } : undefined,
      fps: o.fps,
      maxLines: o.maxLines,
      mic: !!micLive,
      os: thisOs(),
    },
    screen,
  );
  if (!ok) o.release();
  else if (o.sound && shared.getAudioTracks().length === 0)
    o.setNotice("No sound from the shared surface · microphone only");
}
