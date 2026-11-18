/**
 * Channel downmix with a published matrix, scaled so the result cannot clip. Used wherever a sound
 * loses channels: stereo to mono, a 5.1 source written as MP3 or Opus (two channels at most), a
 * WebM whose Opus encoder takes two. The ffmpeg path gets the same numbers as a `pan` filter, so the
 * native and ffmpeg routes write the same samples and the shown command is exact.
 *
 * The weights are ITU-R BS.775 Table 2 (3/2 to 2/0 and 1/0): stereo is L + 0.7071 C + 0.7071 Ls
 * (and the mirror for R), mono is 0.7071 L + 0.7071 R + C + 0.5 Ls + 0.5 Rs. In words: for stereo
 * the centre and the surrounds come in 3 dB down; for mono left and right are 3 dB under the centre
 * and the surrounds 6 dB under it. The LFE channel is left out, as BS.775 does. Each output row is
 * then divided by the sum of its weights, so a full-scale sound in every channel stays at full scale
 * and never above it. Stereo to mono is therefore the plain average of left and right.
 *
 * Measured (2026-10-08): mediabunny's own remix (Web Audio's speaker rules) sums 5.1 to mono with
 * weights adding to 3.41, unscaled, so a 5.1 WAV at −6 dBFS per channel came out hard-clipped (86 640
 * of 144 001 samples at full scale).
 *
 * Channel order is the one WAV, FLAC, Opus mapping family 1 and ffmpeg's defaults use for 5.1 and 7.1
 * (FL FR FC LFE then the surrounds). Three channels are taken as L R C, four as quad (L R Ls Rs), five
 * as 5.0, seven as 6.1; above eight, mono is the average and stereo averages odd and even channels.
 * Pure: no DOM, no mediabunny.
 */

type Speaker = "FL" | "FR" | "FC" | "LFE" | "BL" | "BR" | "BC" | "SL" | "SR";

const LAYOUTS: Record<number, readonly Speaker[]> = {
  2: ["FL", "FR"],
  3: ["FL", "FR", "FC"],
  4: ["FL", "FR", "BL", "BR"],
  5: ["FL", "FR", "FC", "BL", "BR"],
  6: ["FL", "FR", "FC", "LFE", "BL", "BR"],
  7: ["FL", "FR", "FC", "LFE", "BC", "SL", "SR"],
  8: ["FL", "FR", "FC", "LFE", "BL", "BR", "SL", "SR"],
};

const H = Math.SQRT1_2;

/** BS.775 weights before scaling: mono, and the left output of stereo (right mirrors it). */
const MONO: Record<Speaker, number> = {
  FL: H,
  FR: H,
  FC: 1,
  LFE: 0,
  BL: 0.5,
  BR: 0.5,
  BC: 0.5,
  SL: 0.5,
  SR: 0.5,
};
const LEFT: Record<Speaker, number> = {
  FL: 1,
  FR: 0,
  FC: H,
  LFE: 0,
  BL: H,
  BR: 0,
  BC: 0.5,
  SL: H,
  SR: 0,
};
const mirror: Record<Speaker, Speaker> = {
  FL: "FR",
  FR: "FL",
  FC: "FC",
  LFE: "LFE",
  BL: "BR",
  BR: "BL",
  BC: "BC",
  SL: "SR",
  SR: "SL",
};

const scaled = (row: number[]) => {
  const sum = row.reduce((s, w) => s + Math.abs(w), 0);
  return sum > 0 ? row.map((w) => w / sum) : row;
};

/**
 * Weights `[out][in]` taking `inCh` channels to `outCh` (1 or 2 when fewer; mono to stereo copies
 * the channel to both). Every row's weights add up to 1 when channels are mixed, so it cannot clip.
 */
export function downmixMatrix(inCh: number, outCh: number): number[][] {
  if (inCh === outCh)
    return Array.from({ length: outCh }, (_, o) =>
      Array.from({ length: inCh }, (_, i) => (i === o ? 1 : 0)),
    );
  if (inCh === 1) return Array.from({ length: outCh }, () => [1]);
  if (outCh !== 1 && outCh !== 2) throw new Error(`No downmix from ${inCh} to ${outCh} channels.`);
  const layout = LAYOUTS[inCh];
  if (!layout) {
    if (outCh === 1) return [Array.from({ length: inCh }, () => 1 / inCh)];
    return [0, 1].map((side) =>
      scaled(Array.from({ length: inCh }, (_, i) => (i % 2 === side ? 1 : 0))),
    );
  }
  if (outCh === 1) return [scaled(layout.map((s) => MONO[s]))];
  return [scaled(layout.map((s) => LEFT[s])), scaled(layout.map((s) => LEFT[mirror[s]]))];
}

/** Planar blocks remixed with `downmixMatrix`; returns the input itself when nothing changes. */
export function downmix(planes: Float32Array[], outCh: number): Float32Array[] {
  const inCh = planes.length;
  if (inCh === outCh) return planes;
  const frames = planes[0]?.length ?? 0;
  const m = downmixMatrix(inCh, outCh);
  return m.map((row) => {
    const out = new Float32Array(frames);
    for (let c = 0; c < inCh; c++) {
      const w = row[c] ?? 0;
      const p = planes[c];
      if (w === 0 || !p) continue;
      for (let i = 0; i < frames; i++) out[i] = (out[i] ?? 0) + w * (p[i] ?? 0);
    }
    return out;
  });
}

/**
 * The same mix as an ffmpeg `pan` filter, e.g. `pan=mono|c0=0.5*c0+0.5*c1`; undefined when the
 * channel count does not change. Gains given with `=` are applied as written (no renormalising).
 */
export function panFilter(inCh: number, outCh: number): string | undefined {
  if (inCh === outCh) return undefined;
  const m = downmixMatrix(inCh, outCh);
  const layout = outCh === 1 ? "mono" : outCh === 2 ? "stereo" : `${outCh}c`;
  const rows = m.map((row, o) => {
    const terms = row
      .map((w, i) => (w === 0 ? "" : w === 1 ? `c${i}` : `${Number(w.toFixed(6))}*c${i}`))
      .filter(Boolean);
    return `c${o}=${terms.join("+")}`;
  });
  return `pan=${layout}|${rows.join("|")}`;
}

/**
 * What the mix does, for the result line: "left and right averaged" for stereo to mono, the BS.775
 * wording for more channels; undefined when the channel count does not drop.
 */
export function downmixWords(inCh: number, outCh: number): string | undefined {
  if (outCh >= inCh) return undefined;
  if (inCh === 2) return "left and right averaged";
  const layout = LAYOUTS[inCh];
  if (!layout) return `all ${inCh} channels averaged`;
  const lfe = layout.includes("LFE") ? ", LFE left out" : "";
  return outCh === 1
    ? `mixed down from ${inCh} channels by ITU-R BS.775 (centre full, left and right −3 dB, surrounds −6 dB${lfe}), scaled so it cannot clip`
    : `mixed down from ${inCh} channels by ITU-R BS.775 (centre and surrounds −3 dB into each side${lfe}), scaled so it cannot clip`;
}
