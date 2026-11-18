/**
 * Asking the browser for a microphone, a camera or the screen, and saying specifically what went
 * wrong when it refuses (README.md#system-design-and-production-principles, failure handling).
 * Light on purpose: the recorder pages' first load carries this, and the encoder loads only once
 * recording starts. No network access.
 */
import { type AccessFailure, accessFailure, type Os, osOf } from "@/tools/engines/capture/light";

export type Device = "microphone" | "camera" | "screen";

export class AccessError extends Error {
  constructor(
    readonly failure: AccessFailure,
    readonly device: Device,
    message: string,
  ) {
    super(message);
    this.name = "AccessError";
  }
}

export const toAccessError = (e: unknown, device: Device) => {
  const err = e as DOMException;
  return new AccessError(
    accessFailure(err?.name, err?.message, device === "screen"),
    device,
    String(err?.message ?? e),
  );
};

/** Whether this browser can record the screen at all (phones and tablets cannot). */
export const canShareScreen = () =>
  typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getDisplayMedia === "function";

export const canUseDevices = () =>
  typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function";

export interface SoundProcessing {
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
}

/**
 * The screen, a window or a tab, chosen in the browser's own dialog. Must be called straight from
 * the click (browsers require the gesture). `sound` asks for the tab's or the system's sound where
 * the browser offers it.
 */
export async function shareScreen(sound: boolean, fps: number): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: fps, max: fps } },
      audio: sound,
      // Chromium hints: offer the whole screen's sound, and do not offer this tab (it would record
      // the recorder). Ignored where unknown.
      systemAudio: sound ? "include" : "exclude",
      selfBrowserSurface: "exclude",
      surfaceSwitching: "include",
    } as DisplayMediaStreamOptions);
  } catch (e) {
    throw toAccessError(e, "screen");
  }
}

/** The devices of one kind, with names once the browser has allowed one of them. */
export async function listDevices(kind: "audioinput" | "videoinput"): Promise<MediaDeviceInfo[]> {
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter((d) => d.kind === kind && d.deviceId !== "");
  } catch {
    return [];
  }
}

/** "granted", "denied" or "prompt"; "prompt" where the browser does not say. */
export async function permissionOf(name: "microphone" | "camera"): Promise<PermissionState> {
  try {
    const status = await navigator.permissions.query({ name: name as PermissionName });
    return status.state;
  } catch {
    return "prompt";
  }
}

export const stopAll = (s: MediaStream | MediaStreamTrack[] | undefined | null) => {
  for (const t of Array.isArray(s) ? s : (s?.getTracks() ?? [])) t.stop();
};

export const thisOs = (): Os =>
  osOf(
    (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform ??
      navigator.platform ??
      "",
  );
