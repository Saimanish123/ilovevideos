"use client";

import type { RefObject } from "react";
import { useSoundAudition } from "./use-sound-audition";

export { AUDITION_SEC, type AuditionState } from "./use-sound-audition";

/**
 * Plays a few seconds from the playhead with the pitch shifted by the engine's own DSP, so the shift
 * can be heard before the whole file is processed (./use-sound-audition).
 */
export function usePitchAudition(
  file: File,
  media: RefObject<HTMLMediaElement | null>,
  shift: { semitones: number; cents: number },
) {
  return useSoundAudition(file, media, {
    type: "pitch",
    semitones: shift.semitones,
    cents: shift.cents,
  });
}
