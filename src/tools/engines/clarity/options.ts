/**
 * Sharpen and denoise (feature G6): the options and every number the preview, the worker and the
 * ffmpeg command share (ADR-0035's rule: one source for both). Pure; safe to import on the page.
 *
 * Denoise is a spatio-temporal non-local means: each pixel becomes a weighted average of the pixels
 * within 2 px of it in this frame and in the previous cleaned frame, weighted by how alike their
 * 3×3 neighbourhoods are in brightness. The filtering strength follows the grain measured in the
 * video (`noise`, in 8-bit levels of brightness), so the same preset suits a clean phone clip and
 * a dark, grainy one. Measured on a fixture with added grain (ADR-0081): above FFmpeg's `hqdn3d` at
 * its best settings and level with or above `nlmeans`.
 *
 * Sharpen is an unsharp mask on brightness only (no colour fringes), with small changes (grain)
 * left alone and each result held within its 3×3 neighbourhood's range plus a margin, which keeps
 * the bright and dark halos of a plain unsharp mask away from edges.
 */
import { z } from "zod";
import { shellQuote } from "@/lib/format";

export const clarityJobs = ["sharpen", "denoise"] as const;
export type ClarityJob = (typeof clarityJobs)[number];

export const ClarityOptions = z.object({
  job: z.enum(clarityJobs).default("denoise"),
  /** 0.25–3: sharpen amount, or denoise strength relative to the measured grain. */
  strength: z.number().min(0.1).max(3).default(1),
  /** Sharpen only: the size of detail it lifts, the Gaussian sigma in pixels. */
  radius: z.number().min(0.5).max(4).default(1),
  /**
   * Denoise only: the grain's standard deviation in 8-bit brightness levels, measured on the page
   * (`estimateNoise`) so the preview and the file agree. Absent: measured again in the worker.
   */
  noise: z.number().min(0).max(64).optional(),
});
export type ClarityOptions = z.infer<typeof ClarityOptions>;

export interface Preset {
  value: number;
  label: string;
}

/** Strength presets per job; the slider covers the range between and beyond them. */
export const strengthPresets: Record<ClarityJob, readonly Preset[]> = {
  sharpen: [
    { value: 0.8, label: "Light" },
    { value: 1.5, label: "Medium" },
    { value: 2.5, label: "Strong" },
  ],
  denoise: [
    { value: 0.7, label: "Light" },
    { value: 1, label: "Medium" },
    { value: 1.4, label: "Strong" },
  ],
};

export const defaultStrength = (job: ClarityJob) => (job === "sharpen" ? 1.5 : 1);

/** Strength slider range per job. */
export const strengthRange: Record<ClarityJob, { min: number; max: number }> = {
  sharpen: { min: 0.2, max: 3 },
  denoise: { min: 0.3, max: 2.5 },
};

export const radiusPresets: readonly Preset[] = [
  { value: 0.7, label: "Fine" },
  { value: 1, label: "Medium" },
  { value: 1.8, label: "Coarse" },
];

/** Sharpen: changes smaller than this (8-bit levels) are scaled down, so grain is not lifted. */
export const SHARPEN_CORE = 2.5;
/** Sharpen: how far a result may go past its 3×3 neighbourhood's range (8-bit levels). */
export const SHARPEN_LIMIT = 10;
/** Denoise: search radius (px) in this frame and the previous cleaned one; patch radius. */
export const SEARCH = 2;
export const PATCH = 1;
/** Denoise: grain below this (levels) is treated as this, so a clean video is left nearly as it is. */
export const MIN_NOISE = 0.8;

/** The Gaussian kernel's half width for a radius, in taps (3 sigma, at most 12). */
export const kernelRadius = (sigma: number) => Math.min(12, Math.max(1, Math.ceil(sigma * 3)));

/** The strength preset's name when the value is one, else a percentage of Medium. */
export function strengthWord(job: ClarityJob, strength: number): string {
  const p = strengthPresets[job].find((q) => Math.abs(q.value - strength) < 0.001);
  if (p) return p.label.toLowerCase();
  return `${Math.round((strength / defaultStrength(job)) * 100)}%`;
}

/**
 * Grain in a picture, as the standard deviation of 8-bit brightness, by Immerkær's method (the
 * response to a 3×3 operator that cancels smooth shading and straight edges) over the flatter half
 * of the picture, so texture and edges are not counted as grain. `rgba` is a canvas's pixel data.
 * Reads at most the middle 512×512 pixels; grain has the same size anywhere in the frame.
 */
export function estimateNoise(rgba: Uint8ClampedArray, width: number, height: number): number {
  const w = Math.min(width, 512);
  const h = Math.min(height, 512);
  if (w < 8 || h < 8) return 0;
  const x0 = Math.floor((width - w) / 2);
  const y0 = Math.floor((height - h) / 2);
  const y = new Float32Array(w * h);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const k = ((y0 + j) * width + x0 + i) * 4;
      y[j * w + i] =
        0.299 * (rgba[k] ?? 0) + 0.587 * (rgba[k + 1] ?? 0) + 0.114 * (rgba[k + 2] ?? 0);
    }
  const n = (w - 2) * (h - 2);
  const resp = new Float32Array(n);
  const grad = new Float32Array(n);
  let m = 0;
  for (let j = 1; j < h - 1; j++)
    for (let i = 1; i < w - 1; i++) {
      const c = j * w + i;
      const v = (o: number) => y[c + o] as number;
      resp[m] = Math.abs(
        v(-w - 1) -
          2 * v(-w) +
          v(-w + 1) -
          2 * v(-1) +
          4 * v(0) -
          2 * v(1) +
          v(w - 1) -
          2 * v(w) +
          v(w + 1),
      );
      grad[m] = Math.abs(v(1) - v(-1)) + Math.abs(v(w) - v(-w));
      m++;
    }
  const cut = Float32Array.from(grad).sort()[Math.floor(n / 2)] ?? 0;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < n; i++)
    if ((grad[i] as number) <= cut) {
      sum += resp[i] as number;
      count++;
    }
  // Saturated areas (pure black or white, no grain left) count as flat but carry none: they only
  // lower the figure, which errs on the side of filtering less.
  return count ? (Math.sqrt(Math.PI / 2) * sum) / (6 * count) : 0;
}

/** The median of several frames' grain: one dark or flat frame does not decide it. */
export const medianNoise = (values: number[]): number => {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return 0;
  const mid = v.length >> 1;
  return v.length % 2 ? (v[mid] as number) : ((v[mid - 1] as number) + (v[mid] as number)) / 2;
};

/** The non-local means filtering parameter h, in 0–1 units, from the grain and the strength. */
export const denoiseH = (noise: number, strength: number) =>
  (strength * Math.max(MIN_NOISE, noise)) / 255;

/** "Grain 3.2 levels" for the status line: the measured standard deviation in 8-bit levels. */
export const noiseWords = (noise: number) =>
  noise < 1 ? "little grain" : `grain ${noise.toFixed(1)} levels`;

/** Words for the status and result lines: "medium sharpening", "light denoise". */
export function jobWords(o: ClarityOptions): string {
  const s = strengthWord(o.job, o.strength);
  return o.job === "sharpen" ? `${s} sharpening` : `${s} noise reduction`;
}

/**
 * The closest FFmpeg filter: `unsharp` on brightness for sharpening (it has neither the halo limit
 * nor the grain threshold), `nlmeans` with the same 3×3 patch and 5×5 search for noise (spatial
 * only; FFmpeg's has no temporal part). Its strength `s` was matched by measurement: for grain of
 * σ levels, s ≈ 0.7σ gave FFmpeg's best result on the fixtures.
 */
export function clarityFilter(o: ClarityOptions): string {
  if (o.job === "sharpen") {
    const size = Math.min(23, Math.max(3, 2 * kernelRadius(o.radius) + 1));
    return `unsharp=luma_msize_x=${size}:luma_msize_y=${size}:luma_amount=${o.strength.toFixed(2)}:chroma_amount=0`;
  }
  const s = Math.min(30, Math.max(1, 0.7 * o.strength * Math.max(MIN_NOISE, o.noise ?? 0)));
  return `nlmeans=s=${s.toFixed(1)}:p=3:r=5`;
}

export function clarityCommand(
  input: string,
  output: string,
  vf: string,
  kbps: number,
  audio: "copy" | "aac" | "none",
): string {
  const a = audio === "none" ? "-an" : audio === "copy" ? "-c:a copy" : "-c:a aac -b:a 128k";
  return `ffmpeg -i ${shellQuote(input)} -vf "${vf}" -c:v libx264 -b:v ${kbps}k -pix_fmt yuv420p ${a} -movflags +faststart ${shellQuote(output)}`;
}
