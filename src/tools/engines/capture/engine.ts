import { z } from "zod";
import type { EngineId } from "@/tools/registry/schema";
import { EngineError } from "../errors";
import type { Engine } from "../types";

/** The recorders take no options from a page preset: every choice is made on the page before recording. */
export const CaptureOptions = z.object({}).strict();
export type CaptureOptions = z.infer<typeof CaptureOptions>;

/**
 * A recorder as an engine (ADR-0099): `supports()` probes what recording needs in this browser (the
 * device or screen API and a WebCodecs encoder). Recording runs on the page from live tracks
 * (./recorder, started by the page's `IdleSpec.Capture`), never in the engine worker from a file, so
 * `run()` refuses: there is no file to process.
 */
export function captureEngine(
  id: EngineId,
  needs: "display" | "camera" | "microphone",
): Engine<CaptureOptions> {
  return {
    id,
    backends: ["webcodecs"],
    optionsSchema: CaptureOptions,
    async supports() {
      if (typeof navigator === "undefined" || !navigator.mediaDevices) return false;
      const api =
        needs === "display"
          ? typeof navigator.mediaDevices.getDisplayMedia === "function"
          : typeof navigator.mediaDevices.getUserMedia === "function";
      if (!api) return false;
      if (needs === "microphone")
        return typeof AudioEncoder !== "undefined" || typeof AudioContext !== "undefined";
      return typeof VideoEncoder !== "undefined";
    },
    async run() {
      throw new EngineError(
        "unsupported-input",
        "A recorder records from a camera, a microphone or the screen, not from a file.",
        "Open the recorder page and press Start recording.",
      );
    },
  };
}
