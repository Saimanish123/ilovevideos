/**
 * A real test of the H.264 encoder, not just `isConfigSupported`. Playwright's WebKit (Safari 26.5
 * engine, measured 2026-10-08) says yes to every H.264 profile, but with High or Main profile and the
 * default latency mode its encoder takes four frames, then never outputs, never errors and never
 * settles `flush()`: compress sat at "0:00 of 0:03 processed" with no error. Baseline profile, or
 * `latencyMode: "realtime"`, encodes fine there; mediabunny always asks for High profile and its
 * Conversion cannot set the latency mode, so the honest answer is "this browser cannot encode H.264
 * for this tool", found in a fraction of a second before a run starts.
 *
 * Runs in the engine worker. No network access (README.md#privacy-and-processing §2).
 */
import { EngineError } from "../errors";

/** Frames encoded by the probe and how long it may take: well above any real encoder's start-up. */
const PROBE_FRAMES = 6;
const PROBE_TIMEOUT_MS = 5000;

let probe: Promise<EngineError | null> | undefined;
/** Why the last `supports()` said no, when a probe here found out; read once by the worker. */
let reason: EngineError | null = null;

/** Records why a capability check failed, so the run can say it instead of a generic line. */
export const noteSupportFailure = (e: EngineError | null) => {
  reason = e;
};
/** The recorded reason, cleared on reading. */
export const takeSupportFailure = (): EngineError | null => {
  const r = reason;
  reason = null;
  return r;
};

/**
 * Null when this browser's H.264 encoder (High profile, as mediabunny configures it) produces
 * output; otherwise the error to show. Measured once per worker.
 */
export function avcEncoderTrouble(): Promise<EngineError | null> {
  probe ??= run().catch(() => null);
  return probe;
}

let fallback: Promise<EngineError | null> | undefined;

/**
 * Null when this browser can write H.264 for mediabunny: High profile works, or it stalls and
 * Constrained Baseline at the same settings works, in which case every later H.264 encode in this
 * scope is written as Baseline (./baseline-avc, ADR-0146). Otherwise the error `avcEncoderTrouble`
 * found. Measured once per worker; `avcEncoderTrouble` itself is unchanged for the engines that pick
 * Baseline on their own (compose, remove silence).
 */
export function avcEncodes(): Promise<EngineError | null> {
  fallback ??= (async () => {
    const trouble = await avcEncoderTrouble();
    if (!trouble) return null;
    const baseline = await encodesFrames("avc1.42e01e").catch(() => false);
    if (!baseline) return trouble;
    const { enableBaselineAvc } = await import("./baseline-avc");
    enableBaselineAvc();
    return null;
  })().catch(() => null);
  return fallback;
}

/** Whether a few small frames come back from this codec string within the probe's time. */
async function encodesFrames(codec: string): Promise<boolean> {
  if (typeof VideoEncoder === "undefined" || typeof VideoFrame === "undefined") return false;
  const config: VideoEncoderConfig = {
    codec,
    width: 320,
    height: 240,
    bitrate: 500_000,
    framerate: 30,
    avc: { format: "avc" },
  };
  if (!(await VideoEncoder.isConfigSupported(config)).supported) return false;
  let outputs = 0;
  let first: () => void = () => undefined;
  const got = new Promise<void>((resolve) => {
    first = resolve;
  });
  const encoder = new VideoEncoder({
    output: () => {
      outputs++;
      first();
    },
    error: () => first(),
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    encoder.configure(config);
    const luma = config.width * config.height;
    for (let i = 0; i < PROBE_FRAMES; i++) {
      const data = new Uint8Array(luma * 1.5).fill(128);
      data.fill(16 + i * 30, 0, luma);
      const frame = new VideoFrame(data, {
        format: "I420",
        codedWidth: config.width,
        codedHeight: config.height,
        timestamp: Math.round((i * 1e6) / 30),
      });
      encoder.encode(frame, { keyFrame: i === 0 });
      frame.close();
    }
    encoder.flush().catch(() => undefined);
    await Promise.race([
      got,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, PROBE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    try {
      encoder.close();
    } catch {
      // already closed by an error
    }
  }
  return outputs > 0;
}

const stalled = () =>
  new EngineError(
    "unsupported-output",
    "This browser could not write a short test video, so this tool cannot work here.",
    "Try desktop Chrome or Edge. A converter that keeps the video as it is can still work.",
  );

async function run(): Promise<EngineError | null> {
  if (typeof VideoEncoder === "undefined" || typeof VideoFrame === "undefined") return null;
  const width = 320;
  const height = 240;
  // High profile, level 3.0: what mediabunny builds for a small picture.
  const config: VideoEncoderConfig = {
    codec: "avc1.64001e",
    width,
    height,
    bitrate: 500_000,
    framerate: 30,
    avc: { format: "avc" },
  };
  if (!(await VideoEncoder.isConfigSupported(config)).supported) return null;
  let outputs = 0;
  let failed: unknown = null;
  let first: () => void = () => undefined;
  const got = new Promise<void>((resolve) => {
    first = resolve;
  });
  const encoder = new VideoEncoder({
    output: () => {
      outputs++;
      first();
    },
    error: (e) => {
      failed = e;
      first();
    },
  });
  try {
    encoder.configure(config);
    const luma = width * height;
    for (let i = 0; i < PROBE_FRAMES; i++) {
      const data = new Uint8Array(luma * 1.5).fill(128);
      data.fill(16 + i * 30, 0, luma);
      const frame = new VideoFrame(data, {
        format: "I420",
        codedWidth: width,
        codedHeight: height,
        timestamp: Math.round((i * 1e6) / 30),
      });
      encoder.encode(frame, { keyFrame: i === 0 });
      frame.close();
    }
    // Ask for the frames, but judge by output: the stalled encoder never settles flush().
    encoder.flush().catch(() => undefined);
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      got,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, PROBE_TIMEOUT_MS);
      }),
    ]);
    clearTimeout(timer);
  } catch (e) {
    failed = e;
  } finally {
    try {
      encoder.close();
    } catch {
      // already closed by an error
    }
  }
  if (outputs > 0) return null;
  if (failed)
    return new EngineError(
      "unsupported-output",
      "This browser could not write a short test video, so this tool cannot work here.",
      "Try desktop Chrome or Edge.",
    );
  return stalled();
}
