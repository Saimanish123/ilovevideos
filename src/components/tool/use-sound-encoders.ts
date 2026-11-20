"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  ASSUMED_ENCODERS,
  onSoundEncoders,
  type SoundEncoders,
  soundEncoders,
  soundEncodersNow,
} from "@/tools/engines/sound-codec";

/**
 * This browser's sound encoders for a line that names the codec a job writes
 * (engines/sound-codec). Until the probe answers it is the common case (AAC), so the text only
 * changes where AAC is missing, a few milliseconds after the page starts; the component re-renders
 * then. The probe is a single `isConfigSupported` per codec.
 */
export function useSoundEncoders(): SoundEncoders {
  useEffect(() => {
    void soundEncoders();
  }, []);
  return useSyncExternalStore(onSoundEncoders, soundEncodersNow, () => ASSUMED_ENCODERS);
}
