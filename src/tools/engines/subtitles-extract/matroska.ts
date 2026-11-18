/**
 * Subtitle tracks of MKV and WebM files (Matroska, RFC 9559), read without a demuxer library:
 * the track entries from the Tracks element, then every block of the chosen tracks from the
 * clusters, in one forward pass. Handles zlib and header-stripping content compression (mkvmerge
 * can write either for subtitle tracks), SimpleBlocks and BlockGroups with a BlockDuration, and
 * WebM's D_WEBVTT cue layout. Laced blocks are not used for subtitles and are skipped. Pure apart
 * from reading the Blob; runs on the page (track list) and in the worker (extraction).
 */

import type { ExtractedTrack, RawCue, SubtitleKind, SubtitleTrack } from "./model";
import {
  type BlobReader,
  type Element,
  elementAt,
  elementsIn,
  readVint,
  stringOf,
  uintOf,
} from "./reader";

const ID = {
  EBML: 0x1a45dfa3,
  Segment: 0x18538067,
  Info: 0x1549a966,
  TimestampScale: 0x2ad7b1,
  Tracks: 0x1654ae6b,
  TrackEntry: 0xae,
  TrackNumber: 0xd7,
  TrackType: 0x83,
  FlagDefault: 0x88,
  FlagForced: 0x55aa,
  CodecID: 0x86,
  CodecPrivate: 0x63a2,
  Language: 0x22b59c,
  LanguageBCP47: 0x22b59d,
  Name: 0x536e,
  ContentEncodings: 0x6d80,
  ContentEncoding: 0x6240,
  ContentEncodingScope: 0x5032,
  ContentCompression: 0x5034,
  ContentCompAlgo: 0x4254,
  ContentCompSettings: 0x4255,
  Cluster: 0x1f43b675,
  Timestamp: 0xe7,
  SimpleBlock: 0xa3,
  BlockGroup: 0xa0,
  Block: 0xa1,
  BlockDuration: 0x9b,
} as const;

/** Elements that can follow a Cluster at the Segment's level: an unknown-size Cluster ends at one. */
const TOP_LEVEL = new Set([
  ID.Cluster,
  0x1c53bb6b, // Cues
  0x1254c367, // Tags
  0x1941a469, // Attachments
  0x1043a770, // Chapters
  0x114d9b74, // SeekHead
  ID.Info,
  ID.Tracks,
]);

/** A cue with no stored duration lasts until the next one, and at most this long (milliseconds). */
const OPEN_CUE_MAX_MS = 4000;

interface MkvTrack extends SubtitleTrack {
  codecPrivate?: Uint8Array;
  /** Content compression applied to every frame. */
  compression?: { algo: number; settings?: Uint8Array };
}

export interface MkvLayout {
  tracks: MkvTrack[];
  /** Nanoseconds per timestamp unit (1,000,000 by default: milliseconds). */
  scale: number;
  /** File offset of the first Cluster, where extraction starts. */
  firstCluster: number;
  /** End of the Segment (the file's end for an unknown-size Segment). */
  segmentEnd: number;
}

function kindOf(codec: string): SubtitleKind {
  if (codec === "S_TEXT/UTF8" || codec === "S_TEXT/ASCII") return "srt";
  if (codec === "S_TEXT/ASS" || codec === "S_TEXT/SSA" || codec === "S_ASS" || codec === "S_SSA")
    return "ass";
  if (codec === "S_TEXT/WEBVTT" || codec.startsWith("D_WEBVTT")) return "vtt";
  if (/^S_(HDMV\/PGS|VOBSUB|DVBSUB|IMAGE)/.test(codec)) return "picture";
  return "other";
}

function readTrackEntry(b: Uint8Array, entry: Element): MkvTrack | undefined {
  let number = 0;
  let type = 0;
  let codec = "";
  let language = "eng"; // the specification's default when the element is absent
  let bcp47: string | undefined;
  let name: string | undefined;
  let isDefault = true; // default 1
  let forced = false;
  let codecPrivate: Uint8Array | undefined;
  let compression: MkvTrack["compression"];
  for (const c of elementsIn(b, entry.data, entry.end ?? b.length)) {
    const end = c.end ?? c.data;
    if (c.id === ID.TrackNumber) number = uintOf(b, c.data, end);
    else if (c.id === ID.TrackType) type = uintOf(b, c.data, end);
    else if (c.id === ID.CodecID) codec = stringOf(b, c.data, end);
    else if (c.id === ID.Language) language = stringOf(b, c.data, end);
    else if (c.id === ID.LanguageBCP47) bcp47 = stringOf(b, c.data, end);
    else if (c.id === ID.Name) name = stringOf(b, c.data, end) || undefined;
    else if (c.id === ID.FlagDefault) isDefault = uintOf(b, c.data, end) === 1;
    else if (c.id === ID.FlagForced) forced = uintOf(b, c.data, end) === 1;
    else if (c.id === ID.CodecPrivate) codecPrivate = b.slice(c.data, end);
    else if (c.id === ID.ContentEncodings) compression = readCompression(b, c);
  }
  if (type !== 0x11 || number === 0) return undefined;
  // BCP 47 ("en", "pt-BR") wins over the older field when a writer sets both.
  const lang = (bcp47?.split("-")[0] ?? language).toLowerCase();
  return {
    id: number,
    index: 0,
    kind: kindOf(codec),
    codec,
    language: lang && lang !== "und" ? lang : undefined,
    name,
    default: isDefault,
    forced,
    codecPrivate,
    compression,
  };
}

function readCompression(b: Uint8Array, encodings: Element): MkvTrack["compression"] {
  for (const enc of elementsIn(b, encodings.data, encodings.end ?? b.length)) {
    if (enc.id !== ID.ContentEncoding) continue;
    let scope = 1;
    let comp: MkvTrack["compression"];
    for (const c of elementsIn(b, enc.data, enc.end ?? b.length)) {
      if (c.id === ID.ContentEncodingScope) scope = uintOf(b, c.data, c.end ?? c.data);
      if (c.id === ID.ContentCompression) {
        let algo = 0;
        let settings: Uint8Array | undefined;
        for (const x of elementsIn(b, c.data, c.end ?? b.length)) {
          if (x.id === ID.ContentCompAlgo) algo = uintOf(b, x.data, x.end ?? x.data);
          if (x.id === ID.ContentCompSettings) settings = b.slice(x.data, x.end);
        }
        comp = { algo, settings };
      }
    }
    if (comp && scope & 1) return comp;
  }
  return undefined;
}

/** Reads the layout up to the first Cluster: time scale and subtitle tracks, in file order. */
export async function readMatroska(reader: BlobReader): Promise<MkvLayout | undefined> {
  const head = await reader.bytes(0, 64);
  const ebml = elementAt(head, 0);
  if (!ebml || ebml.id !== ID.EBML || ebml.end === undefined) return undefined;
  const segHead = await reader.bytes(ebml.end, 16);
  const segment = elementAt(segHead, 0, ebml.end);
  if (!segment || segment.id !== ID.Segment) return undefined;
  const segmentEnd = segment.end ?? reader.size;
  let scale = 1_000_000;
  const tracks: MkvTrack[] = [];
  let firstCluster = segmentEnd;
  for (let pos = segment.data; pos < segmentEnd; ) {
    const e = elementAt(await reader.bytes(pos, 16), 0, pos);
    if (!e) break;
    if (e.id === ID.Cluster) {
      firstCluster = pos;
      break;
    }
    if (e.end === undefined) break;
    if (e.id === ID.Info || e.id === ID.Tracks) {
      const body = await reader.bytes(e.data, e.end - e.data);
      for (const c of elementsIn(body, 0, body.length)) {
        if (c.id === ID.TimestampScale) scale = uintOf(body, c.data, c.end ?? c.data) || scale;
        if (c.id === ID.TrackEntry) {
          const t = readTrackEntry(body, c);
          if (t) tracks.push(t);
        }
      }
    }
    pos = e.end;
  }
  tracks.forEach((t, i) => {
    t.index = i;
  });
  return { tracks, scale, firstCluster, segmentEnd };
}

async function inflate(b: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([b as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function decodeFrame(t: MkvTrack, data: Uint8Array): Promise<Uint8Array> {
  const c = t.compression;
  if (!c) return data;
  if (c.algo === 0) return inflate(data);
  if (c.algo === 3 && c.settings) {
    const out = new Uint8Array(c.settings.length + data.length);
    out.set(c.settings, 0);
    out.set(data, c.settings.length);
    return out;
  }
  throw new Error(
    `This file compresses its subtitles in a way that is not supported (algorithm ${c.algo}).`,
  );
}

const utf8 = new TextDecoder();

/** One block's payload as a cue of its track's kind. */
function toCue(
  t: MkvTrack,
  start: number,
  end: number | undefined,
  payload: Uint8Array,
): RawCue | undefined {
  const text = utf8.decode(payload).replace(/\0+$/, "");
  if (t.kind === "ass") {
    const comma = text.indexOf(",");
    return {
      start,
      end: end ?? start,
      text: text.slice(comma + 1),
      order: Number(text.slice(0, comma)) || 0,
    };
  }
  if (t.codec.startsWith("D_WEBVTT")) {
    // WebM: the cue identifier line, the settings line, then the payload.
    const [, settings = "", ...rest] = text.split("\n");
    return {
      start,
      end: end ?? start,
      text: rest.join("\n"),
      settings: settings.trim() || undefined,
    };
  }
  return { start, end: end ?? start, text };
}

/**
 * Every cue of the chosen tracks, in one pass over the clusters. `onProgress` gets the share of the
 * file read (0–1). Throws when aborted.
 */
export async function extractMatroska(
  reader: BlobReader,
  layout: MkvLayout,
  ids: Set<number>,
  signal: AbortSignal,
  onProgress: (ratio: number) => void,
): Promise<ExtractedTrack[]> {
  const chosen = layout.tracks.filter((t) => ids.has(t.id));
  const byId = new Map(chosen.map((t) => [t.id, t]));
  const cues = new Map<number, (RawCue & { open?: boolean })[]>(chosen.map((t) => [t.id, []]));
  const ms = (units: number) => Math.round((units * layout.scale) / 1e6);

  const block = async (data: Uint8Array, clusterTime: number, duration?: number) => {
    const track = readVint(data, 0);
    if (!track || track.value < 0) return;
    const t = byId.get(track.value);
    if (!t) return;
    const at = track.length;
    if (at + 3 > data.length) return;
    const rel = (((data[at] ?? 0) << 24) >> 16) | (data[at + 1] ?? 0); // signed 16-bit
    const flags = data[at + 2] ?? 0;
    if ((flags >> 1) & 3) return; // laced
    const start = ms(clusterTime + rel);
    const end = duration === undefined ? undefined : ms(clusterTime + rel + duration);
    const payload = await decodeFrame(t, data.subarray(at + 3));
    const cue = toCue(t, start, end, payload);
    if (cue) cues.get(t.id)?.push(end === undefined ? { ...cue, open: true } : cue);
  };

  const clusterBody = async (b: Uint8Array, base: number, from: number, to: number) => {
    let time = 0;
    for (const c of elementsIn(b, from, to, base)) {
      const s = c.data - base;
      const e = (c.end ?? to + base) - base;
      if (c.id === ID.Timestamp) time = uintOf(b, s, e);
      else if (c.id === ID.SimpleBlock && byId.size > 0) await block(b.subarray(s, e), time);
      else if (c.id === ID.BlockGroup) {
        let data: Uint8Array | undefined;
        let duration: number | undefined;
        for (const g of elementsIn(b, s, e, base)) {
          const gs = g.data - base;
          const ge = (g.end ?? e + base) - base;
          if (g.id === ID.Block) data = b.subarray(gs, ge);
          if (g.id === ID.BlockDuration) duration = uintOf(b, gs, ge);
        }
        if (data) await block(data, time, duration);
      }
    }
  };

  for (let pos = layout.firstCluster; pos < layout.segmentEnd; ) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    const e = elementAt(await reader.bytes(pos, 16), 0, pos);
    if (!e) break;
    if (e.id === ID.Cluster) {
      if (e.end !== undefined) {
        const body = await reader.bytes(e.data, e.end - e.data);
        await clusterBody(body, e.data, 0, body.length);
        pos = e.end;
      } else {
        // Unknown size: its children run until the next element that belongs to the Segment.
        let at = e.data;
        for (;;) {
          const c = elementAt(await reader.bytes(at, 16), 0, at);
          if (!c || c.end === undefined || TOP_LEVEL.has(c.id) || c.end > layout.segmentEnd) break;
          at = c.end;
        }
        const body = await reader.bytes(e.data, at - e.data);
        await clusterBody(body, e.data, 0, body.length);
        pos = at;
      }
    } else if (e.end !== undefined) pos = e.end;
    else break;
    onProgress(Math.min(1, pos / reader.size));
  }

  return chosen.map((t) => {
    const list = (cues.get(t.id) ?? []).sort((a, b) => a.start - b.start);
    list.forEach((c, i) => {
      if (!c.open) return;
      const next = list[i + 1]?.start;
      c.end = Math.min(next ?? c.start + OPEN_CUE_MAX_MS, c.start + OPEN_CUE_MAX_MS);
      delete c.open;
    });
    const header =
      t.kind === "ass" && t.codecPrivate
        ? utf8.decode(t.codecPrivate).replace(/\0+$/, "")
        : undefined;
    return { track: stripPrivate(t), cues: list, header };
  });
}

/** The track as the page sees it (no codec private data or compression details). */
export function stripPrivate(t: MkvTrack): SubtitleTrack {
  const { codecPrivate: _p, compression: _c, ...rest } = t;
  return rest;
}
