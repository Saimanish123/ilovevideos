/**
 * Matroska CodecDelay on the ffmpeg.wasm path. FFmpeg 5.1 (the wasm build) applies a Matroska
 * track's CodecDelay only to Opus; for AAC, AC-3 and MP3 it plays the encoder's priming, so sound
 * taken from an MKV came out late by exactly the delay (measured 2026-10-08 against local FFmpeg 9,
 * which honours it: AAC 1024 samples = 21.3 ms, AC-3 256 = 5.3 ms, MP3 1105 = 23.0 ms at 48 kHz).
 * The delay is read by `readMatroskaDelays` (../mediabunny/matroska-timing, the one reader of it);
 * mediabunny says which tracks are sound, in ffmpeg's `0:a:N` order, and their codec and rate.
 * Runs on the page with the ffmpeg runner. No network access.
 */
import { readMatroskaDelays } from "../mediabunny/matroska-timing";

export interface SoundDelay {
  /** mediabunny's codec id ("aac", "ac3", "mp3", "opus"). */
  codec: string;
  sampleRate: number;
  /** The track's CodecDelay (Opus: pre-skip) in samples at its rate; 0 when none. */
  samples: number;
}

/** Every sound track's start delay, in the file's track order (ffmpeg's `0:a:N`). */
export async function matroskaSoundDelays(file: File): Promise<SoundDelay[]> {
  const [{ ALL_FORMATS, BlobSource, Input }, head] = await Promise.all([
    import("mediabunny"),
    file.slice(0, 1 << 20).arrayBuffer(),
  ]);
  const delays = readMatroskaDelays(new Uint8Array(head));
  if (delays.size === 0) return [];
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    if (!/matroska|webm/i.test((await input.getFormat()).name)) return [];
    const tracks = await input.getAudioTracks();
    return tracks.map((t) => ({
      codec: t.codec ?? "unknown",
      sampleRate: t.sampleRate,
      samples: Math.round((delays.get(t.id) ?? 0) * t.sampleRate),
    }));
  } finally {
    input.dispose();
  }
}

/**
 * The samples ffmpeg.wasm must drop from the start of each sound track (`0:a:N`): the delay for
 * every codec but Opus, whose pre-skip FFmpeg 5.1 applies itself.
 */
export const samplesToDrop = (delays: SoundDelay[]) =>
  delays.map((d) => (d.codec === "opus" ? 0 : d.samples));

/** The filter that drops `samples` from the start and restarts the clock at zero. */
export const dropStart = (samples: number) => `atrim=start_sample=${samples},asetpts=PTS-STARTPTS`;
