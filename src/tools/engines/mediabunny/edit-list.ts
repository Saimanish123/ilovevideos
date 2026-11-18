/**
 * Writes an edit list (`edts`/`elst`, ISO/IEC 14496-12 §8.6.6) into a finished, non-fragmented MP4 or
 * MOV so players skip an audio encoder's priming samples and stop before its padding, the way ffmpeg
 * and Apple signal AAC encoder delay. mediabunny's muxer can only write an empty edit (a start
 * offset), never a media time, so the WebCodecs AAC encoder's delay would otherwise play as silence
 * at the start and push the sound late (see ./priming).
 *
 * Pure: works on bytes, no DOM, no mediabunny. Only the `moov` prefix is copied; the media data is
 * passed through as a view. No network access.
 */

export interface PrimingEdit {
  /** Track ID (`tkhd`) of the audio track to edit. */
  trackId: number;
  /** Encoder delay to skip at the start of the media, in seconds. */
  primingSec: number;
  /**
   * Presentation time (movie time, seconds) the track should end by, e.g. the length of the sound fed
   * to the encoder. Caps the edit so the encoder's padding is not played. Omit to play to the media end.
   */
  endSec?: number;
  /**
   * For an Opus track: the pre-skip (48 kHz samples) to write into its `dOps` box as well, so the
   * box and the edit agree (Opus in ISOBMFF §4.3).
   */
  opusPreSkip?: number;
  /**
   * Seconds every packet of the track decodes to (1024 / rate for AAC-LC). When set, the sample
   * table's durations are rewritten to it first: WebKit's AAC encoder (Safari 26.5 engine) stamps
   * its chunks about 2.4 % long, so the table said 3.14 s for 3 s of sound and players cut the
   * sound short and off its start.
   */
  frameSec?: number;
  /**
   * Movie time (seconds) the track's sound starts at, when known: it replaces the start mediabunny
   * derived from the first packet's timestamp. WebKit stamps each AAC packet with the time of the
   * input that completed it (13.5 ms for the first, measured), which became a 13.5 ms empty edit.
   */
  startSec?: number;
}

interface Box {
  type: string;
  start: number;
  /** Bytes of the size/type header (8, or 16 with a 64-bit size). */
  header: number;
  end: number;
}

const U32_MAX = 0xffff_ffff;

function readBox(view: DataView, pos: number, limit: number): Box | null {
  if (pos + 8 > limit) return null;
  let size = view.getUint32(pos);
  const type = String.fromCharCode(
    view.getUint8(pos + 4),
    view.getUint8(pos + 5),
    view.getUint8(pos + 6),
    view.getUint8(pos + 7),
  );
  let header = 8;
  if (size === 1) {
    if (pos + 16 > limit) return null;
    size = Number(view.getBigUint64(pos + 8));
    header = 16;
  } else if (size === 0) {
    size = limit - pos;
  }
  if (size < header || pos + size > limit) return null;
  return { type, start: pos, header, end: pos + size };
}

function children(view: DataView, parent: Box, skip = 0): Box[] {
  const out: Box[] = [];
  let pos = parent.start + parent.header + skip;
  while (pos < parent.end) {
    const b = readBox(view, pos, parent.end);
    if (!b) break;
    out.push(b);
    pos = b.end;
  }
  return out;
}

const child = (view: DataView, parent: Box | undefined, type: string, skip = 0) =>
  parent ? children(view, parent, skip).find((b) => b.type === type) : undefined;

/** Adds `delta` to a box's size field (32- or 64-bit). */
function growBox(view: DataView, box: Box, delta: number) {
  if (box.header === 16) {
    view.setBigUint64(box.start + 8, view.getBigUint64(box.start + 8) + BigInt(delta));
  } else {
    const size = view.getUint32(box.start);
    if (size === 0) return; // "to the end of the file" stays true
    if (size + delta > U32_MAX) throw new RangeError("box too large");
    view.setUint32(box.start, size + delta);
  }
}

/** Version-dependent duration field of `mvhd`/`tkhd`/`mdhd`. */
function durationField(view: DataView, box: Box, v0: number, v1: number) {
  const version = view.getUint8(box.start + box.header);
  const at = box.start + box.header + (version === 1 ? v1 : v0);
  return {
    version,
    get: () => (version === 1 ? Number(view.getBigUint64(at)) : view.getUint32(at)),
    set: (value: number) => {
      if (version === 1) view.setBigUint64(at, BigInt(value));
      else if (value > U32_MAX) throw new RangeError("duration too large");
      else view.setUint32(at, value);
    },
  };
}

function elstBytes(entries: { duration: number; mediaTime: number }[]): Uint8Array<ArrayBuffer> {
  const wide = entries.some((e) => e.duration > U32_MAX || e.mediaTime > 0x7fff_ffff);
  const entrySize = wide ? 20 : 12;
  const elstSize = 16 + entries.length * entrySize;
  const bytes = new Uint8Array(8 + elstSize);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, bytes.length);
  bytes.set([0x65, 0x64, 0x74, 0x73], 4); // edts
  view.setUint32(8, elstSize);
  bytes.set([0x65, 0x6c, 0x73, 0x74], 12); // elst
  view.setUint8(16, wide ? 1 : 0);
  view.setUint32(20, entries.length);
  let pos = 24;
  for (const e of entries) {
    if (wide) {
      view.setBigUint64(pos, BigInt(e.duration));
      view.setBigInt64(pos + 8, BigInt(e.mediaTime));
      pos += 16;
    } else {
      view.setUint32(pos, e.duration);
      view.setInt32(pos + 4, e.mediaTime);
      pos += 8;
    }
    view.setUint32(pos, 0x0001_0000); // media rate 1.0
    pos += 4;
  }
  return bytes;
}

/** Leading empty edits (movie timescale) of an existing `elst`, or null when it already offsets media. */
function emptyEditLead(view: DataView, edts: Box | undefined): number | null {
  const elst = child(view, edts, "elst");
  if (!elst) return 0;
  const base = elst.start + elst.header;
  const version = view.getUint8(base);
  const count = view.getUint32(base + 4);
  let pos = base + 8;
  let lead = 0;
  let media = 0;
  for (let i = 0; i < count; i++) {
    const duration = version === 1 ? Number(view.getBigUint64(pos)) : view.getUint32(pos);
    const mediaTime = version === 1 ? Number(view.getBigInt64(pos + 8)) : view.getInt32(pos + 4);
    pos += version === 1 ? 20 : 12;
    if (mediaTime === -1) {
      if (media === 0) lead += duration;
      continue;
    }
    media++;
    // Someone already chose where the media starts; do not stack a second offset on it.
    if (mediaTime !== 0 || media > 1) return null;
  }
  return lead;
}

/** Writes the pre-skip into the `dOps` box of a track's Opus sample entry, in place. */
function setDopsPreSkip(view: DataView, trak: Box, preSkip: number) {
  const stbl = child(view, child(view, child(view, trak, "mdia"), "minf"), "stbl");
  // stsd: full box header (4) and entry count (4); an audio sample entry has 28 bytes of fields.
  const opus = child(view, child(view, stbl, "stsd"), "Opus", 8);
  const dops = child(view, opus, "dOps", 28);
  if (dops && dops.end - dops.start >= dops.header + 4)
    view.setUint16(dops.start + dops.header + 2, preSkip);
}

/**
 * Returns the file as parts with the edits applied (concatenate them, e.g. `new Blob(parts)`), or
 * null when nothing could be edited: not an MP4/MOV, fragmented, no matching track, or the track
 * already has a media offset.
 */
export function applyPrimingEdits(
  file: Uint8Array<ArrayBuffer>,
  edits: PrimingEdit[],
  /**
   * False when `file` holds the moov alone, taken from the end of a file (./output-store streams
   * MP4 with its index last): the media data comes before it and does not move.
   */
  dataMoves = true,
): Uint8Array<ArrayBuffer>[] | null {
  const whole = new DataView(file.buffer, file.byteOffset, file.byteLength);
  let moov: Box | undefined;
  for (let pos = 0; pos < file.byteLength; ) {
    const b = readBox(whole, pos, file.byteLength);
    if (!b) return null;
    if (b.type === "moov") {
      moov = b;
      break;
    }
    pos = b.end;
  }
  if (!moov) return null;

  // Edit a copy of everything up to the end of moov (ftyp + moov with fast start: kilobytes).
  const head = file.slice(0, moov.end);
  const view = new DataView(head.buffer);
  const moovKids = children(view, moov);
  if (moovKids.some((b) => b.type === "mvex")) return null;
  const mvhd = moovKids.find((b) => b.type === "mvhd");
  if (!mvhd) return null;
  const movieScale = view.getUint32(
    mvhd.start + mvhd.header + (view.getUint8(mvhd.start + mvhd.header) === 1 ? 20 : 12),
  );
  if (!(movieScale > 0)) return null;
  const traks = moovKids.filter((b) => b.type === "trak");

  const inserts: { at: number; removeTo: number; bytes: Uint8Array<ArrayBuffer>; trak: Box }[] = [];
  try {
    for (const edit of edits) {
      const trak = traks.find((t) => {
        const tkhd = child(view, t, "tkhd");
        if (!tkhd) return false;
        const v = view.getUint8(tkhd.start + tkhd.header);
        return view.getUint32(tkhd.start + tkhd.header + (v === 1 ? 20 : 12)) === edit.trackId;
      });
      if (!trak) continue;
      const tkhd = child(view, trak, "tkhd");
      const edts = child(view, trak, "edts");
      const mdia = child(view, trak, "mdia");
      const mdhd = child(view, mdia, "mdhd");
      const hdlr = child(view, mdia, "hdlr");
      if (!tkhd || !mdhd || !hdlr) continue;
      const handler = String.fromCharCode(
        ...head.subarray(hdlr.start + hdlr.header + 8, hdlr.start + hdlr.header + 12),
      );
      if (handler !== "soun") continue;
      const lead =
        edit.startSec !== undefined
          ? Math.max(0, Math.round(edit.startSec * movieScale))
          : emptyEditLead(view, edts);
      if (lead === null) continue;

      const mdhdVersion = view.getUint8(mdhd.start + mdhd.header);
      const mediaScale = view.getUint32(mdhd.start + mdhd.header + (mdhdVersion === 1 ? 20 : 12));
      if (!(mediaScale > 0)) continue;
      if (edit.frameSec !== undefined) {
        const stbl = child(view, child(view, mdia, "minf"), "stbl");
        const stts = child(view, stbl, "stts");
        if (stts) {
          const base = stts.start + stts.header;
          const count = view.getUint32(base + 4);
          const delta = Math.round(edit.frameSec * mediaScale);
          let total = 0;
          for (let i = 0; i < count; i++) {
            view.setUint32(base + 12 + i * 8, delta);
            total += view.getUint32(base + 8 + i * 8) * delta;
          }
          durationField(view, mdhd, 16, 24).set(total);
        }
      }
      const mediaDur = durationField(view, mdhd, 16, 24).get();
      const priming = Math.round(edit.primingSec * mediaScale);
      if (priming <= 0 || priming >= mediaDur) continue;
      let keepSec = (mediaDur - priming) / mediaScale;
      if (edit.endSec !== undefined && Number.isFinite(edit.endSec)) {
        keepSec = Math.min(keepSec, edit.endSec - lead / movieScale);
      }
      const keep = Math.round(keepSec * movieScale);
      if (keep <= 0) continue;

      const entries = [
        ...(lead > 0 ? [{ duration: lead, mediaTime: -1 }] : []),
        { duration: keep, mediaTime: priming },
      ];
      const bytes = elstBytes(entries);
      durationField(view, tkhd, 20, 28).set(lead + keep);
      if (edit.opusPreSkip !== undefined) setDopsPreSkip(view, trak, edit.opusPreSkip);
      inserts.push({
        at: edts ? edts.start : tkhd.end,
        removeTo: edts ? edts.end : tkhd.end,
        bytes,
        trak,
      });
    }
    if (inserts.length === 0) return null;
    inserts.sort((a, b) => a.at - b.at);

    // Sizes: each edited trak and moov grow by what their edit adds.
    let total = 0;
    for (const ins of inserts) {
      const delta = ins.bytes.length - (ins.removeTo - ins.at);
      growBox(view, ins.trak, delta);
      total += delta;
    }
    growBox(view, moov, total);

    // Movie duration: the longest track as presented.
    let longest = 0;
    for (const trak of traks) {
      const tkhd = child(view, trak, "tkhd");
      if (tkhd) longest = Math.max(longest, durationField(view, tkhd, 20, 28).get());
    }
    durationField(view, mvhd, 16, 24).set(longest);

    // Chunk offsets past an insertion move by what was inserted before them.
    const shift = (offset: number) => {
      if (!dataMoves) return offset;
      let d = 0;
      for (const ins of inserts)
        if (offset >= ins.removeTo) d += ins.bytes.length - (ins.removeTo - ins.at);
      return offset + d;
    };
    for (const trak of traks) {
      const stbl = child(view, child(view, child(view, trak, "mdia"), "minf"), "stbl");
      for (const table of stbl ? children(view, stbl) : []) {
        if (table.type !== "stco" && table.type !== "co64") continue;
        const base = table.start + table.header;
        const count = view.getUint32(base + 4);
        for (let i = 0; i < count; i++) {
          if (table.type === "stco") {
            const next = shift(view.getUint32(base + 8 + i * 4));
            if (next > U32_MAX) return null;
            view.setUint32(base + 8 + i * 4, next);
          } else {
            const at = base + 8 + i * 8;
            view.setBigUint64(at, BigInt(shift(Number(view.getBigUint64(at)))));
          }
        }
      }
    }
  } catch (e) {
    if (e instanceof RangeError) return null;
    throw e;
  }

  const parts: Uint8Array<ArrayBuffer>[] = [];
  let from = 0;
  for (const ins of inserts) {
    parts.push(head.subarray(from, ins.at), ins.bytes);
    from = ins.removeTo;
  }
  parts.push(head.subarray(from));
  if (moov.end < file.byteLength) parts.push(file.subarray(moov.end));
  return parts;
}

/**
 * Top-level boxes of an MP4/MOV read from a Blob, headers only (a few reads, any file size). Null
 * when the bytes are not boxes.
 */
export async function topLevelBoxes(
  blob: Blob,
): Promise<{ type: string; start: number; end: number }[] | null> {
  const out: { type: string; start: number; end: number }[] = [];
  for (let pos = 0; pos < blob.size; ) {
    const h = new DataView(await blob.slice(pos, pos + 16).arrayBuffer());
    if (h.byteLength < 8) return null;
    let size = h.getUint32(0);
    const type = String.fromCharCode(h.getUint8(4), h.getUint8(5), h.getUint8(6), h.getUint8(7));
    if (size === 1) {
      if (h.byteLength < 16) return null;
      size = Number(h.getBigUint64(8));
    } else if (size === 0) size = blob.size - pos;
    if (size < 8 || pos + size > blob.size) return null;
    out.push({ type, start: pos, end: pos + size });
    pos += size;
  }
  return out;
}

/**
 * For an MP4/MOV whose moov is its last box (a streamed output, ./output-store): reads the moov,
 * lets `edit` change it (in place, or by returning it as new parts), and returns the whole file as
 * Blob parts: the untouched media as a slice of `blob`, then the moov. Null when the layout differs
 * or `edit` changed nothing.
 */
export async function editTrailingMoov(
  blob: Blob,
  edit: (moov: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>[] | boolean | null,
): Promise<BlobPart[] | null> {
  const boxes = await topLevelBoxes(blob);
  const moov = boxes?.at(-1);
  if (!boxes || moov?.type !== "moov") return null;
  const bytes = new Uint8Array(await blob.slice(moov.start, moov.end).arrayBuffer());
  const r = edit(bytes);
  if (r === null || r === false) return null;
  return [blob.slice(0, moov.start), ...(r === true ? [bytes] : r)];
}
