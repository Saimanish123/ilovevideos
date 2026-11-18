/**
 * Encoder choices were measured in the browser on 2026-09-03 (see PROGRESS.md): VP9 via libvpx-vp9
 * fails to allocate frame buffers in WASM, so ffmpeg-written WebM uses VP8; the MXF muxer rejects the
 * defaults, so MXF is read-only. Native WebM output (VP9) is unaffected.
 *
 * Container capability table: what we can read, what we can write, with which engine, and which
 * codecs each container holds. Drives the converter's target list, the copy-vs-transcode decision,
 * the ffmpeg arguments and the accepted-file list. Format *prose* lives in ./index.ts (profiles);
 * this file is capability only. Add a container here and every converter surface knows about it.
 */

export type Engine = "native" | "ffmpeg";

export interface ContainerSpec {
  id: string;
  /** As the world writes it. */
  name: string;
  extensions: string[];
  mime: string;
  /** Which engine can demux it. `native` = mediabunny/WebCodecs (fast, streaming); `ffmpeg` = ffmpeg.wasm. */
  read: Engine;
  /** Which engine muxes it, or null when we cannot write it. */
  write: Engine | null;
  /** mediabunny codec ids the container can carry without re-encoding. */
  videoCodecs: string[];
  audioCodecs: string[];
  /**
   * Holds a rotation flag (the ISO BMFF display matrix), so a phone's portrait clip can be copied as
   * it is. Matroska, WebM and the rest have none: a rotated picture is turned upright by re-encoding
   * (mediabunny's Matroska muxer refuses the flag; copying without it would play sideways).
   */
  rotationFlag?: boolean;
  /** ffmpeg muxer name and default encoders when the ffmpeg engine writes this container. */
  ffmpeg?: { format: string; video: string; audio: string; args?: string[] };
  /** Ordering in the target list (higher first). */
  popularity: number;
  group: "modern" | "legacy" | "broadcast" | "mobile";
}

export const containers: ContainerSpec[] = [
  {
    id: "mp4",
    rotationFlag: true,
    name: "MP4",
    extensions: ["mp4", "m4v"],
    mime: "video/mp4",
    read: "native",
    write: "native",
    videoCodecs: ["avc", "hevc", "av1", "vp9"],
    audioCodecs: ["aac", "mp3", "opus", "flac"],
    ffmpeg: {
      format: "mp4",
      video: "libx264",
      audio: "aac",
      args: ["-movflags", "+faststart", "-pix_fmt", "yuv420p"],
    },
    popularity: 100,
    group: "modern",
  },
  {
    id: "mov",
    rotationFlag: true,
    name: "MOV",
    extensions: ["mov", "qt"],
    mime: "video/quicktime",
    read: "native",
    write: "native",
    videoCodecs: ["avc", "hevc", "av1", "prores"],
    audioCodecs: ["aac", "pcm-s16", "pcm-s24", "pcm-f32"],
    ffmpeg: {
      format: "mov",
      video: "libx264",
      audio: "aac",
      args: ["-movflags", "+faststart", "-pix_fmt", "yuv420p"],
    },
    popularity: 90,
    group: "modern",
  },
  {
    id: "webm",
    name: "WebM",
    extensions: ["webm"],
    mime: "video/webm",
    read: "native",
    write: "native",
    videoCodecs: ["vp8", "vp9", "av1"],
    audioCodecs: ["opus", "vorbis"],
    ffmpeg: {
      format: "webm",
      video: "libvpx",
      audio: "libopus",
      args: ["-b:v", "1M", "-deadline", "realtime", "-cpu-used", "8"],
    },
    popularity: 80,
    group: "modern",
  },
  {
    id: "mkv",
    name: "MKV",
    extensions: ["mkv"],
    mime: "video/x-matroska",
    read: "native",
    write: "native",
    videoCodecs: ["avc", "hevc", "av1", "vp8", "vp9"],
    audioCodecs: ["aac", "mp3", "opus", "vorbis", "flac", "ac3", "eac3", "dts"],
    ffmpeg: { format: "matroska", video: "libx264", audio: "aac" },
    popularity: 70,
    group: "modern",
  },
  {
    id: "avi",
    name: "AVI",
    extensions: ["avi", "divx"],
    mime: "video/x-msvideo",
    read: "ffmpeg",
    write: "ffmpeg",
    videoCodecs: [],
    audioCodecs: [],
    ffmpeg: {
      format: "avi",
      video: "mpeg4",
      audio: "libmp3lame",
      args: ["-q:v", "3", "-pix_fmt", "yuv420p"],
    },
    popularity: 60,
    group: "legacy",
  },
  {
    id: "wmv",
    name: "WMV",
    extensions: ["wmv", "asf"],
    mime: "video/x-ms-wmv",
    read: "ffmpeg",
    write: "ffmpeg",
    videoCodecs: [],
    audioCodecs: [],
    ffmpeg: { format: "asf", video: "wmv2", audio: "wmav2", args: ["-q:v", "3"] },
    popularity: 50,
    group: "legacy",
  },
  {
    id: "flv",
    name: "FLV",
    extensions: ["flv", "f4v"],
    mime: "video/x-flv",
    read: "ffmpeg",
    write: "ffmpeg",
    videoCodecs: [],
    audioCodecs: [],
    ffmpeg: { format: "flv", video: "libx264", audio: "aac", args: ["-pix_fmt", "yuv420p"] },
    popularity: 40,
    group: "legacy",
  },
  {
    id: "mpg",
    name: "MPEG",
    extensions: ["mpg", "mpeg", "mpe", "m1v", "m2v"],
    mime: "video/mpeg",
    read: "ffmpeg",
    write: "ffmpeg",
    videoCodecs: [],
    audioCodecs: [],
    ffmpeg: { format: "mpeg", video: "mpeg2video", audio: "mp2", args: ["-q:v", "3"] },
    popularity: 45,
    group: "legacy",
  },
  {
    id: "ts",
    name: "MPEG-TS",
    extensions: ["ts", "m2ts", "mts", "m2t"],
    mime: "video/mp2t",
    read: "native",
    write: "ffmpeg",
    videoCodecs: ["avc", "hevc"],
    audioCodecs: ["aac", "mp3", "ac3"],
    ffmpeg: { format: "mpegts", video: "libx264", audio: "aac" },
    popularity: 42,
    group: "broadcast",
  },
  {
    id: "3gp",
    rotationFlag: true,
    name: "3GP",
    extensions: ["3gp", "3g2"],
    mime: "video/3gpp",
    read: "native",
    write: "ffmpeg",
    videoCodecs: ["avc"],
    audioCodecs: ["aac"],
    ffmpeg: {
      format: "3gp",
      video: "libx264",
      audio: "aac",
      args: ["-profile:v", "baseline", "-pix_fmt", "yuv420p"],
    },
    popularity: 30,
    group: "mobile",
  },
  {
    id: "ogv",
    name: "OGV",
    extensions: ["ogv", "ogg"],
    mime: "video/ogg",
    read: "ffmpeg",
    write: "ffmpeg",
    videoCodecs: [],
    audioCodecs: [],
    ffmpeg: { format: "ogg", video: "libtheora", audio: "libvorbis", args: ["-q:v", "7"] },
    popularity: 25,
    group: "legacy",
  },
  {
    id: "vob",
    name: "VOB",
    extensions: ["vob"],
    mime: "video/dvd",
    read: "ffmpeg",
    write: "ffmpeg",
    videoCodecs: [],
    audioCodecs: [],
    ffmpeg: { format: "vob", video: "mpeg2video", audio: "ac3", args: ["-q:v", "3"] },
    popularity: 20,
    group: "legacy",
  },
  {
    id: "mxf",
    name: "MXF",
    extensions: ["mxf"],
    mime: "application/mxf",
    read: "ffmpeg",
    write: null,
    videoCodecs: [],
    audioCodecs: [],
    popularity: 15,
    group: "broadcast",
  },
  // Read-only inputs (no sane modern reason to write them)
  {
    id: "rm",
    name: "RealMedia",
    extensions: ["rm", "rmvb"],
    mime: "application/vnd.rn-realmedia",
    read: "ffmpeg",
    write: null,
    videoCodecs: [],
    audioCodecs: [],
    popularity: 5,
    group: "legacy",
  },
  {
    id: "dv",
    name: "DV",
    extensions: ["dv"],
    mime: "video/dv",
    read: "ffmpeg",
    write: null,
    videoCodecs: [],
    audioCodecs: [],
    popularity: 5,
    group: "legacy",
  },
  {
    id: "swf",
    name: "SWF video",
    extensions: ["swf"],
    mime: "application/x-shockwave-flash",
    read: "ffmpeg",
    write: null,
    videoCodecs: [],
    audioCodecs: [],
    popularity: 3,
    group: "legacy",
  },
];

export const containerById = new Map(containers.map((c) => [c.id, c]));

export function containerForFile(name: string): ContainerSpec | undefined {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  return containers.find((c) => c.extensions.includes(ext));
}

/** Map mediabunny's format name ("MP4", "QuickTime", "WebM", "Matroska", "MPEG-TS") to a container id. */
export function containerFromFormatName(
  formatName: string,
  fileName: string,
): ContainerSpec | undefined {
  const n = formatName.toLowerCase();
  if (n.includes("quicktime")) return containerById.get("mov");
  if (n.includes("matroska")) return containerById.get("mkv");
  if (n.includes("webm")) return containerById.get("webm");
  if (n.includes("mp4") || n.includes("isobmff"))
    return containerForFile(fileName)?.id === "3gp"
      ? containerById.get("3gp")
      : containerById.get("mp4");
  if (n.includes("mpeg-ts") || n.includes("transport")) return containerById.get("ts");
  return containerForFile(fileName);
}

export const writableContainers = containers
  .filter((c) => c.write !== null)
  .sort((a, b) => b.popularity - a.popularity);
export const readableExtensions = containers.flatMap((c) => c.extensions);
export const ffmpegOnlyExtensions = containers
  .filter((c) => c.read === "ffmpeg")
  .flatMap((c) => c.extensions);
