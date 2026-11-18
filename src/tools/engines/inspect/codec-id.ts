/**
 * Names the video codec when the media reader opens a file but cannot name its picture: mediabunny
 * 1.55.5 reports `codec: null` for H.263 in 3GP (`s263`), MPEG-4 Part 2 and FFV1 in MKV, and does not
 * list a Theora stream in Ogg at all. The page then said "a codec this browser does not name",
 * although the name is in the file. Read from the container's own header: the MP4/MOV sample entry,
 * the Matroska CodecID (and the FourCC of `V_MS/VFW/FOURCC`), the Theora identification header.
 * Ids are ffmpeg's codec names, which `codecName` already displays ("H.263", "Theora").
 * Reads headers only. Pure apart from reading the Blob; no network access.
 */
import { childBoxes, type IsoBox } from "../edit-metadata/isobmff";
import { findChild } from "../mediabunny/movie-header";
import { BlobReader, elementAt, elementsIn, stringOf, uintOf } from "../subtitles-extract/reader";

/** MP4/MOV sample entry types to ffmpeg codec ids, for the ones mediabunny does not name. */
const SAMPLE_ENTRIES: Record<string, string> = {
  s263: "h263",
  h263: "h263",
  mp4v: "mpeg4",
  jpeg: "mjpeg",
  mjpa: "mjpeg",
  mjpb: "mjpeg",
  AVDJ: "mjpeg",
  SVQ1: "svq1",
  SVQ3: "svq3",
  "raw ": "rawvideo",
  "png ": "png",
  cvid: "cinepak",
  "dvc ": "dvvideo",
  dvcp: "dvvideo",
  dv5n: "dvvideo",
  dv5p: "dvvideo",
  mx5p: "mpeg2video",
  xdv7: "mpeg2video",
  m2v1: "mpeg2video",
  DNxHD: "dnxhd",
  AVdn: "dnxhd",
};

/** Matroska CodecIDs to ffmpeg codec ids (Matroska codec specifications). */
const MATROSKA_IDS: [RegExp, string][] = [
  [/^V_MPEG4\/ISO\/(SP|ASP|AP)$/, "mpeg4"],
  [/^V_MPEG4\/MS\/V3$/, "msmpeg4v3"],
  [/^V_MPEG1$/, "mpeg1video"],
  [/^V_MPEG2$/, "mpeg2video"],
  [/^V_THEORA$/, "theora"],
  [/^V_MJPEG$/, "mjpeg"],
  [/^V_FFV1$/, "ffv1"],
  [/^V_PRORES$/, "prores"],
  [/^V_REAL\/RV(10|20)$/, "rv20"],
  [/^V_REAL\/RV(30|40)$/, "rv40"],
  [/^V_UNCOMPRESSED$/, "rawvideo"],
  [/^V_DIRAC$/, "dirac"],
];

/** FourCCs inside `V_MS/VFW/FOURCC` (a BITMAPINFOHEADER), to ffmpeg codec ids. */
const FOURCCS: Record<string, string> = {
  FFV1: "ffv1",
  XVID: "mpeg4",
  DIVX: "mpeg4",
  DX50: "mpeg4",
  FMP4: "mpeg4",
  MP4V: "mpeg4",
  DIV3: "msmpeg4v3",
  MP43: "msmpeg4v3",
  MJPG: "mjpeg",
  H263: "h263",
  WMV1: "wmv1",
  WMV2: "wmv2",
  WMV3: "wmv3",
  WVC1: "vc1",
  CVID: "cinepak",
  MPG2: "mpeg2video",
  HFYU: "huffyuv",
  UTVD: "utvideo",
};

function inside(b: Uint8Array, box: IsoBox, type: string, skip = 0): IsoBox | undefined {
  return childBoxes(b, box.start + box.header + skip, box.end).find((c) => c.type === type);
}

/** The first video track's sample entry type in an MP4/MOV, mapped to an ffmpeg codec id. */
export async function isoVideoCodec(file: Blob): Promise<string | undefined> {
  const moov = await findChild(file, 0, file.size, "moov");
  if (!moov) return undefined;
  const b = new Uint8Array(await file.slice(moov.start, moov.start + moov.size).arrayBuffer());
  const top = childBoxes(b, 0, b.length)[0];
  if (!top) return undefined;
  for (const trak of childBoxes(b, top.start + top.header, top.end)) {
    if (trak.type !== "trak") continue;
    const mdia = inside(b, trak, "mdia");
    const hdlr = mdia && inside(b, mdia, "hdlr");
    if (!mdia || !hdlr) continue;
    const handler = String.fromCharCode(
      ...b.subarray(hdlr.start + hdlr.header + 8, hdlr.start + hdlr.header + 12),
    );
    if (handler !== "vide") continue;
    const minf = inside(b, mdia, "minf");
    const stbl = minf && inside(b, minf, "stbl");
    // stsd: version/flags (4) and entry count (4) before the first entry.
    const stsd = stbl && inside(b, stbl, "stsd");
    const entry = stsd ? childBoxes(b, stsd.start + stsd.header + 8, stsd.end)[0] : undefined;
    if (entry) return SAMPLE_ENTRIES[entry.type] ?? entry.type.trim().toLowerCase();
  }
  return undefined;
}

const MKV = {
  EBML: 0x1a45dfa3,
  Segment: 0x18538067,
  Tracks: 0x1654ae6b,
  TrackEntry: 0xae,
  TrackType: 0x83,
  CodecID: 0x86,
  CodecPrivate: 0x63a2,
  Cluster: 0x1f43b675,
};

/** The first video track's CodecID in a Matroska/WebM file, mapped to an ffmpeg codec id. */
export async function matroskaVideoCodec(file: Blob): Promise<string | undefined> {
  const reader = new BlobReader(file, 256 * 1024);
  const head = await reader.bytes(0, 64);
  const ebml = elementAt(head, 0);
  if (!ebml || ebml.id !== MKV.EBML || ebml.end === undefined) return undefined;
  const segment = elementAt(await reader.bytes(ebml.end, 16), 0, ebml.end);
  if (!segment || segment.id !== MKV.Segment) return undefined;
  const segmentEnd = segment.end ?? reader.size;
  for (let pos = segment.data; pos < segmentEnd; ) {
    const e = elementAt(await reader.bytes(pos, 16), 0, pos);
    if (!e || e.id === MKV.Cluster || e.end === undefined) return undefined;
    if (e.id === MKV.Tracks) {
      const body = await reader.bytes(e.data, e.end - e.data);
      for (const t of elementsIn(body, 0, body.length)) {
        if (t.id !== MKV.TrackEntry) continue;
        let type = 0;
        let codec = "";
        let priv: Uint8Array | undefined;
        for (const c of elementsIn(body, t.data, t.end ?? body.length)) {
          const end = c.end ?? c.data;
          if (c.id === MKV.TrackType) type = uintOf(body, c.data, end);
          else if (c.id === MKV.CodecID) codec = stringOf(body, c.data, end);
          else if (c.id === MKV.CodecPrivate) priv = body.subarray(c.data, end);
        }
        if (type !== 1) continue;
        if (codec === "V_MS/VFW/FOURCC" && priv && priv.length >= 20) {
          const fourcc = String.fromCharCode(...priv.subarray(16, 20));
          return FOURCCS[fourcc.toUpperCase()] ?? fourcc.trim().toLowerCase();
        }
        for (const [re, id] of MATROSKA_IDS) if (re.test(codec)) return id;
        return undefined;
      }
      return undefined;
    }
    pos = e.end;
  }
  return undefined;
}

export interface TheoraHeader {
  codec: "theora";
  width: number;
  height: number;
  fps: number;
}

/**
 * The Theora identification header ("\x80theora", Theora spec §6.2) in the first Ogg pages: picture
 * size and frame rate. mediabunny does not list Theora streams, so this is the whole video entry.
 */
export function theoraHeader(bytes: Uint8Array): TheoraHeader | undefined {
  for (let i = 0; i + 42 <= bytes.length; i++) {
    if (bytes[i] !== 0x80 || bytes[i + 1] !== 0x74) continue; // 0x80 't'
    if (String.fromCharCode(...bytes.subarray(i + 1, i + 7)) !== "theora") continue;
    const at = i + 7 + 3 + 4; // VMAJ VMIN VREV, FMBW FMBH
    const u24 = (o: number) =>
      ((bytes[o] ?? 0) << 16) | ((bytes[o + 1] ?? 0) << 8) | (bytes[o + 2] ?? 0);
    const u32 = (o: number) => u24(o) * 256 + (bytes[o + 3] ?? 0);
    const width = u24(at);
    const height = u24(at + 3);
    const num = u32(at + 8);
    const den = u32(at + 12);
    if (!(width > 0 && height > 0)) return undefined;
    return { codec: "theora", width, height, fps: den > 0 ? num / den : 0 };
  }
  return undefined;
}

/**
 * The video codec id from the container header, by the reader's container name ("MP4", "QuickTime
 * File Format", "Matroska", "WebM", "Ogg"). Undefined when the header does not say or is not read.
 */
export async function containerVideoCodec(
  file: Blob,
  container: string,
): Promise<string | TheoraHeader | undefined> {
  try {
    if (/^(MP4|QuickTime|3GP|M4V)/i.test(container)) return await isoVideoCodec(file);
    if (/^(Matroska|WebM)/i.test(container)) return await matroskaVideoCodec(file);
    if (/^Ogg/i.test(container))
      return theoraHeader(new Uint8Array(await file.slice(0, 64 * 1024).arrayBuffer()));
  } catch {
    // A header this reader cannot follow leaves the codec unnamed, as before.
  }
  return undefined;
}
