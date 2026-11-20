/**
 * The codec a sound re-encoded beside a picture is written in: one rule for every video engine and
 * for the ready and result lines that name it, so the line and the file cannot disagree.
 *
 * AAC wherever this browser's WebCodecs encodes it. Where it does not (Chromium on Linux has no AAC
 * encoder, measured on GitHub's runner; `--disable-features=PlatformAudioEncoder` reproduces it on
 * macOS), MP4 and MKV get Opus and MOV gets 16-bit PCM, which QuickTime plays where it does not play
 * Opus (the sound tools' rule since ADR-0020). WebM is always Opus.
 *
 * The rule is pure and takes the probed fact; `soundEncoders()` is the probe, asked once per thread
 * (page or worker) with the same configuration, so both sides read the same browser. No network.
 */
import type { ContainerId } from "./mediabunny/shared";

export type VideoSoundCodec = "aac" | "opus" | "pcm-s16";

/** Which lossy sound encoders this browser has (PCM needs none). */
export interface SoundEncoders {
  aac: boolean;
  opus: boolean;
}

/**
 * What the page assumes until the probe answers (a few milliseconds, well before a file is read):
 * the common case, so the line never changes where AAC exists.
 */
export const ASSUMED_ENCODERS: SoundEncoders = Object.freeze({ aac: true, opus: true });

/** The codecs a re-encoded sound beside a picture tries in this container, in order. */
export function videoSoundCodecs(container: ContainerId): VideoSoundCodec[] {
  if (container === "webm") return ["opus"];
  if (container === "mov") return ["aac", "pcm-s16"];
  return ["aac", "opus"];
}

/** The first of `videoSoundCodecs` this browser encodes; undefined when none is. */
export function videoSoundCodec(
  container: ContainerId,
  can: SoundEncoders,
): VideoSoundCodec | undefined {
  return videoSoundCodecs(container).find((c) => c === "pcm-s16" || can[c]);
}

/**
 * The codec a job writes, and its line names: `videoSoundCodec`, or where nothing fits the
 * container's usual codec (AAC; Opus in WebM), which the job then asks for and fails on with the
 * encoder's own error (`supports()` refuses first where it can).
 */
export const writtenSoundCodec = (container: ContainerId, can: SoundEncoders): VideoSoundCodec =>
  videoSoundCodec(container, can) ?? (container === "webm" ? "opus" : "aac");

/** "AAC", "Opus", "16-bit PCM": the codec as a line names it. */
export const soundCodecName = (codec: string | undefined): string =>
  codec === "opus" ? "Opus" : codec === "pcm-s16" ? "16‑bit PCM" : "AAC";

/**
 * Bits per second an encoded sound adds to a file, for size estimates: the bitrate asked of AAC or
 * Opus; for 16-bit PCM, rate × channels × 16 (1,536 kb/s for 48 kHz stereo), at the source's layout,
 * which a PCM write keeps.
 */
export function encodedSoundBps(
  codec: string,
  lossyBps: number,
  track: { sampleRate?: number; channels?: number } | undefined,
): number {
  if (codec !== "pcm-s16") return lossyBps;
  return (track?.sampleRate ?? 48_000) * (track?.channels ?? 2) * 16;
}

/** The ffmpeg encoder for the shown command. */
export const ffmpegSoundEncoder = (codec: string | undefined): string =>
  codec === "opus" ? "libopus" : codec === "pcm-s16" ? "pcm_s16le" : "aac";

/** The configurations probed: stereo 48 kHz, the rate every video engine encodes at or falls back to. */
const PROBES: Record<keyof SoundEncoders, AudioEncoderConfig> = {
  aac: { codec: "mp4a.40.2", sampleRate: 48_000, numberOfChannels: 2, bitrate: 192_000 },
  opus: { codec: "opus", sampleRate: 48_000, numberOfChannels: 2, bitrate: 192_000 },
};

let probe: Promise<SoundEncoders> | undefined;
let known: SoundEncoders | undefined;
const listeners = new Set<() => void>();

async function supported(config: AudioEncoderConfig): Promise<boolean> {
  if (typeof AudioEncoder === "undefined") return false;
  try {
    return (await AudioEncoder.isConfigSupported(config)).supported === true;
  } catch {
    return false;
  }
}

/** This browser's sound encoders, probed once per thread. */
export function soundEncoders(): Promise<SoundEncoders> {
  probe ??= Promise.all([supported(PROBES.aac), supported(PROBES.opus)]).then(([aac, opus]) => {
    known = Object.freeze({ aac, opus });
    for (const l of listeners) l();
    return known;
  });
  return probe;
}

/** The probed answer once it is in, else `ASSUMED_ENCODERS`. A stable object for each. */
export function soundEncodersNow(): SoundEncoders {
  return known ?? ASSUMED_ENCODERS;
}

/** Called once when the probe answers (for `useSyncExternalStore`). */
export function onSoundEncoders(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Tests only: forget the probe. */
export function resetSoundEncodersForTest(): void {
  probe = undefined;
  known = undefined;
}
