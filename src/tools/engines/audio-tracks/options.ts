/**
 * Select audio tracks (E10): options and pure helpers, shared by the panel and the engine. Pure.
 * `keep` lists the sound tracks to keep by their position in the file (0-based, in file order);
 * `primary` is the one players should pick, written first and marked default.
 */
import { z } from "zod";
import { shellQuote } from "@/lib/format";

export const AudioTracksOptions = z
  .object({
    keep: z.array(z.number().int().min(0)).min(1),
    primary: z.number().int().min(0),
  })
  .refine((o) => o.keep.includes(o.primary), {
    message: "The main track must be one of those kept",
  });
export type AudioTracksOptions = z.infer<typeof AudioTracksOptions>;

/** Kept tracks in output order: the main one first, the rest as they were in the file. */
export const outputOrder = (o: AudioTracksOptions) => [
  o.primary,
  ...[...new Set(o.keep)].filter((i) => i !== o.primary).sort((a, b) => a - b),
];

/** `ffmpeg -i in.mkv -map 0:v -map 0:a:1 -map 0:a:0 -c copy -disposition:a:0 default …`. */
export function tracksCommand(
  inputName: string,
  outputName: string,
  o: AudioTracksOptions,
): string {
  const order = outputOrder(o);
  const maps = order.map((i) => `-map 0:a:${i}`).join(" ");
  const disp = order.map((_, k) => `-disposition:a:${k} ${k === 0 ? "default" : "0"}`).join(" ");
  return `ffmpeg -i ${shellQuote(inputName)} -map 0:v ${maps} -c copy ${disp} ${shellQuote(outputName)}`;
}
