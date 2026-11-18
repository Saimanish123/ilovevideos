/**
 * Reads the recording time from an MP4/MOV movie header (`moov/mvhd`). Cameras and ffmpeg store the
 * capture time there, and mediabunny's reader skips it, so the remove-metadata panel would otherwise
 * not list a date the file does carry. Reads a few small slices, never the whole file. Pure; unit-tested.
 */

/** Seconds between the ISO BMFF epoch (1904-01-01) and the Unix epoch. */
const EPOCH_OFFSET = 2_082_844_800;
const MAX_BOXES = 64;

export interface Box {
  type: string;
  start: number;
  headerSize: number;
  size: number;
}

/**
 * One box header read from a Blob at `at` (never past `end`), or undefined when the bytes there are
 * not a well-formed box. Reads 16 bytes; shared with the tag editor (engines/edit-metadata).
 */
export async function readBox(blob: Blob, at: number, end: number): Promise<Box | undefined> {
  if (at + 8 > end) return undefined;
  const view = new DataView(await blob.slice(at, Math.min(at + 16, end)).arrayBuffer());
  let size = view.getUint32(0);
  const type = String.fromCharCode(
    view.getUint8(4),
    view.getUint8(5),
    view.getUint8(6),
    view.getUint8(7),
  );
  let headerSize = 8;
  if (size === 1) {
    if (view.byteLength < 16) return undefined;
    size = Number(view.getBigUint64(8));
    headerSize = 16;
  } else if (size === 0) {
    size = end - at;
  }
  if (size < headerSize || at + size > end) return undefined;
  return { type, start: at, headerSize, size };
}

/** The first box of `type` among the boxes from `from` to `end`, reading headers only. */
export async function findChild(
  blob: Blob,
  from: number,
  end: number,
  type: string,
): Promise<Box | undefined> {
  let at = from;
  for (let i = 0; i < MAX_BOXES; i++) {
    const box = await readBox(blob, at, end);
    if (!box) return undefined;
    if (box.type === type) return box;
    at += box.size;
  }
  return undefined;
}

/** ISO 8601 recording time from `mvhd`, or undefined when the file has none (or is not ISO BMFF). */
export async function readMovieHeaderTime(blob: Blob): Promise<string | undefined> {
  try {
    const moov = await findChild(blob, 0, blob.size, "moov");
    if (!moov) return undefined;
    const mvhd = await findChild(
      blob,
      moov.start + moov.headerSize,
      moov.start + moov.size,
      "mvhd",
    );
    if (!mvhd) return undefined;
    const body = new DataView(
      await blob
        .slice(mvhd.start + mvhd.headerSize, mvhd.start + mvhd.headerSize + 12)
        .arrayBuffer(),
    );
    const version = body.getUint8(0);
    const seconds = version === 1 ? Number(body.getBigUint64(4)) : body.getUint32(4);
    // 0 means "not set"; anything before 1990 is a camera with an unset clock, not a real capture time.
    const unix = seconds - EPOCH_OFFSET;
    if (seconds === 0 || unix < 631_152_000) return undefined;
    const date = new Date(unix * 1000);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  } catch {
    return undefined;
  }
}

/**
 * Sets the creation and modification times of `mvhd`, every `tkhd` and every `mdhd` to 0 ("not
 * set"), in place, in a finished MP4/MOV. mediabunny stamps them with the time the file was written,
 * which a file whose metadata was removed must not carry either. Returns how many headers it
 * cleared (0 when the bytes are not ISO BMFF). Box sizes do not change, so nothing else moves.
 */
export function clearMovieTimes(file: Uint8Array): number {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const boxes = (from: number, to: number) => {
    const out: { type: string; start: number; body: number; end: number }[] = [];
    for (let at = from; at + 8 <= to && out.length < MAX_BOXES * 4; ) {
      let size = view.getUint32(at);
      let header = 8;
      if (size === 1) {
        if (at + 16 > to) break;
        size = Number(view.getBigUint64(at + 8));
        header = 16;
      } else if (size === 0) size = to - at;
      if (size < header || at + size > to) break;
      const type = String.fromCharCode(...file.subarray(at + 4, at + 8));
      out.push({ type, start: at, body: at + header, end: at + size });
      at += size;
    }
    return out;
  };
  const clear = (box: { body: number; end: number }) => {
    if (box.body + 20 > box.end) return 0;
    if (view.getUint8(box.body) === 1) {
      view.setBigUint64(box.body + 4, 0n);
      view.setBigUint64(box.body + 12, 0n);
    } else {
      view.setUint32(box.body + 4, 0);
      view.setUint32(box.body + 8, 0);
    }
    return 1;
  };
  const moov = boxes(0, file.byteLength).find((b) => b.type === "moov");
  if (!moov) return 0;
  let cleared = 0;
  for (const box of boxes(moov.body, moov.end)) {
    if (box.type === "mvhd") cleared += clear(box);
    if (box.type !== "trak") continue;
    for (const t of boxes(box.body, box.end)) {
      if (t.type === "tkhd") cleared += clear(t);
      if (t.type !== "mdia") continue;
      for (const m of boxes(t.body, t.end)) if (m.type === "mdhd") cleared += clear(m);
    }
  }
  return cleared;
}
