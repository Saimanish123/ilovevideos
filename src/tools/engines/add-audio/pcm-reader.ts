/**
 * Pull-based PCM reader over a decoded audio track: `read(n)` returns exactly `n` frames at the
 * output rate and channel count, zero-filled past the end. Wraps mediabunny's AudioSampleSink with
 * the merge engine's channel mix and linear resampler, and can loop from a start point. Decoding
 * starts a little before that point so the first frame is whole (../mediabunny/pre-roll); the extra
 * frames are dropped. Runs in the engine worker; releases every decoded sample as soon as it is
 * copied.
 */
import { type AudioSample, AudioSampleSink, type InputAudioTrack } from "mediabunny";
import { PRE_ROLL_SEC } from "../mediabunny/pre-roll";
import { LinearResampler, mixChannels } from "../merge/resample";

export class PcmReader {
  private readonly sink: AudioSampleSink;
  private gen: AsyncGenerator<AudioSample, void, unknown> | null = null;
  private readonly resampler: LinearResampler;
  private pending: Float32Array[] = [];
  private pendingPos = 0;
  private ended = false;
  /** Frames delivered so far, for progress. */
  delivered = 0;

  private decodeFrom: number | undefined;

  constructor(
    private readonly track: InputAudioTrack,
    private readonly from: number,
    private readonly channels: number,
    rate: number,
    private readonly loop = false,
    /** Stop at this source time (exclusive); undefined reads to the end. */
    private readonly until?: number,
  ) {
    this.sink = new AudioSampleSink(track);
    this.resampler = new LinearResampler(track.sampleRate, rate, channels);
  }

  private async start() {
    this.decodeFrom ??= Math.min(
      this.from,
      Math.max(await this.track.getFirstTimestamp(), this.from - PRE_ROLL_SEC),
    );
    this.gen = this.sink.samples(this.decodeFrom, this.until);
  }

  /** Next chunk of converted planes, or null when the source is exhausted (and not looping). */
  private async next(): Promise<Float32Array[] | null> {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!this.gen) await this.start();
      const r = await this.gen?.next();
      if (r && !r.done) {
        const s = r.value;
        // Samples start before `from` (pre-roll); drop the frames in front of it.
        const lead = Math.max(0, Math.round((this.from - s.timestamp) * s.sampleRate));
        if (lead >= s.numberOfFrames) {
          s.close();
          attempt--;
          continue;
        }
        // And past `until` (an MP3's padding, the end of a loop): the last sample is cut there.
        const keep =
          this.until === undefined
            ? s.numberOfFrames
            : Math.min(s.numberOfFrames, Math.round((this.until - s.timestamp) * s.sampleRate));
        if (keep <= lead) {
          // Wholly past `until`: this pass is over (a loop starts again, as at the source's end).
          s.close();
          void this.gen?.return();
          this.gen = null;
          if (!this.loop) return null;
          continue;
        }
        const planes = Array.from({ length: s.numberOfChannels }, (_, c) => {
          const plane = new Float32Array(s.numberOfFrames);
          s.copyTo(plane, { planeIndex: c, format: "f32-planar" });
          return plane.subarray(Math.min(lead, plane.length), keep);
        });
        s.close();
        return this.resampler.process(mixChannels(planes, this.channels));
      }
      this.gen = null;
      if (!this.loop) return null;
      // Loop: start again from `from`. A second empty pass means the range holds no audio.
    }
    return null;
  }

  async read(n: number): Promise<Float32Array[]> {
    const out = Array.from({ length: this.channels }, () => new Float32Array(n));
    let filled = 0;
    while (filled < n && !this.ended) {
      const have = (this.pending[0]?.length ?? 0) - this.pendingPos;
      if (have <= 0) {
        const chunk = await this.next();
        if (!chunk) {
          this.ended = true;
          break;
        }
        this.pending = chunk;
        this.pendingPos = 0;
        continue;
      }
      const take = Math.min(have, n - filled);
      for (let c = 0; c < this.channels; c++) {
        const src = this.pending[c] ?? this.pending[0];
        if (src) out[c]?.set(src.subarray(this.pendingPos, this.pendingPos + take), filled);
      }
      this.pendingPos += take;
      filled += take;
    }
    this.delivered += filled;
    return out;
  }

  close() {
    void this.gen?.return();
    this.gen = null;
  }
}
