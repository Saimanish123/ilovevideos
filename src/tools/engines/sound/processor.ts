/**
 * Sample processors for the sound render (./render): a gain, fades and a limiter, chained. Each
 * takes planar blocks in order and may hold frames back (the limiter's look-ahead) until `flush`, so
 * the chain's output has exactly as many frames as its input. Pure: no DOM, no mediabunny.
 */
import { type FadeSpec, fadeGain, fitFades } from "./dsp/fade";
import { Limiter } from "./dsp/limiter";
import { fromDb } from "./dsp/loudness";

export interface SoundProcessor {
  /** `t` is the time of the block's first frame, in seconds from the start of the sound. */
  process(planes: Float32Array[], frames: number, t: number): Float32Array[];
  flush(): Float32Array[];
}

export interface ChainFacts {
  sampleRate: number;
  channels: number;
  /** Seconds of sound that will pass through. */
  duration: number;
}

export interface ChainSpec {
  /** Gain in dB applied to every sample. */
  gainDb?: number;
  fades?: FadeSpec;
  /** Ceiling in dBTP for the limiter; undefined for none. */
  ceilingDb?: number;
}

/** The deepest gain reduction the chain's limiter applied, in dB (0 when it never acted). */
export interface Chain extends SoundProcessor {
  limitedDb(): number;
}

export function buildChain(spec: ChainSpec, facts: ChainFacts): Chain {
  const gain = fromDb(spec.gainDb ?? 0);
  const fades = spec.fades ? fitFades(spec.fades, facts.duration) : undefined;
  const limiter =
    spec.ceilingDb !== undefined
      ? new Limiter(facts.channels, facts.sampleRate, fromDb(spec.ceilingDb))
      : undefined;
  const rate = facts.sampleRate;
  const shape = (planes: Float32Array[], frames: number, t: number) => {
    if (gain === 1 && !fades) return planes;
    return planes.map((p) => {
      const out = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        const g = fades ? gain * fadeGain(t + i / rate, facts.duration, fades) : gain;
        out[i] = (p[i] ?? 0) * g;
      }
      return out;
    });
  };
  return {
    process(planes, frames, t) {
      const shaped = shape(planes, frames, t);
      return limiter ? limiter.process(shaped, frames) : shaped;
    },
    flush() {
      return limiter ? limiter.flush() : planes0(facts.channels);
    },
    limitedDb() {
      return limiter && limiter.minGain < 1 ? -20 * Math.log10(limiter.minGain) : 0;
    },
  };
}

const planes0 = (channels: number) => Array.from({ length: channels }, () => new Float32Array(0));
