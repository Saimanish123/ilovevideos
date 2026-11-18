/**
 * Timing of sound in WebM and Matroska files: reads each track's start delay (`readMatroskaDelays`)
 * and rewrites a finished file so its sound states the real delay and the real end
 * (`rewriteMatroska`; `fixMatroskaOpus` for Opus encoded here, packet copies in ./packet-copy).
 *
 * For Opus encoded here, as the Matroska Opus mapping asks: `CodecDelay` holds the pre-skip, `SeekPreRoll` 80 ms,
 * the OpusHead in `CodecPrivate` the same pre-skip, and the last block carries `DiscardPadding` for
 * the encoder's padding (blocks wholly past the end are dropped). mediabunny 1.55.5 writes a
 * CodecDelay of 0, puts the pre-skip in SeekPreRoll and has no DiscardPadding (./opus-delay).
 *
 * The segment is written again around the changed elements: sizes, SeekHead positions and Cues
 * cluster positions are recomputed; every untouched element is passed through as a view of the
 * original bytes. Works on mediabunny's layout (known sizes, no lacing, Cues after the clusters);
 * anything else is left alone (null).
 *
 * Bytes in, byte parts out; `sourceDelay` reads the head of a local file. No network access.
 */
import type { InputAudioTrack } from "mediabunny";
import { fileOfInput } from "./input-files";
import { opusPacketSamples, readOpusHead, setOpusHeadPreSkip } from "./opus-delay";

const ID = {
  segment: 0x18538067,
  seekHead: 0x114d9b74,
  seek: 0x4dbb,
  seekPosition: 0x53ac,
  info: 0x1549a966,
  timestampScale: 0x2ad7b1,
  duration: 0x4489,
  tracks: 0x1654ae6b,
  trackEntry: 0xae,
  trackNumber: 0xd7,
  codecId: 0x86,
  codecPrivate: 0x63a2,
  codecDelay: 0x56aa,
  seekPreRoll: 0x56bb,
  cluster: 0x1f43b675,
  timestamp: 0xe7,
  simpleBlock: 0xa3,
  blockGroup: 0xa0,
  block: 0xa1,
  discardPadding: 0x75a2,
  cues: 0x1c53bb6b,
  cuePoint: 0xbb,
  cueTrackPositions: 0xb7,
  cueTrack: 0xf7,
  cueClusterPosition: 0xf1,
  cueRelativePosition: 0xf0,
} as const;

/** SeekPreRoll the Matroska Opus mapping asks for (80 ms, in nanoseconds). */
const OPUS_SEEK_PRE_ROLL = 80_000_000;

interface El {
  id: number;
  /** Absolute offsets: element start, payload start, payload end. */
  start: number;
  data: number;
  end: number;
  /** Width of the size field, kept when the element is written again. */
  sizeWidth: number;
}

function readVint(b: Uint8Array, p: number, keepMarker: boolean): { value: number; len: number } {
  const first = b[p] ?? 0;
  let len = 1;
  while (len <= 8 && !(first & (0x80 >> (len - 1)))) len++;
  if (len > 8) return { value: -1, len: 1 };
  let value = keepMarker ? first : first & (0xff >> len);
  let allOnes = (first & (0xff >> len)) === 0xff >> len;
  for (let i = 1; i < len; i++) {
    const byte = b[p + i] ?? 0;
    value = value * 256 + byte;
    if (byte !== 0xff) allOnes = false;
  }
  return { value: !keepMarker && allOnes ? -1 : value, len };
}

function readEl(b: Uint8Array, p: number, limit: number): El | null {
  if (p >= limit) return null;
  const id = readVint(b, p, true);
  const size = readVint(b, p + id.len, false);
  if (size.value < 0) return null; // unknown size: not mediabunny's layout
  const data = p + id.len + size.len;
  const end = data + size.value;
  if (end > limit) return null;
  return { id: id.value, start: p, data, end, sizeWidth: size.len };
}

function kids(b: Uint8Array, parent: { data: number; end: number }): El[] | null {
  const out: El[] = [];
  for (let p = parent.data; p < parent.end; ) {
    const el = readEl(b, p, parent.end);
    if (!el) return null;
    out.push(el);
    p = el.end;
  }
  return out;
}

const readUint = (b: Uint8Array, el: El) => {
  let v = 0;
  for (let i = el.data; i < el.end; i++) v = v * 256 + (b[i] ?? 0);
  return v;
};

function idBytes(id: number): number[] {
  const out: number[] = [];
  for (let v = id; v > 0; v = Math.floor(v / 256)) out.unshift(v & 0xff);
  return out;
}

function sizeBytes(size: number, width?: number): number[] {
  let w = width ?? 1;
  while (size >= 2 ** (7 * w) - 1) w++;
  if (w > 8) throw new RangeError("element too large");
  const out = new Array<number>(w).fill(0);
  let v = size;
  for (let i = w - 1; i >= 0; i--) {
    out[i] = v % 256;
    v = Math.floor(v / 256);
  }
  out[0] = (out[0] ?? 0) | (0x80 >> (w - 1));
  return out;
}

function uintBytes(v: number, width?: number): number[] {
  const out: number[] = [];
  for (let x = v; x > 0; x = Math.floor(x / 256)) out.unshift(x % 256);
  while (out.length < (width ?? 1)) out.unshift(0);
  return out;
}

/** Big-endian two's complement in as few bytes as hold the sign. */
function intBytes(v: number): number[] {
  for (let w = 1; w <= 8; w++) {
    if (v >= -(2 ** (8 * w - 1)) && v < 2 ** (8 * w - 1)) {
      const out: number[] = [];
      let x = BigInt.asUintN(8 * w, BigInt(v));
      for (let i = 0; i < w; i++) {
        out.unshift(Number(x & 0xffn));
        x >>= 8n;
      }
      return out;
    }
  }
  throw new RangeError("integer too large");
}

/** An element as parts: header bytes then payload parts. */
type Parts = Uint8Array[];
const partsLength = (parts: Parts) => parts.reduce((n, p) => n + p.length, 0);
function element(id: number, payload: Parts, sizeWidth?: number): Parts {
  return [
    Uint8Array.from([...idBytes(id), ...sizeBytes(partsLength(payload), sizeWidth)]),
    ...payload,
  ];
}
const leaf = (id: number, bytes: number[]) => element(id, [Uint8Array.from(bytes)]);

export interface OpusTrackHead {
  trackNumber: number;
  channels: number;
  preSkip: number;
  inputRate: number;
}

interface Layout {
  ebmlEnd: number;
  segment: El;
  children: El[];
}

function layout(b: Uint8Array): Layout | null {
  const ebml = readEl(b, 0, b.length);
  if (ebml?.id !== 0x1a45dfa3) return null;
  const segment = readEl(b, ebml.end, b.length);
  if (segment?.id !== ID.segment) return null;
  const children = kids(b, segment);
  return children ? { ebmlEnd: ebml.end, segment, children } : null;
}

function opusEntries(b: Uint8Array, tracks: El | undefined) {
  const out: { entry: El; fields: El[]; head: OpusTrackHead }[] = [];
  for (const entry of (tracks && kids(b, tracks)) ?? []) {
    if (entry.id !== ID.trackEntry) continue;
    const fields = kids(b, entry);
    if (!fields) continue;
    const codec = fields.find((f) => f.id === ID.codecId);
    const priv = fields.find((f) => f.id === ID.codecPrivate);
    const number = fields.find((f) => f.id === ID.trackNumber);
    if (!codec || !priv || !number) continue;
    if (String.fromCharCode(...b.subarray(codec.data, codec.end)) !== "A_OPUS") continue;
    const head = readOpusHead(b.subarray(priv.data, priv.end));
    if (!head) continue;
    out.push({ entry, fields, head: { trackNumber: readUint(b, number), ...head } });
  }
  return out;
}

/** The Opus tracks of a WebM/Matroska file and their OpusHeads; empty when there are none. */
export function matroskaOpusTracks(file: Uint8Array): OpusTrackHead[] {
  const l = layout(file);
  const tracks = l?.children.find((c) => c.id === ID.tracks);
  return l ? opusEntries(file, tracks).map((e) => e.head) : [];
}

interface BlockRef {
  cluster: number;
  el: El;
  /** Offset of the frame data and the lacing bits. */
  frame: number;
  flags: number;
  track: number;
  /** Cluster timestamp plus the block's, in TimestampScale units. */
  time: number;
}

/** What to write for one track (by Matroska track number). */
export interface MatroskaTrackPlan {
  /** CodecDelay in nanoseconds: the decoder output to discard at the start. */
  codecDelayNs?: number;
  /** SeekPreRoll in nanoseconds. */
  seekPreRollNs?: number;
  /** For Opus: the pre-skip (48 kHz samples) to write into the OpusHead in CodecPrivate. */
  opusPreSkip?: number;
  /**
   * Where the track's sound ends, given its block payloads in order and the first block's time
   * (seconds): how many blocks to keep and the DiscardPadding (ns) of the last one kept. Omit to
   * keep every block as it is.
   */
  end?: (
    frames: Uint8Array[],
    firstSec: number,
  ) => { keep: number; discardNs: number; endSec: number };
}

/**
 * Returns the file as parts (`new Blob(parts)`) with each Opus track's pre-skip (`preSkip`, by track
 * number; the file's own when missing) and end (`endSec` of sound) written, or null when there is
 * nothing to fix or the layout is not one this handles. `tracks` limits it to those track numbers.
 */
export function fixMatroskaOpus(
  file: Uint8Array<ArrayBuffer>,
  fix: {
    endSec: number;
    preSkip: Map<number, number>;
    tracks?: Set<number>;
    /** Further plans for other tracks (encoded AAC), written in the same pass. */
    more?: Map<number, MatroskaTrackPlan>;
  },
): Uint8Array<ArrayBuffer>[] | null {
  const plans = new Map<number, MatroskaTrackPlan>();
  for (const head of matroskaOpusTracks(file)) {
    if (fix.tracks && !fix.tracks.has(head.trackNumber)) continue;
    const preSkip = fix.preSkip.get(head.trackNumber) ?? head.preSkip;
    plans.set(head.trackNumber, {
      codecDelayNs: Math.round((preSkip / 48_000) * 1e9),
      seekPreRollNs: OPUS_SEEK_PRE_ROLL,
      opusPreSkip: preSkip,
      end: opusEnd(preSkip, fix.endSec),
    });
  }
  for (const [n, plan] of fix.more ?? []) plans.set(n, plan);
  return rewriteMatroska(file, plans);
}

/**
 * The plan for an AAC track encoded here: CodecDelay for the encoder's priming (`priming` samples at
 * `rate`), and the end at `endSec` by whole frames of `frame` samples (1024 for AAC-LC).
 */
export function aacPlan(
  priming: number,
  rate: number,
  endSec: number,
  frame = 1024,
): MatroskaTrackPlan {
  return {
    codecDelayNs: Math.round((priming / rate) * 1e9),
    end: (frames, firstSec) => {
      const total = frames.length * frame;
      const end = Math.min(total, priming + Math.max(0, Math.round((endSec - firstSec) * rate)));
      const keep = Math.max(1, Math.ceil(end / frame));
      return {
        keep,
        discardNs: Math.round(((keep * frame - end) / rate) * 1e9),
        endSec: firstSec + (end - priming) / rate,
      };
    },
  };
}

/** Sound tracks of a Matroska/WebM file: number, codec id, rate and channel count. */
export function matroskaSoundTracks(
  file: Uint8Array,
): { trackNumber: number; codecId: string; rate: number; channels: number }[] {
  const l = layout(file);
  const tracks = l?.children.find((c) => c.id === ID.tracks);
  const out: { trackNumber: number; codecId: string; rate: number; channels: number }[] = [];
  for (const entry of (tracks && kids(file, tracks)) ?? []) {
    if (entry.id !== ID.trackEntry) continue;
    const fields = kids(file, entry) ?? [];
    const number = fields.find((f) => f.id === ID.trackNumber);
    const codec = fields.find((f) => f.id === ID.codecId);
    const audio = fields.find((f) => f.id === 0xe1);
    if (!number || !codec || !audio) continue;
    const a = kids(file, audio) ?? [];
    const freq = a.find((f) => f.id === 0xb5);
    const ch = a.find((f) => f.id === 0x9f);
    const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
    const rate = !freq
      ? 8000
      : freq.end - freq.data === 8
        ? view.getFloat64(freq.data)
        : view.getFloat32(freq.data);
    out.push({
      trackNumber: readUint(file, number),
      codecId: String.fromCharCode(...file.subarray(codec.data, codec.end)),
      rate,
      channels: ch ? readUint(file, ch) : 1,
    });
  }
  return out;
}

/**
 * The `end` step for an Opus track: with `preSkip` samples at the start, the sound ends at `endSec`
 * (presentation time); blocks are counted by their own sample counts (TOC), exact to the sample.
 */
export function opusEnd(preSkip: number, endSec: number): NonNullable<MatroskaTrackPlan["end"]> {
  return (frames, firstSec) => {
    const total = frames.reduce((n, f) => n + opusPacketSamples(f), 0);
    // The track's sound starts where its first block does.
    const end = Math.min(total, preSkip + Math.max(0, Math.round((endSec - firstSec) * 48_000)));
    let at = 0;
    let keep = 0;
    for (const f of frames) {
      if (keep > 0 && at >= end) break;
      at += opusPacketSamples(f);
      keep++;
    }
    return {
      keep,
      discardNs: Math.round((Math.max(0, at - end) / 48_000) * 1e9),
      endSec: firstSec + (end - preSkip) / 48_000,
    };
  };
}

/**
 * Rewrites the TrackEntries and blocks of the tracks in `plans` (CodecDelay, SeekPreRoll, OpusHead,
 * blocks past the end dropped, DiscardPadding on the last one kept). Null when there is nothing to
 * do or the layout is not mediabunny's.
 */
export function rewriteMatroska(
  file: Uint8Array<ArrayBuffer>,
  plans: Map<number, MatroskaTrackPlan>,
): Uint8Array<ArrayBuffer>[] | null {
  const b = file;
  const l = layout(b);
  if (!l || plans.size === 0) return null;
  const tracksEl = l.children.find((c) => c.id === ID.tracks);
  if (!tracksEl) return null;
  const firstCluster = l.children.findIndex((c) => c.id === ID.cluster);
  const cuesAt = l.children.findIndex((c) => c.id === ID.cues);
  const lastCluster = l.children.map((c) => c.id).lastIndexOf(ID.cluster);
  if (firstCluster < 0 || (cuesAt >= 0 && cuesAt < lastCluster)) return null;
  if (l.children.findIndex((c) => c.id === ID.tracks) > firstCluster) return null;

  try {
    // Tracks: CodecDelay, SeekPreRoll and the OpusHead of each planned entry.
    const preSkips = new Map<number, number>();
    const entryParts = new Map<number, Parts>();
    for (const entry of kids(b, tracksEl) ?? []) {
      if (entry.id !== ID.trackEntry) continue;
      const fields = kids(b, entry);
      const numberEl = fields?.find((f) => f.id === ID.trackNumber);
      const plan = numberEl ? plans.get(readUint(b, numberEl)) : undefined;
      if (!fields || !numberEl || !plan) continue;
      preSkips.set(readUint(b, numberEl), 0);
      const payload: Parts = [];
      for (const f of fields) {
        if (f.id === ID.codecDelay && plan.codecDelayNs !== undefined) continue;
        if (f.id === ID.seekPreRoll && plan.seekPreRollNs !== undefined) continue;
        if (f.id === ID.codecPrivate && plan.opusPreSkip !== undefined) {
          const opusHead = b.slice(f.data, f.end);
          if (readOpusHead(opusHead)) setOpusHeadPreSkip(opusHead, plan.opusPreSkip);
          payload.push(...element(ID.codecPrivate, [opusHead]));
        } else payload.push(b.subarray(f.start, f.end));
      }
      if (plan.codecDelayNs !== undefined)
        payload.push(...leaf(ID.codecDelay, uintBytes(plan.codecDelayNs)));
      if (plan.seekPreRollNs !== undefined)
        payload.push(...leaf(ID.seekPreRoll, uintBytes(plan.seekPreRollNs)));
      entryParts.set(entry.start, element(ID.trackEntry, payload, entry.sizeWidth));
    }
    if (entryParts.size === 0) return null;
    const tracksPayload: Parts = [];
    for (const entry of kids(b, tracksEl) ?? [])
      tracksPayload.push(...(entryParts.get(entry.start) ?? [b.subarray(entry.start, entry.end)]));
    const tracksParts = element(ID.tracks, tracksPayload, tracksEl.sizeWidth);

    // Blocks of the planned tracks, in file order, to find where each track's sound ends.
    const clusters = l.children.map((c, i) => ({ c, i })).filter(({ c }) => c.id === ID.cluster);
    const clusterKids = new Map<number, El[]>();
    const blocks: BlockRef[] = [];
    let timestampScale = 1e6;
    const info = l.children.find((c) => c.id === ID.info);
    const infoKids = info ? (kids(b, info) ?? []) : [];
    const scaleEl = infoKids.find((k) => k.id === ID.timestampScale);
    if (scaleEl) timestampScale = readUint(b, scaleEl);
    for (const { c, i } of clusters) {
      const ks = kids(b, c);
      if (!ks) return null;
      clusterKids.set(i, ks);
      const tsEl = ks.find((k) => k.id === ID.timestamp);
      const clusterTime = tsEl ? readUint(b, tsEl) : 0;
      for (const k of ks) {
        let blockEl: El | undefined;
        if (k.id === ID.simpleBlock) blockEl = k;
        else if (k.id === ID.blockGroup) blockEl = kids(b, k)?.find((g) => g.id === ID.block);
        if (!blockEl) continue;
        const track = readVint(b, blockEl.data, false);
        if (!preSkips.has(track.value)) continue;
        const flags = b[blockEl.data + track.len + 2] ?? 0;
        if (flags & 0x06) return null; // laced: not mediabunny's
        const rel = new DataView(b.buffer, b.byteOffset + blockEl.data + track.len, 2).getInt16(0);
        blocks.push({
          cluster: i,
          el: k,
          frame: blockEl.data + track.len + 3,
          flags,
          track: track.value,
          time: clusterTime + rel,
        });
      }
    }

    // Per track: the last block holding real sound, how much of it is padding, and what to drop.
    const drop = new Set<number>();
    const pad = new Map<number, number>(); // block start → DiscardPadding in ns
    let soundEndNs = 0;
    for (const track of preSkips.keys()) {
      const own = blocks.filter((x) => x.track === track);
      const plan = plans.get(track);
      const firstSec = ((own[0]?.time ?? 0) * timestampScale) / 1e9;
      if (!plan?.end || own.length === 0) continue;
      const r = plan.end(
        own.map((x) => b.subarray(x.frame, x.el.end)),
        firstSec,
      );
      const keep = Math.max(1, Math.min(own.length, r.keep));
      for (const x of own.slice(keep)) drop.add(x.el.start);
      const lastBlock = own[keep - 1];
      if (lastBlock && r.discardNs > 0) pad.set(lastBlock.el.start, r.discardNs);
      soundEndNs = Math.max(soundEndNs, r.endSec * 1e9);
    }

    // Clusters with a dropped or padded block are written again.
    const changed = new Set<number>();
    for (const x of blocks) if (drop.has(x.el.start) || pad.has(x.el.start)) changed.add(x.cluster);
    const clusterParts = new Map<number, Parts>();
    const keepsOpus = new Map<number, boolean>();
    for (const i of changed) {
      const c = l.children[i];
      const ks = clusterKids.get(i);
      if (!c || !ks) continue;
      const payload: Parts = [];
      let opusLeft = false;
      for (const k of ks) {
        if (drop.has(k.start)) continue;
        const padding = pad.get(k.start);
        const ref = blocks.find((x) => x.el === k);
        if (ref) opusLeft = true;
        if (padding === undefined || !ref) {
          payload.push(b.subarray(k.start, k.end));
          continue;
        }
        // SimpleBlock → BlockGroup { Block, DiscardPadding }. A Block's flags have no keyframe or
        // discardable bit; a BlockGroup without ReferenceBlock is a keyframe anyway.
        const blockData =
          k.id === ID.simpleBlock ? k : (kids(b, k)?.find((g) => g.id === ID.block) ?? k);
        const header = b.slice(blockData.data, ref.frame);
        header[header.length - 1] = ref.flags & 0x0e;
        const groupPayload: Parts = [
          ...element(ID.block, [header, b.subarray(ref.frame, blockData.end)]),
          ...leaf(ID.discardPadding, intBytes(padding)),
        ];
        if (k.id === ID.blockGroup)
          for (const g of kids(b, k) ?? [])
            if (g.id !== ID.block && g.id !== ID.discardPadding)
              groupPayload.push(b.subarray(g.start, g.end));
        payload.push(...element(ID.blockGroup, groupPayload));
      }
      keepsOpus.set(i, opusLeft);
      clusterParts.set(i, element(ID.cluster, payload, c.sizeWidth));
    }

    // Segment Info Duration: never longer than the longest track as now written.
    const infoParts = new Map<number, Parts>();
    const durationEl = infoKids.find((k) => k.id === ID.duration);
    if (info && durationEl && soundEndNs > 0 && durationEl.end - durationEl.data === 8) {
      const old = new DataView(b.buffer, b.byteOffset + durationEl.data, 8).getFloat64(0);
      const otherEnd = otherTracksEnd(
        b,
        blocks,
        clusters.map(({ c }) => c),
        clusterKids,
        l.children,
      );
      const next = Math.min(old, Math.max(soundEndNs / timestampScale, otherEnd));
      if (next < old) {
        const bytes = new Uint8Array(8);
        new DataView(bytes.buffer).setFloat64(0, next);
        const payload: Parts = [];
        for (const k of infoKids)
          payload.push(
            k === durationEl
              ? Uint8Array.from([...idBytes(ID.duration), 0x88, ...bytes])
              : b.subarray(k.start, k.end),
          );
        infoParts.set(info.start, element(ID.info, payload, info.sizeWidth));
      }
    }

    // New offsets (relative to the segment payload) of every top-level child, Cues aside.
    const out = new Map<number, Parts>();
    out.set(tracksEl.start, tracksParts);
    for (const [start, parts] of infoParts) out.set(start, parts);
    for (const [i, parts] of clusterParts) {
      const c = l.children[i];
      if (c) out.set(c.start, parts);
    }
    const newOffset = new Map<number, number>();
    const seg0 = l.segment.data;
    let pos = 0;
    const cuesEl = cuesAt >= 0 ? l.children[cuesAt] : undefined;
    for (const c of l.children) {
      newOffset.set(c.start - seg0, pos);
      if (c === cuesEl) {
        const cuesParts = rewriteCues(b, c, newOffset, seg0, l.children, keepsOpus, preSkips);
        if (!cuesParts) return null;
        out.set(c.start, cuesParts);
      }
      pos += partsLength(out.get(c.start) ?? [b.subarray(c.start, c.end)]);
    }
    const segmentSize = pos;

    // SeekHead: positions mapped to the new layout, same field widths (mediabunny writes 5 bytes).
    const seekHead = l.children.find((c) => c.id === ID.seekHead);
    if (seekHead) {
      const payload: Parts = [];
      for (const seek of kids(b, seekHead) ?? []) {
        if (seek.id !== ID.seek) {
          payload.push(b.subarray(seek.start, seek.end));
          continue;
        }
        const seekPayload: Parts = [];
        for (const f of kids(b, seek) ?? []) {
          if (f.id !== ID.seekPosition) {
            seekPayload.push(b.subarray(f.start, f.end));
            continue;
          }
          const width = f.end - f.data;
          const moved = newOffset.get(readUint(b, f));
          if (moved === undefined) return null;
          if (moved >= 2 ** (8 * width)) return null;
          seekPayload.push(...element(ID.seekPosition, [Uint8Array.from(uintBytes(moved, width))]));
        }
        payload.push(...element(ID.seek, seekPayload, seek.sizeWidth));
      }
      const parts = element(ID.seekHead, payload, seekHead.sizeWidth);
      if (partsLength(parts) !== seekHead.end - seekHead.start) return null;
      out.set(seekHead.start, parts);
    }

    const result: Uint8Array<ArrayBuffer>[] = [
      b.subarray(0, l.ebmlEnd),
      Uint8Array.from([...idBytes(ID.segment), ...sizeBytes(segmentSize, l.segment.sizeWidth)]),
    ];
    for (const c of l.children)
      for (const p of out.get(c.start) ?? [b.subarray(c.start, c.end)])
        result.push(p as Uint8Array<ArrayBuffer>);
    if (l.segment.end < b.length) result.push(b.subarray(l.segment.end));
    return result;
  } catch (e) {
    if (e instanceof RangeError) return null;
    throw e;
  }
}

/** End (in timestamp units) of the tracks other than Opus: last block plus the last step. */
function otherTracksEnd(
  b: Uint8Array,
  opus: BlockRef[],
  clusters: El[],
  clusterKids: Map<number, El[]>,
  children: El[],
): number {
  const opusStarts = new Set(opus.map((x) => x.el.start));
  const times = new Map<number, number[]>();
  for (const c of clusters) {
    const ks = clusterKids.get(children.indexOf(c)) ?? [];
    const tsEl = ks.find((k) => k.id === ID.timestamp);
    const base = tsEl ? readUint(b, tsEl) : 0;
    for (const k of ks) {
      if (opusStarts.has(k.start)) continue;
      const blockEl =
        k.id === ID.simpleBlock
          ? k
          : k.id === ID.blockGroup
            ? kids(b, k)?.find((g) => g.id === ID.block)
            : undefined;
      if (!blockEl) continue;
      const track = readVint(b, blockEl.data, false);
      const rel = new DataView(b.buffer, b.byteOffset + blockEl.data + track.len, 2).getInt16(0);
      const list = times.get(track.value) ?? [];
      list.push(base + rel);
      times.set(track.value, list);
    }
  }
  let end = 0;
  for (const list of times.values()) {
    list.sort((x, y) => x - y);
    const last = list.at(-1) ?? 0;
    const step = list.length > 1 ? last - (list.at(-2) ?? last) : 0;
    end = Math.max(end, last + step);
  }
  return end;
}

function rewriteCues(
  b: Uint8Array,
  cues: El,
  newOffset: Map<number, number>,
  seg0: number,
  children: El[],
  keepsOpus: Map<number, boolean>,
  opusTracks: Map<number, number>,
): Parts | null {
  const payload: Parts = [];
  for (const point of kids(b, cues) ?? []) {
    if (point.id !== ID.cuePoint) {
      payload.push(b.subarray(point.start, point.end));
      continue;
    }
    const pointPayload: Parts = [];
    let positions = 0;
    for (const f of kids(b, point) ?? []) {
      if (f.id !== ID.cueTrackPositions) {
        pointPayload.push(b.subarray(f.start, f.end));
        continue;
      }
      const fields = kids(b, f) ?? [];
      const posEl = fields.find((g) => g.id === ID.cueClusterPosition);
      const trackEl = fields.find((g) => g.id === ID.cueTrack);
      if (!posEl) return null;
      const old = readUint(b, posEl);
      const moved = newOffset.get(old);
      if (moved === undefined) return null;
      const clusterIndex = children.findIndex((c) => c.start - seg0 === old);
      const rewritten = keepsOpus.has(clusterIndex);
      // A cue for an Opus track whose blocks in that cluster were all dropped goes too.
      if (
        rewritten &&
        trackEl &&
        opusTracks.has(readUint(b, trackEl)) &&
        !keepsOpus.get(clusterIndex)
      )
        continue;
      const tp: Parts = [];
      for (const g of fields) {
        if (g.id === ID.cueClusterPosition)
          tp.push(...leaf(ID.cueClusterPosition, uintBytes(moved)));
        else if (g.id === ID.cueRelativePosition && rewritten) continue;
        else tp.push(b.subarray(g.start, g.end));
      }
      pointPayload.push(...element(ID.cueTrackPositions, tp));
      positions++;
    }
    if (positions > 0) payload.push(...element(ID.cuePoint, pointPayload));
  }
  return element(ID.cues, payload, cues.sizeWidth);
}

/**
 * The start delay of each sound track of a Matroska/WebM file, in seconds, by track number, read
 * from the start of the file (`head`; the Tracks element comes before the first cluster): for Opus
 * the OpusHead pre-skip (what decoders apply), for every other codec the CodecDelay. ffmpeg writes
 * AAC priming this way (CodecDelay 21.3 ms for 1024 samples at 48 kHz, the first block at 0);
 * mediabunny reads neither, so its packet times are that much late. Empty when not found.
 */
export function readMatroskaDelays(head: Uint8Array): Map<number, number> {
  const out = new Map<number, number>();
  const ebml = readEl(head, 0, head.length);
  if (ebml?.id !== 0x1a45dfa3) return out;
  const segId = readVint(head, ebml.end, true);
  if (segId.value !== ID.segment) return out;
  const segSize = readVint(head, ebml.end + segId.len, false);
  let p = ebml.end + segId.len + segSize.len;
  const limit = segSize.value < 0 ? head.length : Math.min(head.length, p + segSize.value);
  while (p < limit) {
    const id = readVint(head, p, true);
    const size = readVint(head, p + id.len, false);
    if (size.value < 0 || id.value === ID.cluster) break;
    const data = p + id.len + size.len;
    if (id.value === ID.tracks) {
      if (data + size.value > head.length) break;
      for (const entry of kids(head, { data, end: data + size.value }) ?? []) {
        if (entry.id !== ID.trackEntry) continue;
        const fields = kids(head, entry) ?? [];
        const number = fields.find((f) => f.id === ID.trackNumber);
        const codec = fields.find((f) => f.id === ID.codecId);
        if (!number || !codec) continue;
        const name = String.fromCharCode(...head.subarray(codec.data, codec.end));
        const priv = fields.find((f) => f.id === ID.codecPrivate);
        const delay = fields.find((f) => f.id === ID.codecDelay);
        const opus =
          name === "A_OPUS" && priv ? readOpusHead(head.subarray(priv.data, priv.end)) : null;
        const sec = opus ? opus.preSkip / 48_000 : delay ? readUint(head, delay) / 1e9 : 0;
        if (sec > 0) out.set(readUint(head, number), sec);
      }
      break;
    }
    p = data + size.value;
  }
  return out;
}

const delayCache = new WeakMap<File, Promise<Map<number, number>>>();

/**
 * Seconds a sound track's packet times, as mediabunny reads them, run behind its presentation: a
 * Matroska source's CodecDelay or Opus pre-skip (`readMatroskaDelays`). 0 for other sources and
 * for inputs not opened by `openInput`.
 */
export async function sourceDelay(t: InputAudioTrack): Promise<number> {
  const file = fileOfInput(t.input);
  if (!file || !/matroska|webm/i.test((await t.input.getFormat()).name)) return 0;
  let p = delayCache.get(file);
  if (!p) {
    p = file
      .slice(0, 1 << 20)
      .arrayBuffer()
      .then((b) => readMatroskaDelays(new Uint8Array(b)))
      .catch(() => new Map<number, number>());
    delayCache.set(file, p);
  }
  return (await p).get(t.id) ?? 0;
}
