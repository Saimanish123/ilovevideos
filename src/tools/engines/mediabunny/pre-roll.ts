/**
 * Decoder pre-roll. mediabunny starts decoding on the packet that holds the start it is given, so
 * the first AAC or MP3 frame is decoded without the one before it and comes out attenuated (a click
 * at 0 s vanished; a tone's onset measured 10.8 ms late). Decoding starts up to `PRE_ROLL_SEC`
 * earlier, on AAC's own priming packet when there is one, and `fixSample` drops the extra samples.
 * Used for audio-only outputs (./audio-window) and for sound re-encoded next to a picture
 * (./sound-split). Pure. No network access.
 */
import { AudioSample, type InputAudioTrack } from "mediabunny";
import { opusSourceEnd } from "./opus-source";

/** How far before the start decoding begins: two AAC frames at 44.1 kHz, or one MP3 frame and a half. */
export const PRE_ROLL_SEC = 0.05;

/**
 * Drops what lies before `lead` seconds of the (already trim-shifted) stream, moves the rest back by
 * `lead`, and multiplies by `scale`. Returns null for a sample entirely inside the pre-roll.
 */
export function fixSample(sample: AudioSample, lead: number, scale: number): AudioSample | null {
  const rate = sample.sampleRate;
  const skip = Math.max(0, Math.round((lead - sample.timestamp) * rate));
  if (skip >= sample.numberOfFrames) return null;
  const frames = sample.numberOfFrames - skip;
  const channels = sample.numberOfChannels;
  const data = new Float32Array(frames * channels);
  const plane = new Float32Array(sample.numberOfFrames);
  for (let c = 0; c < channels; c++) {
    sample.copyTo(plane, { planeIndex: c, format: "f32-planar" });
    const out = data.subarray(c * frames, (c + 1) * frames);
    if (scale === 1) out.set(plane.subarray(skip));
    else for (let i = 0; i < frames; i++) out[i] = (plane[skip + i] ?? 0) * scale;
  }
  return new AudioSample({
    data,
    format: "f32-planar",
    numberOfChannels: channels,
    sampleRate: rate,
    timestamp: Math.max(0, sample.timestamp + skip / rate - lead),
  });
}

/**
 * Where a sound track ends, in its own time: for Opus in Ogg or WebM where the container trims the
 * encoder's padding (./opus-source), else from the container's header, else from its packets.
 */
export async function soundTrackEnd(track: InputAudioTrack, file?: File): Promise<number> {
  const opus = file ? await opusSourceEnd(file, track) : undefined;
  return opus ?? (await track.getDurationFromMetadata()) ?? (await track.computeDuration());
}
