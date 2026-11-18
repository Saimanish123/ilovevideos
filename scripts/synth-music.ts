/**
 * Synthetic music with a known tempo and key, for the key and BPM finder's tests and fixtures (no
 * copyrighted audio). A kick on every beat, a clap on 2 and 4, hi-hats on eighths, a bass note and a
 * triad per bar following a common progression in the key (minor: i–iv–V–i with the harmonic minor's major V; major: I–vi–IV–V),
 * each note a sum of six harmonics. The tempo may move linearly from `bpm` to `bpmEnd`.
 *
 * CLI (scripts/make-fixtures.sh): `tsx scripts/synth-music.ts <bpm> <bpmEnd> <tonic 0-11> <major|minor>
 * <seconds> <out.wav>` writes 32-bit float stereo WAV at 44.1 kHz.
 */
import { writeFileSync } from "node:fs";

export interface MusicSpec {
  bpm: number;
  /** Tempo at the end; the beat rate moves linearly in time. Defaults to `bpm`. */
  bpmEnd?: number;
  /** Pitch class of the tonic, 0 = C. */
  tonic: number;
  mode: "major" | "minor";
  seconds: number;
  rate?: number;
  /** Detune in cents (a recording tuned away from A = 440 Hz). */
  detune?: number;
}

/** Scale degrees (semitones from the tonic) of each bar's chord root, and the chord quality. */
const PROGRESSIONS = {
  minor: [
    [0, "min"],
    [5, "min"],
    [7, "maj"],
    [0, "min"],
  ],
  major: [
    [0, "maj"],
    [9, "min"],
    [5, "maj"],
    [7, "maj"],
  ],
} as const;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32 - 0.5;
  };
}

export function synthMusic(spec: MusicSpec): Float32Array[] {
  const rate = spec.rate ?? 44_100;
  const n = Math.round(spec.seconds * rate);
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  const end = spec.bpmEnd ?? spec.bpm;
  // Beat times: the beat phase is the integral of the tempo.
  const beats: number[] = [];
  let t = 0;
  while (t < spec.seconds) {
    beats.push(t);
    const bpm = spec.bpm + ((end - spec.bpm) * t) / spec.seconds;
    t += 60 / bpm;
  }
  const noise = rng(7);
  const tune = 2 ** ((spec.detune ?? 0) / 1200);
  const hz = (midi: number) => 440 * tune * 2 ** ((midi - 69) / 12);
  const add = (start: number, len: number, f: (i: number, tt: number) => number, pan = 0) => {
    const s0 = Math.round(start * rate);
    const count = Math.min(n - s0, Math.round(len * rate));
    for (let i = 0; i < count; i++) {
      const v = f(i, i / rate);
      l[s0 + i] = (l[s0 + i] as number) + v * (1 - pan);
      r[s0 + i] = (r[s0 + i] as number) + v * (1 + pan);
    }
  };
  const note = (midi: number, start: number, len: number, amp: number, pan = 0) => {
    const f0 = hz(midi);
    add(
      start,
      len,
      (_i, tt) => {
        const env = Math.min(1, tt / 0.01) * Math.exp(-tt * 1.2) * Math.min(1, (len - tt) / 0.05);
        let v = 0;
        for (let h = 1; h <= 6; h++) v += Math.sin(2 * Math.PI * f0 * h * tt) / h;
        return amp * env * v;
      },
      pan,
    );
  };
  beats.forEach((b, i) => {
    const next = beats[i + 1] ?? b + 60 / end;
    const beatLen = next - b;
    // Kick: a falling sine.
    add(
      b,
      0.25,
      (_i, tt) =>
        0.5 * Math.exp(-tt * 18) * Math.sin(2 * Math.PI * (50 + 80 * Math.exp(-tt * 30)) * tt),
    );
    // Clap on 2 and 4.
    if (i % 4 === 1 || i % 4 === 3) add(b, 0.12, (_i, tt) => 0.25 * Math.exp(-tt * 35) * noise());
    // Hi-hats on eighths.
    for (const off of [0, beatLen / 2])
      add(b + off, 0.04, (_i, tt) => 0.06 * Math.exp(-tt * 120) * noise(), 0.3);
    // A chord and a bass note at each bar.
    if (i % 4 === 0) {
      const bar = Math.floor(i / 4);
      const prog = PROGRESSIONS[spec.mode];
      const [deg, quality] = prog[bar % prog.length] as readonly [number, "maj" | "min"];
      const root = 48 + ((spec.tonic + deg) % 12);
      const barLen = (beats[i + 4] ?? b + 4 * beatLen) - b;
      note(root - 12, b, barLen, 0.09);
      for (const iv of [0, quality === "maj" ? 4 : 3, 7])
        note(root + 12 + iv, b, barLen, 0.05, 0.1);
    }
  });
  return [l, r];
}

/** 32-bit float WAV bytes. */
export function wavBytes(planes: Float32Array[], rate: number): Uint8Array {
  const ch = planes.length;
  const n = planes[0]?.length ?? 0;
  const data = n * ch * 4;
  const buf = new ArrayBuffer(44 + data);
  const v = new DataView(buf);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  v.setUint32(4, 36 + data, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 3, true);
  v.setUint16(22, ch, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * ch * 4, true);
  v.setUint16(32, ch * 4, true);
  v.setUint16(34, 32, true);
  str(36, "data");
  v.setUint32(40, data, true);
  let o = 44;
  for (let i = 0; i < n; i++)
    for (let c = 0; c < ch; c++) {
      v.setFloat32(o, (planes[c] as Float32Array)[i] as number, true);
      o += 4;
    }
  return new Uint8Array(buf);
}

if (process.argv[1]?.endsWith("synth-music.ts")) {
  const [bpm, bpmEnd, tonic, mode, seconds, out] = process.argv.slice(2);
  if (!out) {
    console.error("usage: synth-music.ts <bpm> <bpmEnd> <tonic> <major|minor> <seconds> <out.wav>");
    process.exit(1);
  }
  const planes = synthMusic({
    bpm: Number(bpm),
    bpmEnd: Number(bpmEnd),
    tonic: Number(tonic),
    mode: mode === "major" ? "major" : "minor",
    seconds: Number(seconds),
  });
  writeFileSync(out, wavBytes(planes, 44_100));
}
