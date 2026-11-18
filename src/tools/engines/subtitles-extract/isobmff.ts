/**
 * Subtitle tracks of MP4, M4V and MOV files: `tx3g` timed text (what ffmpeg calls mov_text, and what
 * iTunes and HandBrake write) and `wvtt` WebVTT (ISO/IEC 14496-30). Samples are found from the
 * sample tables (`stts`, `stsc`, `stsz`, `stco`/`co64`) and read one by one, so only the text is
 * read, never the video. Chapter tracks (QuickTime text tracks a `chap` reference points to) are not
 * subtitles and are left out. Fragmented files keep their samples in fragments and are not read.
 */
import { childBoxes, type IsoBox } from "../edit-metadata/isobmff";
import { findChild } from "../mediabunny/movie-header";
import type { ExtractedTrack, RawCue, SubtitleKind, SubtitleTrack } from "./model";
import type { BlobReader } from "./reader";

interface Mp4Track extends SubtitleTrack {
  timescale: number;
  /** Presentation offset from the edit list, in milliseconds. */
  offsetMs: number;
  samples: { offset: number; size: number; start: number; duration: number }[];
}

export interface Mp4Layout {
  tracks: Mp4Track[];
  fragmented: boolean;
}

const find = (b: Uint8Array, box: IsoBox, type: string, full = 0) =>
  childBoxes(b, box.start + box.header + full, box.end).find((c) => c.type === type);

function path(b: Uint8Array, box: IsoBox, ...types: string[]): IsoBox | undefined {
  let at: IsoBox | undefined = box;
  for (const t of types) {
    if (!at) return undefined;
    at = find(b, at, t);
  }
  return at;
}

/** ISO 639-2/T from `mdhd`'s packed code (three 5-bit letters, each offset by 0x60). */
function language(packed: number): string | undefined {
  const s = String.fromCharCode(
    ((packed >> 10) & 0x1f) + 0x60,
    ((packed >> 5) & 0x1f) + 0x60,
    (packed & 0x1f) + 0x60,
  );
  return /^[a-z]{3}$/.test(s) && s !== "und" ? s : undefined;
}

function kindOf(entry: string, handler: string): SubtitleKind {
  if (entry === "tx3g" || (entry === "text" && handler !== "clcp")) return "tx3g";
  if (entry === "wvtt") return "vtt";
  if (entry === "mp4s") return "picture";
  return "other";
}

function readTrack(b: Uint8Array, trak: IsoBox, movieScale: number): Mp4Track | undefined {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const hdlr = path(b, trak, "mdia", "hdlr");
  if (!hdlr) return undefined;
  const handler = String.fromCharCode(
    ...b.subarray(hdlr.start + hdlr.header + 8, hdlr.start + hdlr.header + 12),
  );
  if (!["sbtl", "text", "subt", "clcp"].includes(handler)) return undefined;
  const tkhd = find(b, trak, "tkhd");
  const mdhd = path(b, trak, "mdia", "mdhd");
  const stbl = path(b, trak, "mdia", "minf", "stbl");
  if (!tkhd || !mdhd || !stbl) return undefined;
  const tkVersion = b[tkhd.start + tkhd.header] ?? 0;
  const flags = v.getUint32(tkhd.start + tkhd.header) & 0xffffff;
  const id = v.getUint32(tkhd.start + tkhd.header + (tkVersion === 1 ? 20 : 12));
  const mdVersion = b[mdhd.start + mdhd.header] ?? 0;
  const mb = mdhd.start + mdhd.header + (mdVersion === 1 ? 20 : 12);
  const timescale = v.getUint32(mb) || 1000;
  const lang = language(v.getUint16(mb + (mdVersion === 1 ? 12 : 8)));

  const stsd = find(b, stbl, "stsd");
  const entry = stsd ? childBoxes(b, stsd.start + stsd.header + 8, stsd.end)[0] : undefined;
  const kind = kindOf(entry?.type ?? "", handler);

  // Edit list: leading empty edits delay the track; the first media edit says where it starts.
  let offsetMs = 0;
  const elst = path(b, trak, "edts", "elst");
  if (elst) {
    const ev = b[elst.start + elst.header] ?? 0;
    const count = v.getUint32(elst.start + elst.header + 4);
    let at = elst.start + elst.header + 8;
    for (let i = 0; i < count && at < elst.end; i++) {
      const dur = ev === 1 ? Number(v.getBigUint64(at)) : v.getUint32(at);
      const mediaTime = ev === 1 ? Number(v.getBigInt64(at + 8)) : v.getInt32(at + 4);
      at += ev === 1 ? 20 : 12;
      if (mediaTime === -1) offsetMs += (dur / movieScale) * 1000;
      else {
        offsetMs -= (mediaTime / timescale) * 1000;
        break;
      }
    }
  }

  // Sample table.
  const stts = find(b, stbl, "stts");
  const stsc = find(b, stbl, "stsc");
  const stsz = find(b, stbl, "stsz");
  const stco = find(b, stbl, "stco") ?? find(b, stbl, "co64");
  const samples: Mp4Track["samples"] = [];
  if (stts && stsc && stsz && stco) {
    const sizeFixed = v.getUint32(stsz.start + stsz.header + 4);
    const count = v.getUint32(stsz.start + stsz.header + 8);
    const sizeAt = (i: number) => sizeFixed || v.getUint32(stsz.start + stsz.header + 12 + i * 4);
    const chunkCount = v.getUint32(stco.start + stco.header + 4);
    const chunkAt = (i: number) =>
      stco.type === "co64"
        ? Number(v.getBigUint64(stco.start + stco.header + 8 + i * 8))
        : v.getUint32(stco.start + stco.header + 8 + i * 4);
    const scCount = v.getUint32(stsc.start + stsc.header + 4);
    const sc = Array.from({ length: scCount }, (_, i) => ({
      first: v.getUint32(stsc.start + stsc.header + 8 + i * 12),
      per: v.getUint32(stsc.start + stsc.header + 12 + i * 12),
    }));
    const ttCount = v.getUint32(stts.start + stts.header + 4);
    const deltas: number[] = [];
    for (let i = 0; i < ttCount && deltas.length < count; i++) {
      const n = v.getUint32(stts.start + stts.header + 8 + i * 8);
      const d = v.getUint32(stts.start + stts.header + 12 + i * 8);
      for (let k = 0; k < n && deltas.length < count; k++) deltas.push(d);
    }
    let sample = 0;
    let time = 0;
    for (let chunk = 0; chunk < chunkCount && sample < count; chunk++) {
      let per = 0;
      for (const e of sc) if (e.first <= chunk + 1) per = e.per;
      let offset = chunkAt(chunk);
      for (let k = 0; k < per && sample < count; k++, sample++) {
        const size = sizeAt(sample);
        const duration = deltas[sample] ?? 0;
        samples.push({ offset, size, start: time, duration });
        offset += size;
        time += duration;
      }
    }
  }
  return {
    id,
    index: 0,
    kind,
    codec: entry?.type ?? handler,
    language: lang,
    default: (flags & 1) === 1,
    timescale,
    offsetMs,
    samples,
  };
}

/** Subtitle tracks from the movie box; reads `moov` only. */
export async function readMp4(file: Blob): Promise<Mp4Layout | undefined> {
  const moov = await findChild(file, 0, file.size, "moov");
  if (!moov) return undefined;
  const b = new Uint8Array(await file.slice(moov.start, moov.start + moov.size).arrayBuffer());
  const top = childBoxes(b, 0, b.length)[0];
  if (!top) return undefined;
  const v = new DataView(b.buffer);
  const kids = childBoxes(b, top.start + top.header, top.end);
  const mvhd = kids.find((c) => c.type === "mvhd");
  const movieScale = mvhd
    ? v.getUint32(
        mvhd.start + mvhd.header + ((b[mvhd.start + mvhd.header] ?? 0) === 1 ? 20 : 12),
      ) || 1000
    : 1000;
  const traks = kids.filter((c) => c.type === "trak");
  // Tracks that another track names as its chapters are chapter titles, not subtitles.
  const chapters = new Set<number>();
  for (const t of traks) {
    const chap = path(b, t, "tref", "chap");
    if (!chap) continue;
    for (let at = chap.start + chap.header; at + 4 <= chap.end; at += 4)
      chapters.add(v.getUint32(at));
  }
  const tracks = traks
    .map((t) => readTrack(b, t, movieScale))
    .filter((t): t is Mp4Track => !!t && !chapters.has(t.id));
  tracks.forEach((t, i) => {
    t.index = i;
  });
  return { tracks, fragmented: kids.some((c) => c.type === "mvex") };
}

const utf8 = new TextDecoder();

/**
 * A `tx3g` sample: a 16-bit length, then UTF-8 (or UTF-16 with a BOM), then optional modifier boxes.
 * Bold, italic and underline style runs (`styl`, 3GPP TS 26.245 §5.17.1.2, offsets in characters)
 * become <b>, <i> and <u>; font, size, colour and karaoke boxes are left out.
 */
export function tx3gText(s: Uint8Array): string {
  if (s.length < 2) return "";
  const len = ((s[0] ?? 0) << 8) | (s[1] ?? 0);
  const t = s.subarray(2, 2 + len);
  const text =
    t[0] === 0xfe && t[1] === 0xff
      ? new TextDecoder("utf-16be").decode(t.subarray(2))
      : utf8.decode(t);
  const styl = childBoxes(s, 2 + len, s.length).find((b) => b.type === "styl");
  if (!styl) return text;
  const chars = Array.from(text);
  const faces = new Array<number>(chars.length).fill(0);
  const v = new DataView(s.buffer, s.byteOffset, s.byteLength);
  const count = v.getUint16(styl.start + styl.header);
  for (let i = 0; i < count; i++) {
    const at = styl.start + styl.header + 2 + i * 12;
    if (at + 12 > styl.end) break;
    const from = v.getUint16(at);
    const to = Math.min(chars.length, v.getUint16(at + 2));
    const face = s[at + 6] ?? 0;
    for (let k = from; k < to; k++) faces[k] = face;
  }
  let out = "";
  let open = 0;
  const tags: [number, string][] = [
    [1, "b"],
    [2, "i"],
    [4, "u"],
  ];
  chars.forEach((c, i) => {
    const face = c === "\n" ? open : (faces[i] ?? 0);
    if (face !== open) {
      for (const [bit, tag] of [...tags].reverse())
        if (open & bit && !(face & bit)) out += `</${tag}>`;
      for (const [bit, tag] of tags) if (face & bit && !(open & bit)) out += `<${tag}>`;
      open = face;
    }
    out += c;
  });
  for (const [bit, tag] of [...tags].reverse()) if (open & bit) out += `</${tag}>`;
  return out;
}

/** A `wvtt` sample: one `vttc` box per cue (payload `payl`, settings `sttg`), or `vtte` for none. */
function wvttCues(s: Uint8Array): { text: string; settings?: string }[] {
  const out: { text: string; settings?: string }[] = [];
  for (const box of childBoxes(s, 0, s.length)) {
    if (box.type !== "vttc") continue;
    let text = "";
    let settings: string | undefined;
    for (const c of childBoxes(s, box.start + box.header, box.end)) {
      const body = utf8.decode(s.subarray(c.start + c.header, c.end));
      if (c.type === "payl") text = body;
      if (c.type === "sttg") settings = body.trim() || undefined;
    }
    if (text) out.push({ text, settings });
  }
  return out;
}

export async function extractMp4(
  reader: BlobReader,
  layout: Mp4Layout,
  ids: Set<number>,
  signal: AbortSignal,
  onProgress: (ratio: number) => void,
): Promise<ExtractedTrack[]> {
  const chosen = layout.tracks.filter((t) => ids.has(t.id));
  const total = chosen.reduce((s, t) => s + t.samples.length, 0) || 1;
  let done = 0;
  const out: ExtractedTrack[] = [];
  for (const t of chosen) {
    const cues: RawCue[] = [];
    for (const smp of t.samples) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      done++;
      if (smp.size === 0) continue;
      const bytes = await reader.bytes(smp.offset, smp.size);
      const start = Math.round((smp.start / t.timescale) * 1000 + t.offsetMs);
      const end = Math.round(((smp.start + smp.duration) / t.timescale) * 1000 + t.offsetMs);
      if (end <= 0) continue;
      if (t.kind === "vtt") {
        for (const c of wvttCues(bytes)) cues.push({ start: Math.max(0, start), end, ...c });
      } else {
        const text = tx3gText(bytes);
        if (text.trim()) cues.push({ start: Math.max(0, start), end, text });
      }
      if (done % 50 === 0) onProgress(done / total);
    }
    const { timescale: _t, offsetMs: _o, samples: _s, ...track } = t;
    out.push({ track, cues });
  }
  onProgress(1);
  return out;
}
