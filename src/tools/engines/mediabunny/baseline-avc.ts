/**
 * H.264 in Constrained Baseline profile for browsers whose High and Main profile encoders stall
 * (ADR-0146). Playwright's WebKit (Safari 26.5 engine, measured 2026-11-19 on 640×360, 150 frames):
 * High and Main take four frames and never return one; Constrained Baseline at the same level
 * returned all 150 in 177 ms, and so did 1920×1080 at level 4.0. mediabunny always asks for High
 * profile and its Conversion cannot change the codec string, so this registers a custom encoder
 * that wraps the browser's own `VideoEncoder` with the Baseline string. It is registered only after
 * ./encoder-probe found High stalled and Baseline working; everywhere else nothing changes.
 *
 * Baseline has no B-frames and no CABAC, so at the same bitrate the picture is a little softer than
 * High; the size, set by the bitrate, is the same. Every H.264 decoder plays it.
 */
import { CustomVideoEncoder, EncodedPacket, registerEncoder, type VideoSample } from "mediabunny";

/** "avc1.64001f" → "avc1.42e01f": Constrained Baseline at the same level. Pure. */
export function baselineCodecString(codec: string): string {
  const m = /^(avc[13])\.([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(codec);
  if (!m) return "avc1.42e01f";
  return `${m[1]}.42e0${m[4]}`;
}

/** True for a High, Main or other non-Baseline H.264 codec string. Pure. */
export const needsBaseline = (codec: string): boolean =>
  /^avc[13]\.[0-9a-f]{6}$/i.test(codec) && !/^avc[13]\.42/i.test(codec);

/** Frames queued in the browser's encoder before `encode` waits: keeps memory bounded. */
const QUEUE = 16;

class BaselineAvcEncoder extends CustomVideoEncoder {
  private encoder: VideoEncoder | null = null;

  static override supports(codec: string, config: VideoEncoderConfig): boolean {
    // Bitrate-driven configurations only: mediabunny offers per-frame quantizer control first when
    // no bitrate is given, which WebKit's encoder rejects with a TypeError (measured 2026-11-19:
    // WebM to MP4 and flip failed); declining it here makes mediabunny take its bitrate candidate.
    return (
      codec === "avc" &&
      typeof VideoEncoder !== "undefined" &&
      needsBaseline(config.codec) &&
      (config as { bitrateMode?: string }).bitrateMode !== "quantizer"
    );
  }

  init() {
    const encoder = new VideoEncoder({
      output: (chunk, meta) => {
        this.onPacket(EncodedPacket.fromEncodedChunk(chunk), meta);
      },
      error: (e) => {
        this.onError(e);
      },
    });
    // mediabunny may set `alpha` and the quality latency mode; both stay as asked.
    encoder.configure({ ...this.config, codec: baselineCodecString(this.config.codec) });
    this.encoder = encoder;
  }

  async encode(sample: VideoSample, options: VideoEncoderEncodeOptions) {
    const encoder = this.encoder;
    if (!encoder) throw new Error("Encoder not initialised");
    const frame = sample.toVideoFrame();
    try {
      encoder.encode(frame, options);
    } finally {
      frame.close();
    }
    while (encoder.encodeQueueSize > QUEUE && encoder.state === "configured")
      await new Promise<void>((resolve) =>
        encoder.addEventListener("dequeue", () => resolve(), { once: true }),
      );
  }

  async flush() {
    await this.encoder?.flush();
  }

  close() {
    if (this.encoder && this.encoder.state !== "closed") this.encoder.close();
    this.encoder = null;
  }
}

let registered = false;
/** Routes every H.264 encode in this scope through Baseline from now on. Idempotent. */
export function enableBaselineAvc() {
  if (registered) return;
  registered = true;
  registerEncoder(BaselineAvcEncoder);
}
