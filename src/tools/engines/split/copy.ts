/**
 * Lossless split: copies the encoded packets between two key frames into each part (the shared
 * packet copy in ../mediabunny/packet-copy), shifting timestamps so every part starts at zero.
 * Nothing is decoded. The equivalent of ffmpeg's segment muxer with `-c copy`.
 * Runs in the engine worker; no network access.
 */
import { classifyError, EngineError } from "../errors";
import { assertCopyable, copyPackets } from "../mediabunny/packet-copy";
import type { ContainerId } from "../mediabunny/shared";
import { openClip } from "../merge/concat";
import type { EngineContext } from "../types";
import type { Part } from "./math";

export interface CopyPart {
  part: Part;
  /** Ratio 0–1 of this part written, for the caller's overall progress. */
  onProgress: (ratio: number) => void;
}

/** Writes each part in turn; returns one Blob per part, in order. */
export async function splitCopy(
  file: File,
  parts: CopyPart[],
  to: ContainerId,
  ctx: EngineContext,
  /** Source time of the file's start (MediaInfo.startSec): parts are in page time from 0. */
  offset = 0,
): Promise<Blob[]> {
  const clip = await openClip(file);
  const out: Blob[] = [];
  try {
    assertCopyable(clip, to);
    for (const [index, { part, onProgress }] of parts.entries()) {
      if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
      const last = index === parts.length - 1;
      // Cut points are key frames: each part stops before the next part's key frame.
      const { blob } = await copyPackets(
        clip,
        { start: part.start + offset, end: last ? undefined : part.end + offset },
        to,
        ctx,
        onProgress,
      );
      out.push(blob);
    }
  } catch (e) {
    if (ctx.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
    throw classifyError(e);
  } finally {
    clip.input.dispose();
  }
  return out;
}
