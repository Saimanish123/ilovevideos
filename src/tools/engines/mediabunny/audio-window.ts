/**
 * Where a native audio re-encode should decode from, and how each decoded sample is fixed up, for
 * audio-only outputs (extract audio, convert audio). Three mediabunny behaviours are corrected here
 * without patching it:
 *
 * - Pre-roll. Conversion starts decoding on the packet that holds its start, so the first AAC or MP3
 *   frame is decoded without the one before it and comes out attenuated (a click at 0 s vanished;
 *   onset measured 10.8 ms late). Decoding starts up to 50 ms earlier, on AAC's own priming packet
 *   when there is one, and the extra samples are dropped here.
 * - MP3 gapless. mediabunny ignores the LAME encoder delay and padding (./mp3-gapless): decoded
 *   sound started 25 ms late and ran 24 ms long. The window starts and ends where ffmpeg's does.
 * - 16- and 24-bit PCM scale. mediabunny reads integer PCM as v / 2^(n-1) but writes it as
 *   x × (2^(n-1) − 1), so samples above half scale came back one step low. Integer sources going to
 *   integer PCM are scaled by 2^(n-1) / (2^(n-1) − 1) first, so they round-trip exactly.
 *
 * Runs in the engine worker. No network access (README.md#privacy-and-processing §2).
 */
import { type AudioSample, EncodedPacketSink } from "mediabunny";
import { fixSample, PRE_ROLL_SEC } from "./pre-roll";
import { openInput } from "./shared";
import { soundSpan } from "./sound-span";

export { fixSample, PRE_ROLL_SEC };

export interface ReencodeWindow {
  /** Source times for Conversion's `trim`: decoding starts at `start` (pre-roll included). */
  trim: { start: number; end?: number };
  /** Seconds of sound the output holds, from its zero. */
  soundSec?: number;
  /** Conversion `audio.process` step; undefined when nothing needs fixing. */
  process?: (sample: AudioSample) => AudioSample | null;
  /** Facts for tests and the report: where the sound starts in the source, and what is dropped. */
  origin: number;
  lead: number;
  scale: number;
}

export interface WindowOptions {
  /** Part of the sound to keep, in the sound's own time (what the player shows). */
  range?: { start: number; end: number };
  /** Bits of the integer PCM written (16 or 24), when the output is integer PCM. */
  pcmBits?: number;
  /** True when the source is integer PCM or FLAC, so an integer PCM output can be bit exact. */
  integerSource?: boolean;
}

/** Scale that makes mediabunny's integer PCM writer the inverse of its reader, for `bits` bits. */
export const pcmScale = (bits: number) => 2 ** (bits - 1) / (2 ** (bits - 1) - 1);

export async function reencodeWindow(
  file: File,
  opts: WindowOptions = {},
): Promise<ReencodeWindow> {
  const input = openInput(file);
  try {
    const track = await input.getPrimaryAudioTrack();
    const first = track
      ? await new EncodedPacketSink(track).getFirstPacket({ metadataOnly: true })
      : null;
    const span = track
      ? await soundSpan(file, input, track)
      : {
          start: 0,
          end: (await input.getDurationFromMetadata()) ?? (await input.computeDuration()),
        };
    const skip = span.start;
    const soundEnd = span.end;
    const origin = skip + (opts.range?.start ?? 0);
    const end = Math.min(opts.range ? skip + opts.range.end : soundEnd, soundEnd);
    const firstTs = first?.timestamp ?? 0;
    const start = Math.max(firstTs, origin - PRE_ROLL_SEC);
    const lead = Math.max(0, origin - start);
    const scale =
      opts.integerSource && (opts.pcmBits === 16 || opts.pcmBits === 24)
        ? pcmScale(opts.pcmBits)
        : 1;
    const process =
      lead > 1e-9 || scale !== 1
        ? (sample: AudioSample) => fixSample(sample, lead, scale)
        : undefined;
    return {
      trim: { start, end: Number.isFinite(end) ? end : undefined },
      soundSec: Number.isFinite(end) ? end - origin : undefined,
      process,
      origin,
      lead,
      scale,
    };
  } finally {
    input.dispose();
  }
}
