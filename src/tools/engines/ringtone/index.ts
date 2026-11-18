/**
 * Ringtone maker (E11): a part of a song or of a video's sound, faded in and out, optionally
 * brought to −14 LUFS, written as an iPhone ringtone (AAC in MPEG-4, named .m4r) or for Android (MP3
 * or Ogg Vorbis). The worker half: reads only the chosen part (../sound/render with one span),
 * shapes it with the shared chain and encodes AAC natively, or writes float WAV for the page's
 * ffmpeg stage (./page). Runs in the engine worker; no network access.
 */
import { withUnit } from "@/lib/format";
import { EngineError } from "../errors";
import { openInput } from "../mediabunny/shared";
import { fadeFilter, fitFades } from "../sound/dsp/fade";
import { LoudnessMeter } from "../sound/dsp/loudness";
import { channelsName, codecFact } from "../sound/facts";
import { buildChain } from "../sound/processor";
import { openSound, readSound } from "../sound/reader";
import { renderSound } from "../sound/render";
import type { SoundTarget } from "../sound/target";
import type { Engine, EngineContext } from "../types";
import {
  fitPart,
  RINGTONE_CEILING_DB,
  RINGTONE_KBPS,
  RINGTONE_LUFS,
  RingtoneOptions,
  ringtoneFormat,
  ringtoneName,
} from "./options";

export { RingtoneOptions } from "./options";

/** Integrated loudness of one part of the sound (LUFS), read on its own. */
async function partLoudness(file: File, start: number, end: number, ctx: EngineContext) {
  const input = openInput(file);
  try {
    const src = await openSound(input, file);
    if (!src) throw new EngineError("unsupported-input", "This file has no sound track.");
    const meter = new LoudnessMeter(src.sampleRate, src.channels);
    const from = src.origin + start;
    const to = Math.min(src.end, src.origin + end);
    for await (const b of readSound(src, from, to, ctx.signal)) {
      meter.push(b.planes, b.frames);
      ctx.onProgress({
        phase: "analyzing",
        ratio: 0.3 * Math.min(1, (b.time - from) / Math.max(1e-6, to - from)),
        detail: "Measuring the loudness",
      });
    }
    return meter.result().integrated;
  } finally {
    input.dispose();
  }
}

/** The ffmpeg `-af` chain equal to what the worker does (fades, gain, limiter). */
export function ringtoneFilter(
  o: { start: number; end: number; fadeIn: number; fadeOut: number },
  gainDb: number | undefined,
): string {
  const seconds = o.end - o.start;
  const fades = fadeFilter(
    fitFades({ fadeIn: o.fadeIn, fadeOut: o.fadeOut, curve: "smooth" }, seconds),
    seconds,
  );
  return [
    gainDb !== undefined
      ? `volume=${gainDb.toFixed(2)}dB,alimiter=limit=${10 ** (RINGTONE_CEILING_DB / 20)}`
      : "",
    fades,
  ]
    .filter(Boolean)
    .join(",");
}

export const ringtoneEngine: Engine<RingtoneOptions> = {
  id: "ringtone",
  backends: ["webcodecs"],
  optionsSchema: RingtoneOptions,
  async supports(backend, input) {
    return backend === "webcodecs" && (input.info?.audio?.length ?? 0) > 0;
  },
  async run(_backend, inputs, o, ctx) {
    const input = inputs[0];
    if (!input?.info) throw new EngineError("internal", "No input file.");
    const { file, info } = input;
    const part = fitPart(o, info.durationSec);
    const seconds = part.end - part.start;
    if (seconds < 1)
      throw new EngineError("unsupported-input", "Choose a part of at least one second.");
    const fmt = ringtoneFormat(o);
    let gainDb: number | undefined;
    if (o.normalize) {
      const measured = await partLoudness(file, part.start, part.end, ctx);
      if (Number.isFinite(measured)) gainDb = RINGTONE_LUFS - measured;
    }
    const target: SoundTarget | "wav" =
      o.output === "wav" || o.phone !== "iphone"
        ? "wav"
        : {
            kind: "audio",
            format: fmt.spec,
            native: "aac",
            ffmpegDecode: false,
            bitrateKbps: RINGTONE_KBPS,
          };
    const filename = ringtoneName(file.name, target === "wav" ? "wav" : fmt.extension);
    const rendered = await renderSound({
      file,
      target,
      chain: (facts) =>
        buildChain(
          {
            gainDb,
            fades: { fadeIn: o.fadeIn, fadeOut: o.fadeOut, curve: "smooth" },
            ceilingDb: gainDb !== undefined ? RINGTONE_CEILING_DB : undefined,
          },
          facts,
        ),
      outputName: filename,
      ctx,
      span: o.normalize ? [0.3, 1] : [0, 1],
      label: "Making the ringtone",
      spans: [part],
    });
    const blob =
      target === "wav" ? rendered.blob : new Blob([rendered.blob], { type: "audio/mp4" });
    return {
      blob,
      filename,
      ffmpegCommand: ringtoneFilter({ ...o, ...part }, gainDb),
      meta: JSON.stringify({
        seconds: rendered.seconds,
        gainDb,
        limitedDb: rendered.limitedDb,
        codec: codecFact(rendered.codec, rendered.bitrateKbps),
        layout: `${withUnit(rendered.sampleRate / 1000, "kHz")} ${channelsName(rendered.channels)}`,
      }),
    };
  },
};
