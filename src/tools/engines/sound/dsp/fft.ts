/**
 * Real FFT of a power-of-two size, built on a complex radix-2 FFT of half the size (the usual
 * even/odd packing). Used by the pitch shifter's phase vocoder and by the key and tempo analysis.
 * Tables are computed once per size; the transform allocates nothing. Pure: no DOM, no mediabunny.
 */

export class RealFft {
  readonly size: number;
  private readonly half: number;
  private readonly cos: Float64Array;
  private readonly sin: Float64Array;
  /** Twiddles of the full size for the packing step: e^{-2πik/N}, k < N/2. */
  private readonly pcos: Float64Array;
  private readonly psin: Float64Array;
  private readonly rev: Uint32Array;
  readonly zr: Float64Array;
  readonly zi: Float64Array;

  constructor(size: number) {
    if (size < 4 || (size & (size - 1)) !== 0) throw new Error("FFT size must be a power of two");
    this.size = size;
    const m = size / 2;
    this.half = m;
    this.cos = new Float64Array(m / 2);
    this.sin = new Float64Array(m / 2);
    for (let k = 0; k < m / 2; k++) {
      this.cos[k] = Math.cos((2 * Math.PI * k) / m);
      this.sin[k] = -Math.sin((2 * Math.PI * k) / m);
    }
    this.pcos = new Float64Array(m);
    this.psin = new Float64Array(m);
    for (let k = 0; k < m; k++) {
      this.pcos[k] = Math.cos((2 * Math.PI * k) / size);
      this.psin[k] = -Math.sin((2 * Math.PI * k) / size);
    }
    const bits = Math.log2(m);
    this.rev = new Uint32Array(m);
    for (let i = 0; i < m; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      this.rev[i] = r;
    }
    this.zr = new Float64Array(m);
    this.zi = new Float64Array(m);
  }

  /** In-place complex FFT of `zr`/`zi` (length N/2); `inverse` uses conjugate twiddles, unscaled. */
  private complex(inverse: boolean) {
    const { zr, zi, rev, cos, sin } = this;
    const m = this.half;
    for (let i = 0; i < m; i++) {
      const j = rev[i] as number;
      if (j > i) {
        const tr = zr[i] as number;
        zr[i] = zr[j] as number;
        zr[j] = tr;
        const ti = zi[i] as number;
        zi[i] = zi[j] as number;
        zi[j] = ti;
      }
    }
    const sign = inverse ? -1 : 1;
    for (let len = 2; len <= m; len <<= 1) {
      const halfLen = len >> 1;
      const step = m / len;
      for (let i = 0; i < m; i += len) {
        for (let k = 0; k < halfLen; k++) {
          const wr = cos[k * step] as number;
          const wi = sign * (sin[k * step] as number);
          const a = i + k;
          const b = a + halfLen;
          const br = zr[b] as number;
          const bi = zi[b] as number;
          const tr = br * wr - bi * wi;
          const ti = br * wi + bi * wr;
          const ar = zr[a] as number;
          const ai = zi[a] as number;
          zr[b] = ar - tr;
          zi[b] = ai - ti;
          zr[a] = ar + tr;
          zi[a] = ai + ti;
        }
      }
    }
  }

  /**
   * Spectrum of `input` (length N): bins 0..N/2 into `re` and `im` (length N/2 + 1). Unscaled, so a
   * full-scale sine of amplitude A at a bin centre reads A·N/2 there (before any window).
   */
  forward(input: ArrayLike<number>, re: Float64Array, im: Float64Array) {
    const m = this.half;
    const { zr, zi, pcos, psin } = this;
    for (let n = 0; n < m; n++) {
      zr[n] = input[2 * n] as number;
      zi[n] = input[2 * n + 1] as number;
    }
    this.complex(false);
    re[0] = (zr[0] as number) + (zi[0] as number);
    im[0] = 0;
    re[m] = (zr[0] as number) - (zi[0] as number);
    im[m] = 0;
    for (let k = 1; k < m; k++) {
      const ar = zr[k] as number;
      const ai = zi[k] as number;
      const br = zr[m - k] as number;
      const bi = -(zi[m - k] as number);
      // Even part (Z[k] + conj Z[M−k]) / 2, odd part (Z[k] − conj Z[M−k]) / 2i.
      const er = (ar + br) / 2;
      const ei = (ai + bi) / 2;
      const or = (ai - bi) / 2;
      const oi = -(ar - br) / 2;
      const wr = pcos[k] as number;
      const wi = psin[k] as number;
      re[k] = er + (or * wr - oi * wi);
      im[k] = ei + (or * wi + oi * wr);
    }
  }

  /** Inverse of `forward`, scaled by 1/N, into `out` (length N). `re`/`im` hold bins 0..N/2. */
  inverse(re: Float64Array, im: Float64Array, out: Float32Array | Float64Array) {
    const m = this.half;
    const { zr, zi, pcos, psin } = this;
    for (let k = 0; k < m; k++) {
      const ar = re[k] as number;
      const ai = im[k] as number;
      const br = re[m - k] as number;
      const bi = -(im[m - k] as number);
      // Xe = (X[k] + conj X[M−k]) / 2, Xo = (X[k] − conj X[M−k]) / 2 · e^{+2πik/N}.
      const er = (ar + br) / 2;
      const ei = (ai + bi) / 2;
      const dr = (ar - br) / 2;
      const di = (ai - bi) / 2;
      const wr = pcos[k] as number;
      const wi = -(psin[k] as number);
      const or = dr * wr - di * wi;
      const oi = dr * wi + di * wr;
      // Z = Xe + i·Xo.
      zr[k] = er - oi;
      zi[k] = ei + or;
    }
    this.complex(true);
    const scale = 1 / m;
    for (let n = 0; n < m; n++) {
      out[2 * n] = (zr[n] as number) * scale;
      out[2 * n + 1] = (zi[n] as number) * scale;
    }
  }
}

/** Periodic Hann window of length `n` (sums to a constant at hops of n/4, n/8...). */
export function hann(n: number): Float64Array {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  return w;
}
