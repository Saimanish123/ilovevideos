/**
 * The speech models (ADR-0108, ADR-0109): RNNoise 0.2 as WebAssembly for noise removal, and the
 * Silero VAD weights for pauses found by speech. Served from this origin under /models/, fetched
 * only when a speech tool needs them (after a file is chosen, ADR-0106), checked against their
 * SHA-256 so a stale or wrong file fails loudly instead of misbehaving (the RNNoise module's export
 * names are minified, so they are only meaningful for this exact build). Nothing here carries user
 * data; the paths are fixed, so this can never become a general fetch.
 */

export const SPEECH_MODELS = {
  rnnoise: {
    path: "/models/rnnoise/rnnoise-0.2.wasm",
    bytes: 1_440_118,
    sha256: "4f513a50613de74378331237886138eab52fa2650e8b1a41eb587d932d9b8850",
  },
  vad: {
    path: "/models/silero-vad/silero-vad-16k-6.2.3-f16.safetensors",
    bytes: 620_466,
    sha256: "cb23d14f8f822e7ff5b6d0320e62490f070e2be748f1a13bf796c46296307a8d",
  },
} as const;

export type SpeechModel = keyof typeof SPEECH_MODELS;

const cache = new Map<SpeechModel, Promise<ArrayBuffer>>();

async function sha256(data: ArrayBuffer): Promise<string | undefined> {
  // crypto.subtle exists in secure contexts (https, localhost); elsewhere the size check stands alone.
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return undefined;
  const d = new Uint8Array(await subtle.digest("SHA-256", data));
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The model file's bytes, from the browser cache after the first time. `onProgress` gets the share
 * downloaded (0–1), from the bytes actually received.
 */
export function loadSpeechModel(
  model: SpeechModel,
  onProgress?: (ratio: number) => void,
): Promise<ArrayBuffer> {
  let p = cache.get(model);
  if (p) return p;
  const spec = SPEECH_MODELS[model];
  p = (async () => {
    const r = await fetch(spec.path); // privacy-allow: our own model file under /models, same origin, no user data
    if (!r.ok) throw new Error(`The speech model could not be loaded (${r.status}).`);
    let data: ArrayBuffer;
    if (r.body && onProgress) {
      const reader = r.body.getReader();
      const out = new Uint8Array(spec.bytes);
      let at = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (at + value.length > out.length)
          throw new Error("The speech model file is not the expected one.");
        out.set(value, at);
        at += value.length;
        onProgress(at / spec.bytes);
      }
      data = out.buffer.slice(0, at);
    } else data = await r.arrayBuffer();
    if (data.byteLength !== spec.bytes)
      throw new Error("The speech model file is not the expected one.");
    const hash = await sha256(data);
    if (hash && hash !== spec.sha256)
      throw new Error("The speech model file is not the expected one.");
    return data;
  })();
  p.catch(() => cache.delete(model));
  cache.set(model, p);
  return p;
}
