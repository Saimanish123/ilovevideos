/**
 * Key frame timestamps of the primary video track, read from the container index (MP4 `stss`,
 * Matroska cues and clusters) without decoding. A stream copy can only start a file on one of these.
 * No network access (README.md#privacy-and-processing §2).
 */
import { EncodedPacketSink } from "mediabunny";
import { openInput } from "./shared";

/** Hard cap so a pathological all-intra file cannot stall inspection; ~2.7 h of 1 s GOPs. */
export const MAX_KEYFRAMES = 10_000;

export async function listKeyframes(file: File, limit = MAX_KEYFRAMES): Promise<number[]> {
  const input = openInput(file);
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) return [];
    const sink = new EncodedPacketSink(track);
    const out: number[] = [];
    let packet = await sink.getFirstKeyPacket({ metadataOnly: true });
    while (packet && out.length < limit) {
      out.push(packet.timestamp);
      packet = await sink.getNextKeyPacket(packet, { metadataOnly: true });
    }
    return out.sort((a, b) => a - b);
  } finally {
    input.dispose();
  }
}
