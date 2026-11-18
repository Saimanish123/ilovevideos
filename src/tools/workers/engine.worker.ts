/**
 * Engine runner worker. All decoding, encoding and muxing happens here so the page thread only
 * renders progress. No network access to user data (README.md#privacy-and-processing §2).
 */

import { loadEngine } from "@/tools/engines";
import { encodeRequest } from "@/tools/engines/encode-request";
import { cannotEncodeError, classifyError } from "@/tools/engines/errors";
import { takeSupportFailure } from "@/tools/engines/mediabunny/encoder-probe";
import { listKeyframes } from "@/tools/engines/mediabunny/keyframes";
import { releaseOutputs } from "@/tools/engines/mediabunny/output-store";
import { inspect } from "@/tools/engines/mediabunny/shared";
import type { FromWorker, ToWorker } from "./protocol";

const jobs = new Map<number, AbortController>();

const post = (msg: FromWorker, transfer?: Transferable[]) => {
  (self as unknown as { postMessage: (m: FromWorker, t?: Transferable[]) => void }).postMessage(
    msg,
    transfer,
  );
};

const fail = (id: number, e: unknown) => {
  const err = classifyError(e);
  post({ type: "error", id, code: err.code, message: err.message, hint: err.hint });
};

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
  if (msg.type === "inspect") {
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
      const input = inputs[0] ?? { file: msg.file, info: msg.info };
      const backend = engine.backends[0] ?? "webcodecs";
      takeSupportFailure();
      if (!(await engine.supports(backend, input, options, inputs))) {
        // A probe that found the reason (an encoder that never returns frames) says it.
        const known = takeSupportFailure();
        if (known) throw known;
        // Otherwise name the kind of track and codec the output needs, and the source's facts.
        throw cannotEncodeError(
          encodeRequest(input.info, options, {
            engineId: msg.engineId,
            fileName: input.file.name,
          }),
        );
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
      fail(msg.id, e);
    } finally {
      jobs.delete(msg.id);
    }
  }
};

// The handler above is set: messages from now on are heard (protocol `ready`).
post({ type: "ready", id: 0 });
