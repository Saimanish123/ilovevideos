/**
 * Where the real sound of a track lies, for every reader that cuts or times it. No network access.
 */
import type { Input, InputAudioTrack } from "mediabunny";
import { sourceDelay } from "./matroska-timing";
import { readMp3Gapless } from "./mp3-gapless";
import { soundTrackEnd } from "./pre-roll";

/**
 * Where a sound track's real sound lies in mediabunny's times. Its start: after an audio-only MP3's
 * LAME encoder and decoder delay (./mp3-gapless), or a Matroska source's CodecDelay
 * (./matroska-timing; Opus is decoded with its pre-skip applied already). Its end: the gapless end,
 * an Opus source's own end trimming, else the track's end; for an MP3 without a Xing/LAME frame the
 * last packet's end, because the header estimate is wrong for VBR (a 4.05 s file read as 7 s).
 */
export async function soundSpan(
  file: File,
  input: Input,
  track: InputAudioTrack,
): Promise<{ start: number; end: number }> {
  const mp3 = track.codec === "mp3" && /mp3/i.test((await input.getFormat()).name);
  const gapless = mp3
    ? readMp3Gapless(new Uint8Array(await file.slice(0, 65_536).arrayBuffer()))
    : undefined;
  const delay = track.codec !== "opus" ? await sourceDelay(track) : 0;
  const end =
    gapless?.endSec ?? (mp3 ? await track.computeDuration() : await soundTrackEnd(track, file));
  return { start: (gapless?.skipSec ?? 0) + delay, end };
}
