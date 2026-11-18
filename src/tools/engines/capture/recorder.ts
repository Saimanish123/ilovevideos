/**
 * Records live MediaStream tracks straight into a finished file: H.264 and AAC in MP4 for the screen
 * and webcam recorders, AAC (M4A), 16-bit PCM (WAV) or Opus (Ogg) for the voice recorder. Encoding
 * runs as the tracks play, through mediabunny's MediaStream sources and WebCodecs, and the file
 * streams to on-device storage (./sink), so memory stays flat however long the recording runs and
 * there is no WebM-then-convert step: when Stop is pressed the file is written in the time it takes
 * to write the index.
 *
 * Sound and picture share the sources' clock ("synced-zero"): each source's first sample lands at
 * the time it arrived after the recording started. Pausing drops what the tracks produce and moves
 * later timestamps back by the paused time, per source. The picture is sampled at a constant rate
 * (repeating the last frame when a still screen sends none). A window or tab that changes size, or a
 * phone camera that turns, is fitted into the first frame's box; odd sizes are evened for H.264
 * (ADR-0060). The camera bubble and a mirrored webcam picture are drawn per frame in the sources'
 * own frame step. Afterwards the AAC encoder's priming is signalled with an edit list (../mediabunny
 * /priming), and an Ogg Opus file gets its measured pre-skip.
 *
 * Runs on the page (MediaStream tracks live here). No network access (README.md#privacy-and-processing §2).
 */
import {
  ALL_FORMATS,
  BlobSource,
  canEncodeAudio,
  canEncodeVideo,
  Input,
  MediaStreamAudioTrackSource,
  MediaStreamVideoTrackSource,
  Mp4OutputFormat,
  OggOutputFormat,
  Output,
  type OutputFormat,
  Quality,
  type VideoSample,
  WavOutputFormat,
  WebMOutputFormat,
} from "mediabunny";
import { formatDimensions } from "@/lib/format";
import { fixOggOpus } from "../mediabunny/ogg-opus";
import { opusEncoderDelay, readOpusHead } from "../mediabunny/opus-delay";
import { editOutputSound } from "../mediabunny/output-store";
import { aacEncoderStart } from "../mediabunny/priming";
import type { MediaInfo } from "../types";
import {
  type AudioCodecId,
  bubbleRect,
  type CaptureKind,
  type Corner,
  captureCommand,
  centreSquare,
  codecLabel,
  type EncoderProbe,
  type Os,
  recordedSeconds,
  recordingName,
  recordingSize,
  soundBitrate,
  type VideoCodecId,
  type VoiceFormat,
  videoBitrate,
  videoRecordingFormat,
  voiceRecordingFormat,
  WAV_LIMIT_BYTES,
} from "./plan";
import { type CaptureSink, MEMORY_LIMIT_BYTES, openCaptureSink, releaseRecordings } from "./sink";

export interface RecorderSetup {
  kind: CaptureKind;
  /** The screen, window or tab, or the camera. */
  video?: MediaStreamTrack;
  /** Sound to record; several (microphone and tab sound) are mixed into one track. */
  audio?: MediaStreamTrack[];
  /** Screen recorder: the camera drawn as a round bubble in a corner. */
  bubble?: { track: MediaStreamTrack; corner: Corner };
  /** Webcam: write the picture mirrored, as the preview shows it. */
  mirror?: boolean;
  fps: number;
  /** Bring the short side down to this many lines when it is larger. */
  maxLines?: number;
  voiceFormat?: VoiceFormat;
  /** Whether a microphone is among `audio` (for the ffmpeg command). */
  mic: boolean;
  os: Os;
}

export interface RecorderStats {
  bytes: number;
  seconds: number;
  paused: boolean;
}

export interface Recording {
  file: File;
  info: MediaInfo;
  meta: string;
  ffmpegCommand: string;
}

export interface Recorder {
  /** What the file will be: "MP4 · H.264, AAC · 1920×1080 · 30 fps". */
  describe: string;
  /** Set when the format is not the one the page promises, saying why. */
  note?: string;
  /** Where the file goes: disk storage, or memory (then `limit` is about 1.8 GB). */
  onDisk: boolean;
  /** Bytes at which the recording must stop (a WAV's 4 GiB, or what memory holds). */
  limit: number;
  stats(): RecorderStats;
  pause(): void;
  resume(): void;
  /** Ends the recording and returns the finished file. */
  stop(): Promise<Recording>;
  /** Ends it and throws it away. */
  cancel(): Promise<void>;
  /** Rejects when an encoder or the storage fails mid-recording. */
  failed: Promise<never>;
}

export class CaptureError extends Error {
  constructor(
    message: string,
    readonly hint?: string,
  ) {
    super(message);
    this.name = "CaptureError";
  }
}

/** What this browser can encode for a picture of this size and sound of this layout. */
export async function probeEncoders(
  width: number,
  height: number,
  channels = 1,
  sampleRate = 48_000,
): Promise<EncoderProbe> {
  const size = recordingSize(width, height);
  const bitrate = videoBitrate(size.width, size.height, 30, "webcam");
  const video = (codec: "avc" | "vp9" | "vp8") =>
    canEncodeVideo(codec, { ...size, quality: new Quality({ bitrate }) }).catch(() => false);
  const audio = (codec: "aac" | "opus") =>
    canEncodeAudio(codec, {
      numberOfChannels: Math.min(2, channels),
      sampleRate: codec === "opus" ? 48_000 : sampleRate,
      quality: new Quality({ bitrate: soundBitrate(channels) }),
    }).catch(() => false);
  const [avc, vp9, vp8, aac, opus] = await Promise.all([
    video("avc"),
    video("vp9"),
    video("vp8"),
    audio("aac"),
    audio("opus"),
  ]);
  return { avc, vp9, vp8, aac, opus };
}

/**
 * Mixes several sound tracks into one stereo track (microphone and a tab's sound), or brings one
 * track at a rate the encoders do not take (a 16 kHz headset) to 48 kHz, in real time through Web
 * Audio. mediabunny's own resampling holds every sample until the end, so it is never used here:
 * a long recording would grow in memory and nothing would be encoded until Stop.
 */
function mix(
  tracks: MediaStreamTrack[],
  channels = 2,
): { track: MediaStreamTrack; close: () => void } {
  const AC = window.AudioContext;
  const ctx = new AC({ sampleRate: 48_000 });
  const dest = ctx.createMediaStreamDestination();
  dest.channelCount = channels;
  const nodes = tracks.map((t) => {
    const src = ctx.createMediaStreamSource(new MediaStream([t]));
    src.connect(dest);
    return src;
  });
  void ctx.resume();
  const [track] = dest.stream.getAudioTracks();
  if (!track) throw new CaptureError("The sound could not be mixed.");
  return {
    track,
    close: () => {
      for (const n of nodes) n.disconnect();
      track.stop();
      void ctx.close();
    },
  };
}

/** The camera's latest frame, for drawing the bubble: from a frame reader, or a video element. */
function cameraFeed(track: MediaStreamTrack) {
  let latest: VideoFrame | null = null;
  let element: HTMLVideoElement | null = null;
  let stopped = false;
  const Processor = (
    globalThis as {
      MediaStreamTrackProcessor?: new (o: {
        track: MediaStreamTrack;
      }) => { readable: ReadableStream<VideoFrame> };
    }
  ).MediaStreamTrackProcessor;
  if (Processor) {
    const reader = new Processor({ track: track.clone() }).readable.getReader();
    void (async () => {
      while (!stopped) {
        const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true }));
        if (done || !value) break;
        latest?.close();
        latest = value;
      }
      void reader.cancel().catch(() => undefined);
    })();
  } else {
    element = document.createElement("video");
    element.muted = true;
    element.playsInline = true;
    element.srcObject = new MediaStream([track]);
    void element.play().catch(() => undefined);
  }
  return {
    source(): { image: CanvasImageSource; width: number; height: number } | null {
      if (latest)
        return { image: latest, width: latest.displayWidth, height: latest.displayHeight };
      if (element && element.videoWidth > 0)
        return { image: element, width: element.videoWidth, height: element.videoHeight };
      return null;
    },
    close() {
      stopped = true;
      latest?.close();
      latest = null;
      if (element) element.srcObject = null;
    },
  };
}

/**
 * The picture's real size, from its first frame: a shared screen's settings can name another size
 * before frames arrive (seen in Chromium: 1280×900 announced, 1280×720 sent). Falls back to the
 * settings after a second.
 */
async function frameSize(track: MediaStreamTrack): Promise<{ width: number; height: number }> {
  const s = track.getSettings();
  const fallback = { width: s.width ?? 1280, height: s.height ?? 720 };
  const el = document.createElement("video");
  el.muted = true;
  el.playsInline = true;
  el.srcObject = new MediaStream([track]);
  try {
    const size = await Promise.race([
      new Promise<{ width: number; height: number } | null>((resolve) => {
        el.addEventListener(
          "loadedmetadata",
          () =>
            resolve(el.videoWidth > 0 ? { width: el.videoWidth, height: el.videoHeight } : null),
          { once: true },
        );
        void el.play().catch(() => undefined);
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1000)),
    ]);
    return size ?? fallback;
  } finally {
    el.pause();
    el.srcObject = null;
  }
}

const frameRateOf = (track: MediaStreamTrack, fallback: number) => {
  const r = track.getSettings().frameRate;
  return r && r > 0 ? Math.min(60, Math.round(r)) : fallback;
};

/** Starts recording. Throws `CaptureError` with a specific message when nothing can be encoded. */
export async function startRecorder(setup: RecorderSetup): Promise<Recorder> {
  const started = new Date();
  const sounds = setup.audio?.filter((t) => t.readyState === "live") ?? [];
  const rate = sounds[0]?.getSettings().sampleRate;
  const odd =
    setup.voiceFormat !== "wav" && rate !== undefined && rate !== 44_100 && rate !== 48_000;
  const mixed =
    sounds.length > 1
      ? mix(sounds)
      : odd && sounds[0]
        ? mix(sounds, Math.min(2, sounds[0].getSettings().channelCount ?? 1))
        : undefined;
  const soundTrack = mixed?.track ?? sounds[0];
  const settings = soundTrack?.getSettings();
  const channels =
    sounds.length > 1 ? 2 : Math.min(2, Math.max(1, sounds[0]?.getSettings().channelCount ?? 1));
  const sampleRate = mixed ? 48_000 : (settings?.sampleRate ?? 48_000);
  const closers: (() => void)[] = [];
  if (mixed) closers.push(mixed.close);

  let format: OutputFormat;
  let mime: string;
  let extension: string;
  let videoCodec: VideoCodecId | undefined;
  let audioCodec: AudioCodecId | undefined;
  let audioBitrate: number | undefined;
  let note: string | undefined;
  let size: { width: number; height: number } | undefined;
  let fps = setup.fps;
  let vBitrate: number | undefined;

  if (setup.video) {
    const real = await frameSize(setup.video);
    size = recordingSize(real.width, real.height, setup.maxLines);
    fps = frameRateOf(setup.video, setup.fps);
    if (setup.fps < fps) fps = setup.fps;
    const probe = await probeEncoders(size.width, size.height, channels, sampleRate);
    const plan = videoRecordingFormat(probe, !!soundTrack);
    if (!plan)
      throw new CaptureError(
        `This browser cannot encode video at ${formatDimensions(size.width, size.height)}.`,
        "Use a current Chrome, Edge or Safari on a computer.",
      );
    videoCodec = plan.video;
    audioCodec = plan.audio;
    // Not the MP4 with H.264 and AAC the page leads with: one line saying why.
    if (plan.container === "webm")
      note = plan.audio
        ? "This browser cannot encode AAC sound, so it records WebM (VP9 or VP8 with Opus)."
        : "This browser cannot encode H.264, so it records WebM.";
    vBitrate = videoBitrate(size.width, size.height, fps, setup.kind);
    audioBitrate = soundTrack ? soundBitrate(channels) : undefined;
    format =
      plan.container === "mp4" ? new Mp4OutputFormat({ fastStart: false }) : new WebMOutputFormat();
    mime = plan.container === "mp4" ? "video/mp4" : "video/webm";
    extension = plan.container;
  } else {
    if (!soundTrack) throw new CaptureError("There is nothing to record.");
    const plan = voiceRecordingFormat(setup.voiceFormat ?? "m4a", channels);
    if (plan.audio !== "pcm-s16") {
      const ok = await canEncodeAudio(plan.audio, {
        numberOfChannels: channels,
        sampleRate: plan.audio === "opus" ? 48_000 : sampleRate,
        quality: new Quality({ bitrate: plan.bitrate ?? 128_000 }),
      }).catch(() => false);
      if (!ok)
        throw new CaptureError(
          `This browser cannot encode ${plan.audio === "aac" ? "AAC (M4A)" : "Opus"} sound.`,
          "Choose WAV, which every browser can write.",
        );
    }
    audioCodec = plan.audio;
    audioBitrate = plan.bitrate;
    format =
      plan.container === "wav"
        ? new WavOutputFormat()
        : plan.container === "ogg"
          ? new OggOutputFormat()
          : new Mp4OutputFormat({ fastStart: false });
    mime = plan.mime;
    extension = plan.extension;
  }

  // A new recording replaces the last one: its file is no longer on the page.
  await releaseRecordings();
  const sink: CaptureSink = await openCaptureSink();
  const output = new Output({ format, target: sink.target });
  // Encoded bytes as the encoders produce them: the sink writes in 2 MiB chunks, so its own count
  // lags; the live size is whichever is larger.
  let encodedBytes = 0;
  const count = (packet: { byteLength: number }) => {
    encodedBytes += packet.byteLength;
  };
  const errors: Promise<void>[] = [];
  let videoSource: MediaStreamVideoTrackSource | undefined;
  let audioSource: MediaStreamAudioTrackSource | undefined;

  if (setup.video && size && videoCodec) {
    const box = size;
    let process: ((sample: VideoSample) => CanvasImageSource) | undefined;
    if (setup.bubble || setup.mirror) {
      const canvas = new OffscreenCanvas(box.width, box.height);
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) throw new CaptureError("This browser cannot draw the picture.");
      const camera = setup.bubble ? cameraFeed(setup.bubble.track) : undefined;
      if (camera) closers.push(camera.close);
      const rect = setup.bubble
        ? bubbleRect(box.width, box.height, setup.bubble.corner)
        : undefined;
      process = (sample) => {
        if (setup.mirror) {
          ctx.setTransform(-1, 0, 0, 1, box.width, 0);
          sample.draw(ctx, 0, 0, box.width, box.height);
          ctx.setTransform(1, 0, 0, 1, 0, 0);
        } else sample.draw(ctx, 0, 0, box.width, box.height);
        const cam = camera?.source();
        if (cam && rect) {
          const sq = centreSquare(cam.width, cam.height);
          const r = rect.size / 2;
          ctx.save();
          ctx.beginPath();
          ctx.arc(rect.x + r, rect.y + r, r, 0, Math.PI * 2);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(
            cam.image,
            sq.x,
            sq.y,
            sq.size,
            sq.size,
            rect.x,
            rect.y,
            rect.size,
            rect.size,
          );
          ctx.restore();
          // A hairline keeps a light bubble apart from a light screen.
          ctx.lineWidth = Math.max(2, Math.round(rect.size / 90));
          ctx.strokeStyle = "rgba(255,255,255,0.9)";
          ctx.beginPath();
          ctx.arc(rect.x + r, rect.y + r, r - ctx.lineWidth / 2, 0, Math.PI * 2);
          ctx.stroke();
        }
        return canvas;
      };
    }
    videoSource = new MediaStreamVideoTrackSource(
      setup.video as MediaStreamVideoTrack,
      {
        codec: videoCodec,
        quality: new Quality({ bitrate: vBitrate ?? 4_000_000, bitrateMode: "variable" }),
        latencyMode: "realtime",
        onEncodedPacket: count,
        keyFrameInterval: 2,
        contentHint: setup.kind === "screen" ? "detail" : "motion",
        // Every frame is fitted into the first frame's box: a window resized or a phone turned
        // mid-recording is letterboxed, never refused; an odd or capped size is drawn to the box.
        sizeChangeBehavior: "passThrough",
        transform: { width: box.width, height: box.height, fit: "contain", process },
      },
      // A camera sends frames at its own steady rate: they keep their capture times, which puts
      // the picture half a frame closer to the sound than resampling to a fixed grid (measured,
      // ADR-0100). A screen sends frames only when it changes, so it is sampled at a fixed rate,
      // and so is any picture where frames cannot be read on the page (no MediaStreamTrackProcessor).
      {
        frameRate:
          setup.kind === "webcam" && typeof MediaStreamTrackProcessor !== "undefined" ? null : fps,
      },
    );
    errors.push(videoSource.errorPromise);
    output.addVideoTrack(videoSource, { frameRate: fps });
  }
  if (soundTrack && audioCodec) {
    audioSource = new MediaStreamAudioTrackSource(soundTrack as MediaStreamAudioTrack, {
      codec: audioCodec,
      onEncodedPacket: count,
      ...(audioCodec === "pcm-s16"
        ? {}
        : { quality: new Quality({ bitrate: audioBitrate ?? 128_000 }) }),
    });
    errors.push(audioSource.errorPromise);
    output.addAudioTrack(audioSource);
  }

  const failed = Promise.race(errors).then(() => {
    throw new CaptureError("The recording stopped unexpectedly.");
  }) as Promise<never>;
  failed.catch(() => undefined);

  try {
    await output.start();
  } catch (e) {
    for (const c of closers) c();
    await sink.discard();
    throw new CaptureError(
      `The recording could not start: ${(e as Error).message ?? e}`,
      "Try again, or choose a lower quality under More options.",
    );
  }

  const stretches: [number, number | undefined][] = [[performance.now(), undefined]];
  let paused = false;
  let ended = false;
  const finalSeconds = () => recordedSeconds(stretches, performance.now());
  const limit = sink.onDisk
    ? audioCodec === "pcm-s16"
      ? WAV_LIMIT_BYTES
      : Number.POSITIVE_INFINITY
    : Math.min(MEMORY_LIMIT_BYTES * 0.95, audioCodec === "pcm-s16" ? WAV_LIMIT_BYTES : Infinity);

  const describe = [
    extension.toUpperCase(),
    codecLabel(videoCodec, audioCodec),
    size ? formatDimensions(size.width, size.height) : undefined,
    size ? `${fps} fps` : undefined,
  ]
    .filter(Boolean)
    .join(" · ");

  const close = () => {
    for (const c of closers) c();
  };

  return {
    describe,
    note,
    onDisk: sink.onDisk,
    limit,
    failed,
    stats: () => ({
      bytes: Math.max(sink.bytes(), encodedBytes),
      seconds: finalSeconds(),
      paused,
    }),
    pause() {
      if (paused || ended) return;
      paused = true;
      videoSource?.pause();
      audioSource?.pause();
      const last = stretches.at(-1);
      if (last) last[1] = performance.now();
    },
    resume() {
      if (!paused || ended) return;
      paused = false;
      videoSource?.resume();
      audioSource?.resume();
      stretches.push([performance.now(), undefined]);
    },
    async cancel() {
      if (ended) return;
      ended = true;
      close();
      await output.cancel().catch(() => undefined);
      await sink.discard();
    },
    async stop() {
      if (ended) throw new CaptureError("The recording has already ended.");
      ended = true;
      const last = stretches.at(-1);
      if (last && last[1] === undefined) last[1] = performance.now();
      try {
        await output.finalize();
      } catch (e) {
        close();
        await sink.discard();
        throw new CaptureError(
          `The recording could not be finished: ${(e as Error).message ?? e}`,
          "Try again with a shorter recording or more free storage.",
        );
      }
      close();
      let blob = await sink.finish(mime);
      blob = await signalEncoderDelay(blob, extension, audioCodec);
      const filename = recordingName(setup.kind, started, extension);
      const file = new File([blob], filename, { type: mime });
      const info = await readBack(file, {
        video: videoCodec,
        audio: audioCodec,
        channels,
        sampleRate: audioCodec === "opus" ? 48_000 : sampleRate,
        fallbackSeconds: recordedSeconds(stretches, performance.now()),
      });
      // Only what the stage's file card does not already show (it gives the size, length, picture
      // size and codecs): the frame rate of a picture, the bitrate of compressed sound.
      const meta = [
        info.video ? `${fps} fps` : undefined,
        !info.video && audioBitrate ? `${Math.round(audioBitrate / 1000)} kb/s` : undefined,
      ]
        .filter(Boolean)
        .join(" · ");
      return {
        file,
        info,
        meta,
        ffmpegCommand: captureCommand({
          kind: setup.kind,
          os: setup.os,
          fps,
          width: size?.width,
          height: size?.height,
          mic: setup.kind === "voice" ? true : setup.mic,
          videoBitrate: vBitrate,
          audio: audioCodec,
          audioBitrate,
          filename,
        }),
      };
    },
  };
}

/**
 * AAC: an edit list skips the encoder's priming so sound
 * and picture line up as recorded. Ogg Opus: the measured pre-skip goes into the header.
 */
async function signalEncoderDelay(
  blob: Blob,
  extension: string,
  audio: AudioCodecId | undefined,
): Promise<Blob> {
  try {
    if (audio === "aac" && (extension === "mp4" || extension === "m4a")) {
      const back = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
      try {
        const sound = await back.getPrimaryAudioTrack();
        if (!sound) return blob;
        const start = await aacEncoderStart(sound.sampleRate, sound.numberOfChannels);
        if (start.priming <= 0) return blob;
        const edited = await editOutputSound(blob, () => [
          {
            trackId: sound.id,
            // WebKit silences its first frame in place (ADR-0061): the timing holds, so only the
            // priming is skipped.
            primingSec: start.priming / sound.sampleRate,
            frameSec: start.lost > 0 ? 1024 / sound.sampleRate : undefined,
          },
        ]);
        return edited ? new Blob(edited, { type: blob.type }) : blob;
      } finally {
        back.dispose();
      }
    }
    if (audio === "opus" && extension === "opus" && blob.size < 512 * 1024 * 1024) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const start = 27 + (bytes[26] ?? 0);
      const head = readOpusHead(bytes.subarray(start, start + 64));
      if (!head) return blob;
      const delay = await opusEncoderDelay(head.inputRate, head.channels);
      const fixed = fixOggOpus(bytes, {
        preSkip: delay?.preSkip,
        endSec: Number.POSITIVE_INFINITY,
      });
      return fixed ? new Blob([fixed], { type: blob.type }) : blob;
    }
  } catch {
    // The recording stands as written; only the start offset is not signalled.
  }
  return blob;
}

/** The finished file's facts, read back from it (length from its packets, not from the clock). */
async function readBack(
  file: File,
  k: {
    video?: VideoCodecId;
    audio?: AudioCodecId;
    channels: number;
    sampleRate: number;
    fallbackSeconds: number;
  },
): Promise<MediaInfo> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const [video, duration] = await Promise.all([
      input.getPrimaryVideoTrack(),
      input.computeDuration(),
    ]);
    const container = file.name.split(".").pop() ?? "";
    return {
      container,
      durationSec: duration > 0 ? duration : k.fallbackSeconds,
      sizeBytes: file.size,
      video: video
        ? {
            codec: k.video ?? "avc",
            width: video.displayWidth,
            height: video.displayHeight,
            fps: 0,
          }
        : undefined,
      audio: k.audio
        ? [{ codec: k.audio, channels: k.channels, sampleRate: k.sampleRate }]
        : undefined,
    };
  } catch {
    return {
      container: file.name.split(".").pop() ?? "",
      durationSec: k.fallbackSeconds,
      sizeBytes: file.size,
    };
  } finally {
    input.dispose();
  }
}
