/**
 * Measures what this browser can do for the toolkit's engines (ADR-0145): WebCodecs decode and
 * encode per codec, real encodes of a few frames (an encoder can accept a configuration and never
 * return a frame: Playwright WebKit's H.264, ../../tools/engines/mediabunny/encoder-probe), WebGL 2,
 * OffscreenCanvas, OPFS, SharedArrayBuffer and capture. Runs in a window or a worker (`probeWorker`).
 * No network access; nothing leaves the page.
 */

/** Video codecs the engines decode or encode. */
export const videoCodecs = ["avc", "hevc", "vp8", "vp9", "av1"] as const;
export type VideoCodec = (typeof videoCodecs)[number];
/** Audio codecs the engines encode with WebCodecs (decoding of these is checked too). */
export const audioCodecs = ["aac", "opus", "mp3", "flac", "vorbis"] as const;
export type AudioCodec = (typeof audioCodecs)[number];

/** WebCodecs codec strings, the ones mediabunny builds for a 720p or smaller picture. */
const videoString: Record<VideoCodec, string> = {
  avc: "avc1.64001f",
  hevc: "hvc1.1.6.L93.B0",
  vp8: "vp8",
  vp9: "vp09.00.31.08",
  av1: "av01.0.05M.08",
};
const audioString: Record<AudioCodec, string> = {
  aac: "mp4a.40.2",
  opus: "opus",
  mp3: "mp3",
  flac: "flac",
  vorbis: "vorbis",
};

/** "yes": a configuration check and a real encode both worked; "config": only the check said yes. */
export type EncodeVerdict = "yes" | "config" | "no";

export interface SupportFacts {
  /** Where the facts were measured. */
  scope: "window" | "worker";
  webcodecs: boolean;
  decode: Record<VideoCodec, boolean>;
  encode: Record<VideoCodec, EncodeVerdict>;
  /** Constrained Baseline H.264, which the toolkit writes where High stalls (ADR-0146). */
  encodeAvcBaseline: EncodeVerdict;
  audioDecode: Record<AudioCodec, boolean>;
  audioEncode: Record<AudioCodec, EncodeVerdict>;
  webgl2: boolean;
  offscreenCanvas2d: boolean;
  offscreenWebgl2: boolean;
  opfs: boolean;
  /** `createSyncAccessHandle`, which only exists in a worker. */
  opfsSyncHandle: boolean;
  sharedArrayBuffer: boolean;
  crossOriginIsolated: boolean;
  wasm: boolean;
  imageDecoderGif: boolean;
  offlineAudio: boolean;
  /** Window only. */
  getDisplayMedia?: boolean;
  getUserMedia?: boolean;
  mediaRecorder?: { mp4: boolean; webmVp9: boolean; webmVp8: boolean; webmOpus: boolean };
}

const g = globalThis as typeof globalThis & {
  VideoEncoder?: typeof VideoEncoder;
  VideoDecoder?: typeof VideoDecoder;
  AudioEncoder?: typeof AudioEncoder;
  AudioDecoder?: typeof AudioDecoder;
  ImageDecoder?: { isTypeSupported(t: string): Promise<boolean> };
  OffscreenCanvas?: typeof OffscreenCanvas;
  document?: Document;
};

const settle = async <T>(p: () => Promise<T> | T, fallback: T): Promise<T> => {
  try {
    return await p();
  } catch {
    return fallback;
  }
};

const within = <T>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
  new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(fallback);
      },
    );
  });

/** Encode-probe timeout: well above any working encoder's start-up (encoder-probe uses 5 s). */
const ENCODE_MS = 4000;

async function videoDecodes(codec: VideoCodec): Promise<boolean> {
  const Decoder = g.VideoDecoder;
  if (!Decoder) return false;
  return settle(
    async () =>
      (
        await Decoder.isConfigSupported({
          codec: videoString[codec],
          codedWidth: 640,
          codedHeight: 360,
        })
      ).supported === true,
    false,
  );
}

function videoConfig(codec: VideoCodec): VideoEncoderConfig {
  return {
    codec: videoString[codec],
    width: 320,
    height: 240,
    bitrate: 500_000,
    framerate: 30,
    ...(codec === "avc" ? { avc: { format: "avc" as const } } : {}),
  };
}

/** Six grey frames through the encoder; any output chunk counts. */
async function videoEncodes(codec: VideoCodec, codecString?: string): Promise<EncodeVerdict> {
  const Encoder = g.VideoEncoder;
  if (!Encoder || typeof VideoFrame === "undefined") return "no";
  const config = { ...videoConfig(codec), ...(codecString ? { codec: codecString } : {}) };
  const ok = await settle(
    async () => (await Encoder.isConfigSupported(config)).supported === true,
    false,
  );
  if (!ok) return "no";
  let resolveOut: (v: boolean) => void = () => undefined;
  const out = new Promise<boolean>((r) => {
    resolveOut = r;
  });
  const encoder = new Encoder({
    output: () => resolveOut(true),
    error: () => resolveOut(false),
  });
  try {
    encoder.configure(config);
    const luma = config.width * config.height;
    for (let i = 0; i < 6; i++) {
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
    return (await within(out, ENCODE_MS, false)) ? "yes" : "config";
  } catch {
    return "config";
  } finally {
    settle(() => encoder.close(), undefined);
  }
}

async function audioDecodes(codec: AudioCodec): Promise<boolean> {
  const ADecoder = g.AudioDecoder;
  if (!ADecoder) return false;
  // FLAC and Vorbis need the stream header as `description`; without one some browsers refuse a
  // configuration they would accept from a real file, so those two are only asked with one.
  const description =
    codec === "flac"
      ? new Uint8Array([
          0x66, 0x4c, 0x61, 0x43, 0x80, 0, 0, 0x22, 0x10, 0, 0x10, 0, 0, 0, 0, 0, 0, 0, 0x0b, 0xb8,
          0x01, 0x70, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        ])
      : undefined;
  if (codec === "vorbis") return false;
  return settle(
    async () =>
      (
        await ADecoder.isConfigSupported({
          codec: audioString[codec],
          sampleRate: 48_000,
          numberOfChannels: 2,
          ...(description ? { description } : {}),
        })
      ).supported === true,
    false,
  );
}

/** A tenth of a second of quiet tone through the encoder; any output chunk counts. */
async function audioEncodes(codec: AudioCodec): Promise<EncodeVerdict> {
  const AEncoder = g.AudioEncoder;
  if (!AEncoder || typeof AudioData === "undefined") return "no";
  const config: AudioEncoderConfig = {
    codec: audioString[codec],
    sampleRate: 48_000,
    numberOfChannels: 2,
    bitrate: 128_000,
  };
  const ok = await settle(
    async () => (await AEncoder.isConfigSupported(config)).supported === true,
    false,
  );
  if (!ok) return "no";
  let resolveOut: (v: boolean) => void = () => undefined;
  const out = new Promise<boolean>((r) => {
    resolveOut = r;
  });
  const encoder = new AEncoder({
    output: () => resolveOut(true),
    error: () => resolveOut(false),
  });
  try {
    encoder.configure(config);
    const frames = 4800;
    const data = new Float32Array(frames * 2);
    for (let i = 0; i < frames; i++) {
      const s = 0.1 * Math.sin((2 * Math.PI * 440 * i) / 48_000);
      data[i * 2] = s;
      data[i * 2 + 1] = s;
    }
    const chunk = new AudioData({
      format: "f32",
      sampleRate: 48_000,
      numberOfFrames: frames,
      numberOfChannels: 2,
      timestamp: 0,
      data,
    });
    encoder.encode(chunk);
    chunk.close();
    encoder.flush().catch(() => undefined);
    return (await within(out, ENCODE_MS, false)) ? "yes" : "config";
  } catch {
    return "config";
  } finally {
    settle(() => encoder.close(), undefined);
  }
}

function webgl2InWindow(): boolean {
  const doc = g.document;
  if (!doc) return false;
  try {
    const c = doc.createElement("canvas");
    return !!c.getContext("webgl2");
  } catch {
    return false;
  }
}

function offscreen(kind: "2d" | "webgl2"): boolean {
  if (!g.OffscreenCanvas) return false;
  try {
    return !!new g.OffscreenCanvas(16, 16).getContext(kind);
  } catch {
    return false;
  }
}

async function opfs(): Promise<{ root: boolean; sync: boolean }> {
  const storage = (globalThis.navigator as Navigator | undefined)?.storage;
  if (!storage || typeof storage.getDirectory !== "function") return { root: false, sync: false };
  return settle(
    async () => {
      const root = await within(storage.getDirectory(), 3000, null);
      if (!root) return { root: false, sync: false };
      const name = `support-probe-${Math.random().toString(36).slice(2)}`;
      let sync = false;
      const handle = await root.getFileHandle(name, { create: true });
      const create = (
        handle as FileSystemFileHandle & {
          createSyncAccessHandle?: () => Promise<{ close(): void }>;
        }
      ).createSyncAccessHandle;
      if (typeof create === "function") {
        const h = await settle(() => create.call(handle), null);
        if (h) {
          sync = true;
          h.close();
        }
      }
      await settle(() => root.removeEntry(name), undefined);
      return { root: true, sync };
    },
    { root: false, sync: false },
  );
}

function recorder(): SupportFacts["mediaRecorder"] {
  if (typeof MediaRecorder === "undefined")
    return { mp4: false, webmVp9: false, webmVp8: false, webmOpus: false };
  const is = (t: string) => {
    try {
      return MediaRecorder.isTypeSupported(t);
    } catch {
      return false;
    }
  };
  return {
    mp4: is('video/mp4;codecs="avc1.42E01E,mp4a.40.2"') || is("video/mp4"),
    webmVp9: is("video/webm;codecs=vp9,opus"),
    webmVp8: is("video/webm;codecs=vp8,opus"),
    webmOpus: is("audio/webm;codecs=opus"),
  };
}

const record = <K extends string, V>(keys: readonly K[], values: V[]) =>
  Object.fromEntries(keys.map((k, i) => [k, values[i]])) as Record<K, V>;

/** Every fact this scope can measure. Takes a few seconds where an encoder stalls. */
export async function probeSupport(): Promise<SupportFacts> {
  const scope: SupportFacts["scope"] = g.document ? "window" : "worker";
  const [decode, encode, baseline, audioDecode, audioEncode, storage, gif] = await Promise.all([
    Promise.all(videoCodecs.map((c) => videoDecodes(c))),
    Promise.all(videoCodecs.map((c) => videoEncodes(c))),
    videoEncodes("avc", "avc1.42e01e"),
    Promise.all(audioCodecs.map(audioDecodes)),
    Promise.all(audioCodecs.map(audioEncodes)),
    opfs(),
    settle(
      async () => (g.ImageDecoder ? await g.ImageDecoder.isTypeSupported("image/gif") : false),
      false,
    ),
  ]);
  const nav = globalThis.navigator as Navigator | undefined;
  const facts: SupportFacts = {
    scope,
    webcodecs: !!g.VideoEncoder && !!g.VideoDecoder,
    decode: record(videoCodecs, decode),
    encode: record(videoCodecs, encode),
    encodeAvcBaseline: baseline,
    audioDecode: record(audioCodecs, audioDecode),
    audioEncode: record(audioCodecs, audioEncode),
    webgl2: scope === "window" ? webgl2InWindow() : offscreen("webgl2"),
    offscreenCanvas2d: offscreen("2d"),
    offscreenWebgl2: offscreen("webgl2"),
    opfs: storage.root,
    opfsSyncHandle: storage.sync,
    sharedArrayBuffer: typeof SharedArrayBuffer !== "undefined",
    crossOriginIsolated: globalThis.crossOriginIsolated === true,
    wasm: typeof WebAssembly !== "undefined",
    imageDecoderGif: gif,
    offlineAudio: typeof OfflineAudioContext !== "undefined",
  };
  if (scope === "window") {
    facts.getDisplayMedia = typeof nav?.mediaDevices?.getDisplayMedia === "function";
    facts.getUserMedia = typeof nav?.mediaDevices?.getUserMedia === "function";
    facts.mediaRecorder = recorder();
  }
  return facts;
}
