/**
 * Engine runner worker. All decoding, encoding and muxing happens here so the page thread only
 * renders progress. No network access to user data (README.md#privacy-and-processing §2).
 */

import { loadEngine } from "@/tools/engines";
import { encodeRequest } from "@/tools/engines/encode-request";
import { cannotEncodeError, classifyError } from "@/tools/engines/errors";
import { avcEncodes, takeSupportFailure } from "@/tools/engines/mediabunny/encoder-probe";
import { listKeyframes } from "@/tools/engines/mediabunny/keyframes";
import { releaseOutputs } from "@/tools/engines/mediabunny/output-store";
import { inspect } from "@/tools/engines/mediabunny/shared";
import type { MediaInput } from "@/tools/engines/types";
import type { FromWorker, ToWorker } from "./protocol";

const jobs = new Map<number, AbortController>();

const post = (msg: FromWorker, transfer?: Transferable[]) => {
  (self as unknown as { postMessage: (m: FromWorker, t?: Transferable[]) => void }).postMessage(
    msg,
    transfer,
  );
};

/** Engines whose output is never a video: pictures, sound, text or subtitles. */
const writesNoVideo: ReadonlySet<string> = new Set([
  "video-to-gif",
  "animated-image",
  "video-to-frames",
  "frame-extract",
  "frame-pick",
  "thumbnail-grid",
  "inspect",
  "audio-analyze",
  "convert-audio",
  "video-to-audio",
  "join-audio",
  "subtitles-convert",
  "subtitles-extract",
  "pitch",
  "speech-denoise",
  "ringtone",
]);

/** The class `classifyError` gives a decoder failure, whether raw or already classified in an engine. */
const DECODER_GAP = classifyError(new Error("decode")).message;

const fail = (id: number, e: unknown, unsupported?: true) => {
  const err = classifyError(e);
  // The raw cause goes to the console for a bug report; the page shows the plain message.
  if (err.detail) console.error(err.detail);
  post({
    type: "error",
    id,
    code: err.code,
    message: err.message,
    hint: err.hint,
    ...(unsupported ? { unsupported } : {}),
  });
};

/**
 * Null when the engine can run these inputs and options in this browser; otherwise why not: the
 * reason a probe found (an encoder that never returns frames) or the kind of track and codec the
 * output needs. The run and the page's check before it (`check`) ask the same question.
 */
async function cannotRun(
  engineId: Parameters<typeof loadEngine>[0],
  options: unknown,
  inputs: MediaInput[],
) {
  const engine = await loadEngine(engineId);
  const parsed = engine.optionsSchema.parse(options);
  const input = inputs[0];
  if (!input) return null;
  // H.264 in High profile, or Baseline where High stalls (ADR-0146): settled before any engine that
  // may write a video asks. The others do not wait for it (up to 5 s where the encoder stalls).
  if (!writesNoVideo.has(engineId)) await avcEncodes();
  const backend = engine.backends[0] ?? "webcodecs";
  takeSupportFailure();
  if (await engine.supports(backend, input, parsed, inputs)) return null;
  return (
    takeSupportFailure() ??
    cannotEncodeError(encodeRequest(input.info, parsed, { engineId, fileName: input.file.name }))
  );
}

self.onmessage = async (event: MessageEvent<ToWorker>) => {
  const msg = event.data;
  if (msg.type === "cancel") {
    jobs.get(msg.id)?.abort();
    return;
  }
  if (msg.type === "release") {
    await releaseOutputs().catch(() => undefined);
    post({ type: "released", id: msg.id });
    return;
  }
  if (msg.type === "check") {
    try {
      const why = await cannotRun(msg.engineId, msg.options, msg.inputs);
      post({
        type: "checked",
        id: msg.id,
        ...(why ? { failure: { code: why.code, message: why.message, hint: why.hint } } : {}),
      });
    } catch {
      // Options mid-edit that do not parse yet, or an engine that failed to load: the run says why.
      post({ type: "checked", id: msg.id });
    }
    return;
  }
  if (msg.type === "inspect") {
    // The H.264 probe takes up to 5 s where the encoder stalls; it runs while the user decides.
    void avcEncodes();
    try {
      const info = await inspect(msg.file);
      // Key frames in page time, from the file's start (MediaInfo.startSec).
      if (msg.keyframes && info.video)
        info.video.keyframes = (await listKeyframes(msg.file)).map((t) => t - (info.startSec ?? 0));
      post({ type: "info", id: msg.id, info });
    } catch (e) {
      fail(msg.id, e);
    }
    return;
  }
  if (msg.type === "run") {
    const controller = new AbortController();
    jobs.set(msg.id, controller);
    try {
      post({
        type: "progress",
        id: msg.id,
        progress: { phase: "loading", ratio: 0, detail: "Loading the encoder" },
      });
      const engine = await loadEngine(msg.engineId);
      const options = engine.optionsSchema.parse(msg.options);
      const inputs = msg.inputs?.length ? msg.inputs : [{ file: msg.file, info: msg.info }];
      const backend = engine.backends[0] ?? "webcodecs";
      const why = await cannotRun(msg.engineId, msg.options, inputs);
      if (why) {
        fail(msg.id, why, true);
        return;
      }
      const result = await engine.run(backend, inputs, options, {
        signal: controller.signal,
        onProgress: (progress) => post({ type: "progress", id: msg.id, progress }),
      });
      // Results cross as Blobs, by reference: an output streamed to disk (OPFS) is never read into
      // memory here (../engines/mediabunny/output-store). Multi-output runs send every file.
      const files = result.files?.map((f) => ({
        blob: f.blob,
        mime: f.blob.type,
        filename: f.filename,
        meta: f.meta,
      }));
      post({
        type: "done",
        id: msg.id,
        blob: files?.[0]?.blob ?? result.blob,
        mime: result.blob.type,
        filename: result.filename,
        ffmpegCommand: result.ffmpegCommand,
        meta: result.meta,
        files,
      });
    } catch (e) {
      // The browser's own decoder gave up on a stream it said it could read (FLAC in WebKit,
      // measured 2026-11-19): this browser cannot do it, and an engine with an ffmpeg.wasm runner
      // makes the file there instead (ADR-0147). Engine errors keep their own class.
      const decoderGap = classifyError(e).message === DECODER_GAP;
      fail(msg.id, e, decoderGap ? true : undefined);
    } finally {
      jobs.delete(msg.id);
    }
  }
};

// The handler above is set: messages from now on are heard (protocol `ready`).
post({ type: "ready", id: 0 });
