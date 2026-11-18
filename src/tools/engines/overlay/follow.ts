/**
 * Reads a second video in step with the one being encoded (a green screen's background video; a
 * picture-in-picture inset): `frameAt(t)` gives the frame showing at `t` seconds of that video,
 * decoding forwards through one iterator and starting a new one only when time jumps back (a loop)
 * or far ahead. One frame is held at a time; the previous one is closed when the next is taken.
 * Runs in the engine worker; no network access.
 */
import type { InputVideoTrack, VideoSample } from "mediabunny";
import { VideoSampleSink } from "mediabunny";
import { openInput } from "../mediabunny/shared";

/** A jump ahead larger than this starts a new iterator instead of decoding through the gap. */
const SKIP_SEC = 2;

export class FrameFollower {
  private readonly input: ReturnType<typeof openInput>;
  private track: InputVideoTrack | null = null;
  private sink: VideoSampleSink | null = null;
  private iter: AsyncGenerator<VideoSample, void, unknown> | null = null;
  private current: VideoSample | null = null;
  private next: VideoSample | null = null;
  private ended = false;
  /** Source time of the file's first frame; `frameAt` takes times from 0. */
  private start = 0;

  /** `name` tells containers apart that sniffing alone cannot (a Blob carries none). */
  constructor(file: Blob, name = "video") {
    this.input = openInput(file instanceof File ? file : new File([file], name));
  }

  /** Opens the file's main picture; false when it has none or it cannot be decoded here. */
  async open(): Promise<boolean> {
    this.track = await this.input.getPrimaryVideoTrack();
    if (!this.track || !(await this.track.canDecode())) return false;
    this.sink = new VideoSampleSink(this.track);
    this.start = await this.track.getFirstTimestamp();
    return true;
  }

  private async restart(t: number) {
    await this.iter?.return();
    this.current?.close();
    this.next?.close();
    this.current = null;
    this.next = null;
    this.ended = false;
    this.iter = this.sink?.samples(this.start + t) ?? null;
    const first = await this.iter?.next();
    this.current = first && !first.done ? first.value : null;
    const second = await this.iter?.next();
    this.next = second && !second.done ? second.value : null;
    this.ended = !this.next;
  }

  /** The frame showing at `t` seconds from the file's start (the last one past its end). */
  async frameAt(t: number): Promise<VideoSample | null> {
    if (!this.sink) return null;
    const at = this.start + t;
    if (
      !this.current ||
      at < this.current.timestamp - 1e-6 ||
      at - this.current.timestamp > SKIP_SEC
    )
      await this.restart(Math.max(0, t));
    while (!this.ended && this.next && this.next.timestamp <= at + 1e-6) {
      this.current?.close();
      this.current = this.next;
      const r = await this.iter?.next();
      this.next = r && !r.done ? r.value : null;
      if (!this.next) this.ended = true;
    }
    return this.current;
  }

  async dispose() {
    await this.iter?.return().catch(() => undefined);
    this.current?.close();
    this.next?.close();
    this.current = null;
    this.next = null;
    this.input.dispose();
  }
}
