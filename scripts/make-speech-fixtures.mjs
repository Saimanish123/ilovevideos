// Synthetic speech and noise for the speech tools (remove background noise, pauses found by speech).
// No recordings and no text-to-speech: a formant voice (band-limited glottal source, time-varying
// formant resonators, fricative and plosive noise) speaks phrases of syllables with known pauses,
// and five noise beds (fan, hiss, traffic, keyboard, music) are drawn from a seeded generator, so
// every file is the same on every machine. Dev-only; nothing here ships.
//
// node scripts/make-speech-fixtures.mjs <outDir> [seconds=20] [seed=1] [rate=48000]
// writes clean.wav, noise-<kind>.wav (each normalised to the same RMS as the speech) and
// speech.json (the speech segments, seconds).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [outDir = "tests/fixtures/speech", secArg = "20", seedArg = "1", rateArg = "48000"] =
  process.argv.slice(2);
const SECONDS = Number(secArg);
const RATE = Number(rateArg);
const N = Math.round(SECONDS * RATE);

/** mulberry32: a small seeded PRNG, so fixtures are identical everywhere. */
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = prng(Number(seedArg) * 7919 + 13);
const gauss = () => {
  const u = Math.max(1e-12, rand());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
};

/** Two-pole resonator (formant), coefficients set per sample. */
class Resonator {
  y1 = 0;
  y2 = 0;
  step(x, f, bw) {
    const r = Math.exp((-Math.PI * bw) / RATE);
    const c = -r * r;
    const b = 2 * r * Math.cos((2 * Math.PI * f) / RATE);
    const a = 1 - b - c;
    const y = a * x + b * this.y1 + c * this.y2;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}
/** One-pole low-pass and high-pass. */
const lowpass = (fc) => {
  const k = Math.exp((-2 * Math.PI * fc) / RATE);
  let y = 0;
  return (x) => {
    y = (1 - k) * x + k * y;
    return y;
  };
};
const highpass = (fc) => {
  const lp = lowpass(fc);
  return (x) => x - lp(x);
};
/** Band-pass by a resonator with unit peak gain. */
const bandpass = (f, bw) => {
  const r = new Resonator();
  return (x) => r.step(x, f, bw);
};

// Vowels: F1, F2, F3 (Hz), adult male averages (Peterson and Barney 1952).
const VOWELS = [
  [730, 1090, 2440],
  [270, 2290, 3010],
  [530, 1840, 2480],
  [660, 1720, 2410],
  [570, 840, 2410],
  [300, 870, 2240],
  [440, 1020, 2240],
  [490, 1350, 1690],
];
// Onsets: kind and noise band.
const ONSETS = [
  { kind: "s", f: 6500, bw: 3000, len: 0.09 },
  { kind: "sh", f: 3000, bw: 1500, len: 0.09 },
  { kind: "f", f: 5000, bw: 5000, len: 0.07 },
  { kind: "t", f: 4000, bw: 3000, len: 0.015 },
  { kind: "k", f: 2000, bw: 1500, len: 0.02 },
  { kind: "p", f: 1000, bw: 1500, len: 0.012 },
  { kind: "m", f: 0, bw: 0, len: 0.06 },
  { kind: "n", f: 0, bw: 0, len: 0.05 },
  { kind: "none", f: 0, bw: 0, len: 0 },
];

// The script: phrases of syllables, pauses between them. Each phrase 0.9 to 3 s; pauses 0.25 to
// 1.6 s, so short breaths and real gaps are both there.
const segments = [];
let t = 0.6;
while (t < SECONDS - 1.2) {
  const len = Math.min(SECONDS - 0.6 - t, 0.9 + rand() * 2.1);
  if (len < 0.5) break;
  segments.push({ start: t, end: t + len });
  t += len + 0.25 + rand() * 1.35;
}

// Syllables inside each phrase.
const syllables = [];
for (const seg of segments) {
  let at = seg.start;
  while (at < seg.end - 0.08) {
    const dur = Math.min(seg.end - at, 0.14 + rand() * 0.18);
    syllables.push({
      start: at,
      end: at + dur,
      vowel: VOWELS[Math.floor(rand() * VOWELS.length)],
      next: VOWELS[Math.floor(rand() * VOWELS.length)],
      onset: ONSETS[Math.floor(rand() * ONSETS.length)],
      stress: 0.6 + rand() * 0.4,
    });
    at += dur;
  }
}

function speech() {
  const out = new Float32Array(N);
  const f1 = new Resonator();
  const f2 = new Resonator();
  const f3 = new Resonator();
  const f4 = new Resonator();
  const fric = new Resonator();
  const nasal = new Resonator();
  let phase = 0;
  let si = 0;
  let jitter = 0;
  const tilt = lowpass(1800);
  for (let i = 0; i < N; i++) {
    const time = i / RATE;
    while (si < syllables.length - 1 && time >= (syllables[si]?.end ?? 0)) si++;
    const s = syllables[si];
    if (!s || time < s.start || time >= s.end) {
      phase = 0;
      continue;
    }
    const seg = segments.find((g) => time >= g.start && time < g.end);
    const pos = seg ? (time - seg.start) / (seg.end - seg.start) : 0;
    // F0: declination over the phrase, a rise on stressed syllables, slow jitter.
    if (i % 480 === 0) jitter = 0.98 * jitter + 0.02 * gauss();
    const f0 = (128 - 28 * pos) * (1 + 0.06 * (s.stress - 0.8)) * (1 + 0.01 * jitter);
    phase += f0 / RATE;
    if (phase >= 1) phase -= 1;
    // Band-limited glottal source: harmonics up to 5 kHz with a −12 dB/octave tilt (lip
    // radiation brings it to about −6 dB/octave), cheaper as a sum than an LF model and alias-free.
    let src = 0;
    const kMax = Math.min(40, Math.floor(5000 / f0));
    for (let k = 1; k <= kMax; k++) src += Math.sin(2 * Math.PI * k * phase) / (k * k);
    src = src + 0.02 * gauss();
    const u = (time - s.start) / (s.end - s.start);
    const onsetEnd = s.onset.len / (s.end - s.start);
    const v = s.vowel;
    const w = s.next;
    const mix = Math.max(0, (u - 0.5) * 2) * 0.6;
    const F1 = v[0] + (w[0] - v[0]) * mix;
    const F2 = v[1] + (w[1] - v[1]) * mix;
    const F3 = v[2] + (w[2] - v[2]) * mix;
    // Envelope: 15 ms attack after the onset, 35 ms release.
    const fromOnset = time - s.start - s.onset.len;
    const toEnd = s.end - time;
    const env = Math.min(1, Math.max(0, fromOnset / 0.015), Math.max(0, toEnd / 0.035));
    let voiced = 0;
    if (u >= onsetEnd || s.onset.kind === "m" || s.onset.kind === "n") {
      const x = src * env * s.stress;
      voiced =
        f1.step(x, F1, 80) * 1.0 +
        f2.step(x, F2, 100) * 0.6 +
        f3.step(x, F3, 140) * 0.3 +
        f4.step(x, 3500, 200) * 0.12;
      if (u < onsetEnd) voiced = nasal.step(src * 0.8, 250, 100) * 0.7;
    }
    let noise = 0;
    if (u < onsetEnd && s.onset.f > 0) {
      const e = Math.min(1, (time - s.start) / 0.008) * Math.min(1, (onsetEnd - u) * 20);
      noise = fric.step(gauss() * e, s.onset.f, s.onset.bw) * 0.5;
    }
    out[i] = tilt(voiced * 4) + noise + voiced * 0.4;
  }
  return normalise(out, 0.1);
}

function normalise(x, rms) {
  let s = 0;
  let n = 0;
  for (const v of x) {
    s += v * v;
    if (v !== 0) n++;
  }
  const r = Math.sqrt(s / Math.max(1, n));
  const g = r > 0 ? rms / r : 1;
  for (let i = 0; i < x.length; i++) x[i] *= g;
  return x;
}
/** Normalises to an RMS over all samples (noise beds are on all the time). */
function normaliseAll(x, rms) {
  let s = 0;
  for (const v of x) s += v * v;
  const r = Math.sqrt(s / x.length);
  for (let i = 0; i < x.length; i++) x[i] *= rms / r;
  return x;
}

function fan() {
  // Broadband rush shaped like a fan: pink-ish below 2 kHz, a blade-pass tone at 96 Hz and
  // harmonics, a slow wobble.
  const out = new Float32Array(N);
  const lp = lowpass(1500);
  const lp2 = lowpass(4000);
  let b = [0, 0, 0];
  for (let i = 0; i < N; i++) {
    const w = gauss();
    b = [0.997 * b[0] + 0.03 * w, 0.95 * b[1] + 0.2 * w, 0.6 * b[2] + 0.5 * w];
    const pink = b[0] + b[1] + b[2] + 0.2 * w;
    const time = i / RATE;
    const wob = 1 + 0.08 * Math.sin(2 * Math.PI * 0.7 * time);
    const tone =
      0.15 * Math.sin(2 * Math.PI * 96 * time) +
      0.07 * Math.sin(2 * Math.PI * 192 * time + 1) +
      0.04 * Math.sin(2 * Math.PI * 288 * time + 2);
    out[i] = (lp(pink) * 1.5 + lp2(pink) * 0.3) * wob + tone;
  }
  return out;
}
function hiss() {
  const out = new Float32Array(N);
  const hp = highpass(300);
  for (let i = 0; i < N; i++) out[i] = hp(gauss());
  return out;
}
function traffic() {
  // A low rumble with cars passing: each pass a 3 to 6 s swell of low-passed noise and a little
  // tyre noise, over a steady distant road.
  const out = new Float32Array(N);
  const lp = lowpass(300);
  const lpT = lowpass(2500);
  const hpT = highpass(600);
  const passes = [];
  for (let at = rand() * 2; at < SECONDS; at += 2 + rand() * 4)
    passes.push({ at, len: 3 + rand() * 3, gain: 0.5 + rand() });
  for (let i = 0; i < N; i++) {
    const time = i / RATE;
    let g = 0.35;
    for (const p of passes) {
      const x = (time - p.at) / p.len;
      if (x > 0 && x < 1) g += p.gain * Math.sin(Math.PI * x) ** 2;
    }
    const w = gauss();
    out[i] = lp(w) * 6 * g + hpT(lpT(w)) * 0.25 * g;
  }
  return out;
}
function keyboard() {
  // Typing: bursts of 3 to 12 key presses at 6 to 10 per second, each a click of 4 to 12 ms
  // (band-passed noise with a resonance near 2 to 4 kHz) and a softer release 80 ms later.
  const out = new Float32Array(N);
  const hits = [];
  for (let at = rand(); at < SECONDS - 0.2; ) {
    const n = 3 + Math.floor(rand() * 10);
    for (let k = 0; k < n && at < SECONDS - 0.2; k++) {
      hits.push({
        at,
        f: 2000 + rand() * 2000,
        len: 0.004 + rand() * 0.008,
        gain: 0.6 + rand() * 0.6,
      });
      hits.push({ at: at + 0.08, f: 1500 + rand() * 1500, len: 0.004, gain: 0.25 });
      at += 0.1 + rand() * 0.07;
    }
    at += 0.4 + rand() * 1.8;
  }
  for (const h of hits) {
    const bp = bandpass(h.f, 1200);
    const i0 = Math.round(h.at * RATE);
    const n = Math.round(h.len * 4 * RATE);
    for (let i = 0; i < n && i0 + i < N; i++) {
      const e = Math.exp(-i / (h.len * RATE));
      out[i0 + i] += bp(gauss() * e * h.gain * 8);
    }
  }
  return out;
}
function music() {
  // A music bed: chords on a decaying harmonic tone every 2 beats at 100 bpm, a bass note and a
  // soft kick on every beat.
  const out = new Float32Array(N);
  const beat = 0.6;
  const chords = [
    [220, 277.18, 329.63],
    [196, 246.94, 293.66],
    [174.61, 220, 261.63],
    [196, 246.94, 329.63],
  ];
  for (let b = 0; b * beat < SECONDS; b++) {
    const i0 = Math.round(b * beat * RATE);
    const chord = chords[Math.floor(b / 2) % chords.length];
    for (let i = 0; i < Math.round(beat * 2 * RATE) && i0 + i < N; i++) {
      const tt = i / RATE;
      let x = 0;
      if (b % 2 === 0)
        for (const f of chord)
          for (let k = 1; k <= 6; k++)
            x += (Math.sin(2 * Math.PI * f * k * tt) / k) * Math.exp(-tt * (1.5 + k * 0.6));
      x +=
        0.8 *
        Math.sin(2 * Math.PI * (chord[0] / 2) * tt) *
        Math.exp(-tt * 2) *
        (b % 2 === 0 ? 1 : 0);
      if (tt < 0.25) x += 1.5 * Math.sin(2 * Math.PI * (60 - 80 * tt) * tt) * Math.exp(-tt * 25);
      out[i0 + i] += x * 0.3;
    }
  }
  return out;
}

function wav(samples) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++)
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
  return buf;
}

mkdirSync(outDir, { recursive: true });
const clean = speech();
writeFileSync(join(outDir, "clean.wav"), wav(clean));
// Each bed at the speech's RMS over the whole file (0 dB): mixes set their own SNR.
let speechRms = 0;
let active = 0;
for (const v of clean)
  if (v !== 0) {
    speechRms += v * v;
    active++;
  }
speechRms = Math.sqrt(speechRms / Math.max(1, active));
for (const [kind, make] of Object.entries({ fan, hiss, traffic, keyboard, music }))
  writeFileSync(join(outDir, `noise-${kind}.wav`), wav(normaliseAll(make(), speechRms)));
writeFileSync(
  join(outDir, "speech.json"),
  `${JSON.stringify({ rate: RATE, seconds: SECONDS, speechRms, segments }, null, 2)}\n`,
);
console.log(
  `make-speech-fixtures: ${SECONDS} s at ${RATE} Hz, ${segments.length} phrases, ${syllables.length} syllables → ${outDir}`,
);
