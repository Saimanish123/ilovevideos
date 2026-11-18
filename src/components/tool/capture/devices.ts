"use client";

/**
 * Opening a microphone or a camera, after a press (no gesture is needed for these, so they load on
 * demand with the encoder rather than with the page, ADR-0104). The screen is shared from ./media,
 * straight from the click. No network access.
 */
import { AccessError, type SoundProcessing, toAccessError } from "./media";

export async function openMicrophone(
  deviceId?: string,
  processing?: SoundProcessing,
): Promise<MediaStreamTrack> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        ...(processing ?? {}),
        channelCount: { ideal: 1 },
      },
    });
    const [track] = stream.getAudioTracks();
    if (!track) throw new DOMException("No track", "NotFoundError");
    return track;
  } catch (e) {
    throw toAccessError(e, "microphone");
  }
}

export async function openCamera(
  deviceId: string | undefined,
  lines: number,
  withMic: boolean,
  micId?: string,
): Promise<MediaStream> {
  // Ask for the shape the camera gives at that height (16:9 when it can); never refuse a camera
  // that cannot, it then gives its nearest size.
  const video: MediaTrackConstraints = {
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    height: { ideal: lines },
    width: { ideal: Math.round((lines * 16) / 9) },
    frameRate: { ideal: 30 },
  };
  try {
    return await navigator.mediaDevices.getUserMedia({
      video,
      audio: withMic ? (micId ? { deviceId: { exact: micId } } : true) : false,
    });
  } catch (e) {
    const failure = toAccessError(e, "camera");
    // A blocked or missing microphone should not stop the camera: say which one failed.
    if (withMic) {
      try {
        const alone = await navigator.mediaDevices.getUserMedia({ video });
        alone.getTracks().forEach((t) => {
          t.stop();
        });
        throw toAccessError(e, "microphone");
      } catch (inner) {
        if (inner instanceof AccessError) throw inner;
      }
    }
    throw failure;
  }
}
