/**
 * An MP4 whose picture is drawn here and whose sound comes from an audio file: the shared writer of
 * audio to video (one still) and images to video (a slideshow). The picture is drawn on an
 * OffscreenCanvas and encoded with WebCodecs H.264 through a mediabunny CanvasSource. The sound is
 * copied packet for packet when it is AAC and needs no cut or fade (the AAC priming is kept and an
 * edit list tells players to skip it, as the packet copy does), and otherwise decoded and encoded
 * once to AAC (Opus where this browser has no AAC encoder, ../sound-codec), from the window the audio tools use (MP3 gapless, pre-roll; ../mediabunny/audio-window)
 * with the encoder's priming signalled the same way. Both tracks are fed together so the muxer can
 * interleave them. Runs in the engine worker; no network.
 */
import {
  AudioSample,
  AudioSampleSink,
  AudioSampleSource,
  CanvasSource,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  type Input,
  Mp4OutputFormat,
  Output,
  Quality,
} from "mediabunny";
import { classifyError, EngineError } from "../errors";
import { reencodeWindow } from "../mediabunny/audio-window";
import { addOpusTail } from "../mediabunny/opus-delay";
import { editOutputSound, openOutputStore } from "../mediabunny/output-store";
import { addAacLead, withEncoderDelaySignalled } from "../mediabunny/priming";
import { openInput } from "../mediabunny/shared";
import { soundEncoders, writtenSoundCodec } from "../sound-codec";
import type { EngineContext } from "../types";
import { SOUND_KBPS } from "./options";

export { SOUND_KBPS };

export interface SoundJob {
  file: File;
  /** Cut the sound here (seconds of sound); the whole file when absent. */
  endSec?: number;
  /** Fade the last seconds out (used when the sound is cut short). */
  fadeOutSec?: number;
}

export interface PictureJob {
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  /** Seconds between key frames. */
  keyFrameInterval: number;
  bitrate: number;
  /**
   * Draws the frame at `t` seconds. Return false to reuse the canvas as it is (a still): the encoder
   * gets the same picture again, which costs almost nothing.
   */
  draw: (
    c: OffscreenCanvasRenderingContext2D,
    t: number,
    index: number,
  ) => boolean | Promise<boolean>;
  /** The encoder hint for still pictures and text ("detail") or motion (undefined). */
  contentHint?: string;
}

export interface MuxResult {
  blob: Blob;
  /** The sound was copied as it is (AAC), not encoded again. */
  soundCopied: boolean;
  /** Seconds of sound written. */
  soundSec: number;
  /** The sound's codec in the file (copied AAC, or the encoded one). */
  soundCodec: string;
}

/** Whether a sound file's primary track is AAC, so it can be copied into the MP4 as it is. */
export async function soundInfo(file: File): Promise<{ codec?: string; durationSec: number }> {
  const input = openInput(file);
  try {
    const track = await input.getPrimaryAudioTrack();
    const duration = (await input.getDurationFromMetadata()) ?? (await input.computeDuration());
    return { codec: track?.codec ?? undefined, durationSec: duration };
  } finally {
    input.dispose();
  }
}

export async function writeVideo(
  picture: PictureJob,
  sound: SoundJob | undefined,
  ctx: EngineContext,
): Promise<MuxResult> {
  const check = () => {
    if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
  };
  // An hour of podcast can make a large file: big outputs stream to disk storage (../mediabunny/
  // output-store). Expected: the picture's bitrate plus the sound (copied, or encoded at SOUND_KBPS).
  const soundBytes = sound
    ? Math.max(sound.file.size, ((SOUND_KBPS * 1000) / 8) * picture.durationSec)
    : 0;
  const store = await openOutputStore((picture.bitrate / 8) * picture.durationSec + soundBytes);
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: store.streamed ? false : "in-memory" }),
    target: store.target,
  });
  const canvas = new OffscreenCanvas(picture.width, picture.height);
  const c2d = canvas.getContext("2d", { alpha: false });
  if (!c2d) {
    await store.discard();
    throw new EngineError("resource", "The browser could not draw the picture.", "Try again.");
  }
  const video = new CanvasSource(canvas, {
    codec: "avc",
    quality: new Quality({ bitrate: picture.bitrate, bitrateMode: "variable" }),
    keyFrameInterval: picture.keyFrameInterval,
    contentHint: picture.contentHint,
  });
  output.addVideoTrack(video, { frameRate: picture.fps });

  // Progress: the picture and the sound each count for half.
  let pictureDone = 0;
  let soundDone = sound ? 0 : 1;
  const report = () =>
    ctx.onProgress({
      phase: "processing",
      ratio: Math.min(1, (pictureDone + soundDone) / 2),
      detail: sound
        ? `${Math.round(pictureDone * 100)}% of the picture, ${Math.round(soundDone * 100)}% of the sound`
        : `${Math.round(pictureDone * 100)}% of the picture`,
    });

  let soundCopied = false;
  // AAC, or Opus where this browser has no AAC encoder (../sound-codec); MP4 holds both.
  const encodedCodec = writtenSoundCodec("mp4", await soundEncoders());
  let soundSec = picture.durationSec;
  let audioPump: (() => Promise<void>) | undefined;
  let copyLead = 0;
  let soundInput: Input | undefined;
  if (sound) {
    soundInput = openInput(sound.file);
    const track = await soundInput.getPrimaryAudioTrack();
    if (!track?.codec) {
      await store.discard();
      throw new EngineError(
        "unsupported-input",
        "This file has no sound this tool can read.",
        "Choose an audio file.",
      );
    }
    const duration =
      (await soundInput.getDurationFromMetadata()) ?? (await soundInput.computeDuration());
    const endSec = sound.endSec !== undefined ? Math.min(sound.endSec, duration) : duration;
    soundSec = endSec;
    const cut = endSec < duration - 1e-3 || (sound.fadeOutSec ?? 0) > 0;
    if (track.codec === "aac" && !cut) {
      // Copy: the packets as they are, the first (priming) packet moved to zero.
      soundCopied = true;
      const source = new EncodedAudioPacketSource("aac");
      output.addAudioTrack(source);
      const sink = new EncodedPacketSink(track);
      const first = await sink.getFirstPacket();
      const shift = first?.timestamp ?? 0;
      copyLead = Math.max(0, -shift);
      const config = await track.getDecoderConfig();
      audioPump = async () => {
        let sent = false;
        for await (const p of sink.packets()) {
          check();
          await source.add(
            p.clone({ timestamp: Math.max(0, p.timestamp - shift) }),
            sent ? undefined : { decoderConfig: config ?? undefined },
          );
          sent = true;
          soundDone = Math.min(1, (p.timestamp + p.duration) / Math.max(1e-3, duration));
          report();
        }
      };
    } else {
      if (!(await track.canDecode()))
        throw new EngineError(
          "unsupported-input",
          "Your browser cannot decode this sound.",
          "Convert it to MP3 or M4A first with the audio converter.",
        );
      const win = await reencodeWindow(sound.file, cut ? { range: { start: 0, end: endSec } } : {});
      soundSec = win.soundSec ?? endSec;
      const source = new AudioSampleSource({
        codec: encodedCodec,
        quality: new Quality({ bitrate: SOUND_KBPS * 1000 }),
      });
      output.addAudioTrack(source);
      const sink = new AudioSampleSink(track);
      const fade = Math.min(sound.fadeOutSec ?? 0, soundSec);
      audioPump = async () => {
        // Silence first for an AAC encoder that swallows its first frame (WebKit's); every sample
        // after it is that much later. One sample format throughout: WebKit's encoder restarts
        // (and loses a frame again) when the format changes, as it would at the fade.
        let lead: number | undefined;
        let end = 0;
        let rate = 0;
        let channels = 0;
        for await (const raw of sink.samples(win.trim.start, win.trim.end)) {
          check();
          raw.setTimestamp(raw.timestamp - win.trim.start);
          let s: AudioSample | null = win.process ? win.process(raw) : raw;
          if (s !== raw) raw.close();
          if (!s) continue;
          if (fade > 0 && s.timestamp + s.duration > soundSec - fade)
            s = fadeOut(s, soundSec, fade);
          s = asF32Planar(s);
          rate = s.sampleRate;
          channels = s.numberOfChannels;
          lead ??= await addAacLead(source, encodedCodec, rate, channels);
          end = s.timestamp + s.duration;
          s.setTimestamp(s.timestamp + lead);
          await source.add(s);
          soundDone = Math.min(1, end / Math.max(1e-3, soundSec));
          s.close();
          report();
        }
        if (lead !== undefined) await addOpusTail(source, encodedCodec, rate, channels, lead + end);
      };
    }
  }

  const frames = Math.max(1, Math.ceil(picture.durationSec * picture.fps - 1e-6));
  const picturePump = async () => {
    for (let i = 0; i < frames; i++) {
      check();
      const t = i / picture.fps;
      await picture.draw(c2d, t, i);
      const duration = Math.min(1 / picture.fps, picture.durationSec - t);
      await video.add(t, Math.max(1e-3, duration));
      pictureDone = (i + 1) / frames;
      if (i % 10 === 0 || i === frames - 1) report();
    }
  };

  try {
    await output.start();
    await Promise.all([picturePump(), audioPump?.()]);
    ctx.onProgress({ phase: "finishing", ratio: 1, detail: "Writing the file" });
    await output.finalize();
  } catch (e) {
    await output.cancel().catch(() => undefined);
    await store.discard();
    soundInput?.dispose();
    if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
    throw classifyError(e);
  }
  soundInput?.dispose();
  const data = await store.finish();
  let parts: BlobPart[] = [data];
  if (sound && soundCopied && copyLead > 1e-6) {
    // Copied AAC keeps its priming packet at zero; the edit list skips it, as the source did.
    parts =
      (await editOutputSound(data, (tracks) =>
        tracks[0] ? [{ trackId: tracks[0].id, primingSec: copyLead, endSec: soundSec }] : [],
      )) ?? parts;
  } else if (sound) {
    parts = (await withEncoderDelaySignalled(output, data, "mp4", soundSec, 0, true)) ?? parts;
  }
  return {
    blob: new Blob(parts, { type: "video/mp4" }),
    soundCopied,
    soundSec,
    soundCodec: soundCopied ? "aac" : encodedCodec,
  };
}

/** The sample as f32-planar (itself when it already is). */
function asF32Planar(s: AudioSample): AudioSample {
  if (s.format === "f32-planar") return s;
  const frames = s.numberOfFrames;
  const channels = s.numberOfChannels;
  const data = new Float32Array(frames * channels);
  for (let ch = 0; ch < channels; ch++)
    s.copyTo(data.subarray(ch * frames, (ch + 1) * frames), {
      planeIndex: ch,
      format: "f32-planar",
    });
  const next = new AudioSample({
    data,
    format: "f32-planar",
    numberOfChannels: channels,
    sampleRate: s.sampleRate,
    timestamp: s.timestamp,
  });
  s.close();
  return next;
}

/** The sample with a linear fade to silence over the last `fade` seconds before `end`. */
function fadeOut(s: AudioSample, end: number, fade: number): AudioSample {
  const rate = s.sampleRate;
  const frames = s.numberOfFrames;
  const channels = s.numberOfChannels;
  const data = new Float32Array(frames * channels);
  const plane = new Float32Array(frames);
  for (let ch = 0; ch < channels; ch++) {
    s.copyTo(plane, { planeIndex: ch, format: "f32-planar" });
    const out = data.subarray(ch * frames, (ch + 1) * frames);
    for (let i = 0; i < frames; i++) {
      const t = s.timestamp + i / rate;
      const gain = Math.min(1, Math.max(0, (end - t) / fade));
      out[i] = (plane[i] ?? 0) * gain;
    }
  }
  const next = new AudioSample({
    data,
    format: "f32-planar",
    numberOfChannels: channels,
    sampleRate: rate,
    timestamp: s.timestamp,
  });
  s.close();
  return next;
}
