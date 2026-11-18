"use client";

import { useEffect, useState } from "react";
import {
  type EncoderProbe,
  formatWords,
  videoRecordingFormat,
} from "@/tools/engines/capture/light";

/**
 * What this browser's WebCodecs encoders accept, asked once per page with plain configurations
 * (720p picture, 48 kHz mono sound), for the ready line's format before anything is shared. The
 * recorder asks again at the real size when it starts and says so if that differs.
 */
let probed: Promise<EncoderProbe> | undefined;
export function probeEncodersLight(): Promise<EncoderProbe> {
  probed ??= (async () => {
    const video = (codec: string) =>
      typeof VideoEncoder === "undefined"
        ? Promise.resolve(false)
        : VideoEncoder.isConfigSupported({
            codec,
            width: 1280,
            height: 720,
            bitrate: 2_000_000,
            framerate: 30,
          })
            .then((r) => r.supported === true)
            .catch(() => false);
    const audio = (codec: string) =>
      typeof AudioEncoder === "undefined"
        ? Promise.resolve(false)
        : AudioEncoder.isConfigSupported({
            codec,
            sampleRate: 48_000,
            numberOfChannels: 1,
            bitrate: 96_000,
          })
            .then((r) => r.supported === true)
            .catch(() => false);
    const [avc, vp9, vp8, aac, opus] = await Promise.all([
      video("avc1.42E01F"),
      video("vp09.00.10.08"),
      video("vp8"),
      audio("mp4a.40.2"),
      audio("opus"),
    ]);
    return { avc, vp9, vp8, aac, opus };
  })();
  return probed;
}

/** The format words for the ready line ("MP4 · H.264, AAC"), once known; null when nothing encodes. */
export function useFormatWords(withSound: boolean): string | null | undefined {
  const [probe, setProbe] = useState<EncoderProbe>();
  useEffect(() => {
    void probeEncodersLight().then(setProbe);
  }, []);
  if (!probe) return undefined;
  const plan = videoRecordingFormat(probe, withSound);
  return plan ? formatWords(plan) : null;
}
