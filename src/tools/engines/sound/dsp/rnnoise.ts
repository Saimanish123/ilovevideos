/**
 * Speech noise removal with RNNoise 0.2 (BSD-3-Clause, xiph/rnnoise; WebAssembly build from
 * @jitsi/rnnoise-wasm 0.2.1, ADR-0108). RNNoise takes 48 kHz mono in frames of 480 samples (10 ms)
 * on a 16-bit scale and returns each frame cleaned, 960 samples (20 ms) late. Around it:
 *
 * - every channel gets its own RNNoise state (a stereo voice recording is usually two copies of
 *   one microphone, and the two come out alike);
 * - other rates go to 48 kHz and back through the band-limited resampler (./resample), which adds
 *   no delay, so the only delay is RNNoise's own, removed exactly;
 * - strength is a wet/dry mix with the original at the source rate (time-aligned), so 100% is
 *   RNNoise's output and 90% leaves the noise 20 dB down instead of gone.
 *
 * `DenoiseProcessor` is a SoundProcessor (../processor): it returns exactly as many frames as it was
 * given, by the end of `flush`. Pure apart from the WebAssembly module handed in; no network.
 */
import type { SoundProcessor } from "../processor";
import { SincResampler } from "./resample";

/** RNNoise's frame at 48 kHz. */
export const RNNOISE_FRAME = 480;
export const RNNOISE_RATE = 48_000;
/** Samples (at 48 kHz) between a frame going in and the same sound coming out. Measured, see tests. */
export const RNNOISE_DELAY = 960;
/** Zero crossings of the resampler around RNNoise (see the constructor). */
export const RESAMPLE_ZEROS = 16;

export interface Rnnoise {
  /** A new denoiser state (one per channel). */
  create(): number;
  /** Cleans one 480-sample frame in place of `out`; returns RNNoise's voice probability. */
  process(state: number, input: Float32Array, out: Float32Array): number;
  destroy(state: number): void;
}

/**
 * Instantiates the RNNoise 0.2 module (bytes checked by the loader, workers/speech-models). The
 * Emscripten build exports minified names; this is the mapping of that exact build (its glue,
 * rnnoise-sync.js: d ctors, e malloc, f free, g init, h create, i destroy, j process_frame; imports
 * a emscripten_resize_heap, b emscripten_memcpy_big).
 */
export async function instantiateRnnoise(bytes: BufferSource): Promise<Rnnoise> {
  let memory: WebAssembly.Memory | undefined;
  const imports = {
    a: {
      a: (requested: number) => {
        if (!memory) return 0;
        const grow = requested - memory.buffer.byteLength;
        if (grow <= 0) return 1;
        try {
          memory.grow(Math.ceil(grow / 65_536));
          return 1;
        } catch {
          return 0;
        }
      },
      b: (dest: number, src: number, num: number) => {
        if (memory) new Uint8Array(memory.buffer).copyWithin(dest, src, src + num);
      },
    },
  };
  const { instance } = await WebAssembly.instantiate(bytes, imports);
  const e = instance.exports as Record<string, unknown>;
  memory = e.c as WebAssembly.Memory;
  const fn = (k: string) => {
    const f = e[k];
    if (typeof f !== "function") throw new Error("The noise model is not the expected build.");
    return f as (...args: number[]) => number;
  };
  const ctors = fn("d");
  const malloc = fn("e");
  const create = fn("h");
  const destroy = fn("i");
  const processFrame = fn("j");
  ctors();
  const inPtr = malloc(RNNOISE_FRAME * 4);
  const outPtr = malloc(RNNOISE_FRAME * 4);
  if (!inPtr || !outPtr) throw new Error("The noise model could not get memory.");
  return {
    create: () => {
      const st = create(0);
      if (!st) throw new Error("The noise model could not start.");
      return st;
    },
    process(state, input, out) {
      const heap = new Float32Array((memory as WebAssembly.Memory).buffer);
      const i0 = inPtr >> 2;
      for (let i = 0; i < RNNOISE_FRAME; i++) heap[i0 + i] = (input[i] ?? 0) * 32_768;
      const vad = processFrame(state, outPtr, inPtr);
      const h = new Float32Array((memory as WebAssembly.Memory).buffer);
      const o0 = outPtr >> 2;
      for (let i = 0; i < RNNOISE_FRAME; i++) out[i] = (h[o0 + i] as number) / 32_768;
      return vad;
    },
    destroy: (state) => {
      destroy(state);
    },
  };
}

/** Growable queue of planar frames. */
class Queue {
  private data: Float32Array[];
  private start = 0;
  length = 0;
  constructor(readonly channels: number) {
    this.data = Array.from({ length: channels }, () => new Float32Array(8192));
  }
  push(planes: Float32Array[], n = planes[0]?.length ?? 0) {
    if (n === 0) return;
    const cap = this.data[0]?.length ?? 0;
    if (this.start + this.length + n > cap) {
      // Move what is queued to the front, in a larger buffer when it would not fit.
      const size = this.length + n > cap ? (this.length + n) * 2 : cap;
      this.data = this.data.map((d) => {
        if (size === cap) {
          d.copyWithin(0, this.start, this.start + this.length);
          return d;
        }
        const next = new Float32Array(size);
        next.set(d.subarray(this.start, this.start + this.length));
        return next;
      });
      this.start = 0;
    }
    for (let c = 0; c < this.channels; c++)
      (this.data[c] as Float32Array).set(
        (planes[c] ?? planes[0] ?? new Float32Array(n)).subarray(0, n),
        this.start + this.length,
      );
    this.length += n;
  }
  /** Removes and returns the first `n` frames (copies). */
  take(n: number): Float32Array[] {
    const out = this.data.map((d) => d.slice(this.start, this.start + n));
    this.start += n;
    this.length -= n;
    if (this.length === 0) this.start = 0;
    return out;
  }
}

export interface DenoiseSettings {
  sampleRate: number;
  channels: number;
  /** 0–1: share of RNNoise's output in the mix (1 = all of it). */
  strength: number;
}

/** Wet/dry mix as the level the noise is left at, in dB (−Infinity at full strength). */
export function residualDb(strength: number): number {
  const dry = 1 - Math.min(1, Math.max(0, strength));
  return dry <= 0 ? Number.NEGATIVE_INFINITY : 20 * Math.log10(dry);
}

export class DenoiseProcessor implements SoundProcessor {
  private readonly states: number[];
  private readonly up: SincResampler | null;
  private readonly down: SincResampler | null;
  private readonly dry: Queue;
  private readonly wet: Queue;
  /** 48 kHz input not yet a whole frame, per channel. */
  private readonly pending: Float32Array[];
  private pendingLen = 0;
  /** Delayed 48 kHz output frames still to drop. */
  private skip = RNNOISE_DELAY;
  private inFrames = 0;
  private outFrames = 0;
  private readonly frameOut = new Float32Array(RNNOISE_FRAME);
  /** Mean of RNNoise's voice probability, for a test or a status line. */
  voiceFrames = 0;
  frames48 = 0;

  constructor(
    private readonly rn: Rnnoise,
    private readonly s: DenoiseSettings,
  ) {
    const ch = Math.max(1, s.channels);
    this.states = Array.from({ length: ch }, () => rn.create());
    const resample = s.sampleRate !== RNNOISE_RATE;
    // A 16-zero kernel: the output differs from the 64-zero default's by about −47 dB on speech
    // over a fan, with the same scores (PESQ 1.485, STOI 0.916), at about 40% of the run time at
    // 44.1 kHz, where resampling is most of the work (ADR-0108).
    this.up = resample
      ? new SincResampler(s.sampleRate / RNNOISE_RATE, ch, { zeros: RESAMPLE_ZEROS })
      : null;
    this.down = resample
      ? new SincResampler(RNNOISE_RATE / s.sampleRate, ch, { zeros: RESAMPLE_ZEROS })
      : null;
    this.dry = new Queue(ch);
    this.wet = new Queue(ch);
    this.pending = Array.from({ length: ch }, () => new Float32Array(RNNOISE_FRAME));
  }

  /** Runs whole 480-frame blocks of 48 kHz input through RNNoise; the output goes to `wet`. */
  private feed48(planes: Float32Array[]) {
    const n = planes[0]?.length ?? 0;
    const ch = this.states.length;
    let at = 0;
    while (at < n) {
      const take = Math.min(RNNOISE_FRAME - this.pendingLen, n - at);
      for (let c = 0; c < ch; c++)
        (this.pending[c] as Float32Array).set(
          (planes[c] ?? planes[0] ?? new Float32Array(n)).subarray(at, at + take),
          this.pendingLen,
        );
      this.pendingLen += take;
      at += take;
      if (this.pendingLen < RNNOISE_FRAME) break;
      this.pendingLen = 0;
      const out: Float32Array[] = [];
      for (let c = 0; c < ch; c++) {
        const v = this.rn.process(
          this.states[c] as number,
          this.pending[c] as Float32Array,
          this.frameOut,
        );
        if (c === 0) {
          this.frames48++;
          if (v >= 0.5) this.voiceFrames++;
        }
        out.push(this.frameOut.slice());
      }
      let o = out;
      if (this.skip > 0) {
        const drop = Math.min(this.skip, RNNOISE_FRAME);
        this.skip -= drop;
        o = out.map((p) => p.subarray(drop));
      }
      if ((o[0]?.length ?? 0) === 0) continue;
      this.wet.push(this.down ? this.down.process(o) : o);
    }
  }

  private emit(): Float32Array[] {
    const n = Math.min(this.dry.length, this.wet.length);
    const dry = this.dry.take(n);
    const wet = this.wet.take(n);
    const s = Math.min(1, Math.max(0, this.s.strength));
    if (s < 1)
      for (let c = 0; c < wet.length; c++) {
        const w = wet[c] as Float32Array;
        const d = dry[c] as Float32Array;
        for (let i = 0; i < n; i++) w[i] = s * (w[i] as number) + (1 - s) * (d[i] as number);
      }
    this.outFrames += n;
    return wet;
  }

  process(planes: Float32Array[], frames: number): Float32Array[] {
    const ch = this.states.length;
    const block = Array.from({ length: ch }, (_, c) =>
      (planes[c] ?? planes[0] ?? new Float32Array(frames)).subarray(0, frames),
    );
    this.inFrames += frames;
    this.dry.push(block, frames);
    this.feed48(this.up ? this.up.process(block) : block);
    return this.emit();
  }

  flush(): Float32Array[] {
    const ch = this.states.length;
    if (this.up) this.feed48(this.up.flush());
    // Silence after the end pushes the last frame and RNNoise's delay through.
    const tail = this.skip + RNNOISE_DELAY + RNNOISE_FRAME * 2;
    this.feed48(Array.from({ length: ch }, () => new Float32Array(tail)));
    if (this.down) this.wet.push(this.down.flush());
    const out = this.emit();
    for (const st of this.states) this.rn.destroy(st);
    // Exactly as many frames out as in: anything the tail did not cover is the original (none in
    // practice; the tail is longer than the delay).
    const missing = this.inFrames - this.outFrames;
    if (missing > 0) {
      const rest = this.dry.take(Math.min(missing, this.dry.length));
      this.outFrames += rest[0]?.length ?? 0;
      return out.map((p, c) => {
        const r = rest[c] ?? new Float32Array(0);
        const j = new Float32Array(p.length + r.length);
        j.set(p);
        j.set(r, p.length);
        return j;
      });
    }
    return out;
  }
}
