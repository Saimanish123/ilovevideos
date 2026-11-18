/**
 * Freeze frame: options, the hold plan and the ffmpeg command, shared by the panel, the timeline and
 * the engine so they agree on every frame and second. Pure; safe to import on the page.
 *
 * A hold names a moment; the frame shown at that moment (the last frame starting at or before it)
 * is held. Two ways to hold it:
 * - `pause`: the video stops on the frame for `seconds`, in silence, then goes on from the next
 *   frame. The output is longer by the holds.
 * - `over`: the picture stops on the frame for `seconds` while the sound plays on; the frames under
 *   the hold are replaced. The output keeps the source's length and its sound, copied.
 */
import { z } from "zod";
import { formatTimecode, shellQuote, withUnit } from "@/lib/format";

export const MAX_HOLDS = 20;
export const MIN_HOLD = 0.1;
export const MAX_HOLD = 30;
export const DEFAULT_HOLD = 2;

export const Hold = z.object({
  /** Page time of the moment whose frame is held (seconds from the file's start). */
  at: z.number().min(0),
  seconds: z.number().min(MIN_HOLD).max(MAX_HOLD),
});
export type Hold = z.infer<typeof Hold>;

export const FreezeOptions = z.object({
  holds: z.array(Hold).min(1, "Add a hold first.").max(MAX_HOLDS),
  mode: z.enum(["pause", "over"]).default("pause"),
});
export type FreezeOptions = z.infer<typeof FreezeOptions>;

export interface PlannedHold {
  /** Index of the held frame among the frames in presentation order. */
  frame: number;
  /** Its presentation time (page seconds). */
  frameTime: number;
  /** Where the hold starts in source time: the end of the held frame. */
  from: number;
  seconds: number;
}

/** Index of the frame shown at `t`: the last one starting at or before it (the first frame before it). */
export function frameAt(times: readonly number[], t: number): number {
  let lo = 0;
  let hi = times.length - 1;
  let found = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((times[mid] ?? 0) <= t + 1e-6) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/**
 * The holds as they will be made, in order: each on a real frame, ending where that frame ends. Two
 * holds on one frame become one, their seconds added (capped at MAX_HOLD).
 */
export function planHolds(
  holds: readonly Hold[],
  times: readonly number[],
  duration: number,
): PlannedHold[] {
  if (times.length === 0) return [];
  const byFrame = new Map<number, number>();
  for (const h of holds) {
    const i = frameAt(times, Math.min(h.at, duration));
    byFrame.set(i, Math.min(MAX_HOLD, (byFrame.get(i) ?? 0) + h.seconds));
  }
  return [...byFrame.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([frame, seconds]) => ({
      frame,
      frameTime: times[frame] ?? 0,
      from: Math.min(duration, times[frame + 1] ?? duration),
      seconds,
    }));
}

/** Frame times of a constant-rate picture, for the page, which has no packet list (`planHolds`). */
export function gridTimes(duration: number, fps: number): number[] {
  const f = fps > 0 && Number.isFinite(fps) ? fps : 30;
  const n = Math.max(1, Math.ceil(duration * f - 1e-6));
  return Array.from({ length: n }, (_, i) => i / f);
}

/** Seconds the output lasts. */
export function outputLength(
  planned: readonly PlannedHold[],
  duration: number,
  mode: FreezeOptions["mode"],
) {
  return mode === "pause" ? duration + planned.reduce((s, h) => s + h.seconds, 0) : duration;
}

/**
 * Over mode: the held frame for source time `t`, or undefined when `t` is not under a hold. A hold
 * covers [from, from + seconds); a later hold wins where two overlap. Pure, so the preview and the
 * engine agree.
 */
export function heldFrameAt(planned: readonly PlannedHold[], t: number): number | undefined {
  let held: number | undefined;
  for (const h of planned) if (t >= h.from - 1e-6 && t < h.from + h.seconds - 1e-6) held = h.frame;
  return held;
}

/** Output time of source time `t` in pause mode: later by the holds that start at or before it. */
export function pausedTime(planned: readonly PlannedHold[], t: number): number {
  let add = 0;
  for (const h of planned) if (h.from <= t + 1e-6) add += h.seconds;
  return t + add;
}

const s = (n: number) => withUnit(Number(n.toFixed(2)), "s");

/** "2 s at 0:01.50" lines for the result, in order. */
export function holdWords(planned: readonly PlannedHold[]): string {
  const parts = planned.map((h) => `${s(h.seconds)} at ${formatTimecode(h.frameTime)}`);
  return parts.length <= 3
    ? parts.join(", ")
    : `${parts.slice(0, 3).join(", ")} and ${parts.length - 3} more`;
}

/**
 * The ffmpeg command that makes the same file. Pause: one `loop` per hold, the last frame first so
 * the earlier frame numbers stay right, then constant timestamps; the sound is cut at each hold and
 * silence put between with `concat`. Over: one `freezeframes` per hold, sound copied.
 */
export function freezeCommand(o: {
  input: string;
  output: string;
  planned: readonly PlannedHold[];
  mode: FreezeOptions["mode"];
  fps: number;
  kbps: number;
  duration: number;
  sound?: { rate: number; channels: number };
  evenCrop?: string;
}): string {
  const fps = Number(o.fps.toFixed(3));
  const crop = o.evenCrop ? `${o.evenCrop},` : "";
  if (o.mode === "over") {
    // freezeframes takes the replacement from its second input: one copy of the picture per hold.
    const k = o.planned.length;
    const refs = o.planned.map((_, i) => `[r${i}]`).join("");
    const steps = o.planned.map((h, i) => {
      const n = Math.max(1, Math.round(h.seconds * fps));
      const into = i === 0 ? "[m]" : `[f${i - 1}]`;
      const out = i === k - 1 ? "[v]" : `[f${i}]`;
      return `${into}[r${i}]freezeframes=first=${h.frame + 1}:last=${h.frame + n}:replace=${h.frame}${out}`;
    });
    const graph = `[0:v]${crop}split=${k + 1}[m]${refs};${steps.join(";")}`;
    const a = o.sound ? "-map 0:a -c:a copy" : "";
    return `ffmpeg -i ${shellQuote(o.input)} -filter_complex "${graph}" -map "[v]" ${a}${a ? " " : ""}-c:v libx264 -b:v ${o.kbps}k -pix_fmt yuv420p -movflags +faststart ${shellQuote(o.output)}`;
  }
  const loops = [...o.planned]
    .reverse()
    .map((h) => `loop=loop=${Math.max(1, Math.round(h.seconds * fps))}:size=1:start=${h.frame}`)
    .join(",");
  const v = `[0:v]${crop}${loops},setpts=N/(${fps}*TB)[v]`;
  if (!o.sound) {
    return `ffmpeg -i ${shellQuote(o.input)} -filter_complex "${v}" -map "[v]" -c:v libx264 -b:v ${o.kbps}k -pix_fmt yuv420p -movflags +faststart ${shellQuote(o.output)}`;
  }
  const layout = o.sound.channels === 1 ? "mono" : "stereo";
  const pieces: string[] = [];
  const labels: string[] = [];
  let start = 0;
  o.planned.forEach((h, i) => {
    pieces.push(`[0:a]atrim=${start}:${h.from},asetpts=PTS-STARTPTS[a${i}]`);
    pieces.push(`aevalsrc=0:c=${layout}:s=${o.sound?.rate}:d=${h.seconds}[s${i}]`);
    labels.push(`[a${i}]`, `[s${i}]`);
    start = h.from;
  });
  const last = o.planned.length;
  if (start < o.duration - 1e-3) {
    pieces.push(`[0:a]atrim=${start},asetpts=PTS-STARTPTS[a${last}]`);
    labels.push(`[a${last}]`);
  }
  const a = `${pieces.join(";")};${labels.join("")}concat=n=${labels.length}:v=0:a=1[a]`;
  return `ffmpeg -i ${shellQuote(o.input)} -filter_complex "${v};${a}" -map "[v]" -map "[a]" -c:v libx264 -b:v ${o.kbps}k -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart ${shellQuote(o.output)}`;
}
