/**
 * Runtime capability detection. Decides which backend a tool page may use.
 * Results are cached per session and shown to the user in the tool's "how this runs" line.
 */
export interface Capabilities {
  webcodecs: boolean;
  sharedArrayBuffer: boolean;
  crossOriginIsolated: boolean;
  webgpu: boolean;
  opfs: boolean;
  /** Rough device memory in GB when the browser exposes it. */
  deviceMemoryGb?: number;
  hardwareConcurrency: number;
}

export function detectCapabilities(): Capabilities {
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  return {
    webcodecs: typeof VideoEncoder !== "undefined" && typeof VideoDecoder !== "undefined",
    sharedArrayBuffer: typeof SharedArrayBuffer !== "undefined",
    crossOriginIsolated: typeof crossOriginIsolated !== "undefined" && crossOriginIsolated,
    webgpu: !!nav && "gpu" in nav,
    opfs: !!nav?.storage && typeof nav.storage.getDirectory === "function",
    deviceMemoryGb: (nav as { deviceMemory?: number } | undefined)?.deviceMemory,
    hardwareConcurrency: nav?.hardwareConcurrency ?? 1,
  };
}

/** Can this browser encode the given codec via WebCodecs? Probe, do not assume. */
export async function canEncode(codec: string, width = 1920, height = 1080): Promise<boolean> {
  if (typeof VideoEncoder === "undefined") return false;
  try {
    const res = await VideoEncoder.isConfigSupported({
      codec,
      width,
      height,
      bitrate: 4_000_000,
      framerate: 30,
    });
    return res.supported === true;
  } catch {
    return false;
  }
}
