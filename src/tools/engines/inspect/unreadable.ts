/**
 * Says what is actually wrong with a file the media reader cannot use, instead of a list of
 * containers: an MP4 without its index (a recording cut off before it finished), an MP4 that is cut
 * off part-way, an image or document renamed to .mp4, or a format no page reads. Reads box headers
 * and the first bytes only. Pure apart from reading the Blob; no network access.
 */
import { audioSources } from "@/content/formats/audio";
import { containers } from "@/content/formats/containers";
import { formatBytes } from "@/lib/format";
import { EngineError } from "../errors";

interface TopBox {
  type: string;
  start: number;
  /** Declared size; may run past the end of a truncated file. */
  size: number;
}

/** The top-level ISO BMFF boxes from their headers, up to the end of the file or a broken header. */
export async function topLevelBoxes(file: Blob, max = 64): Promise<TopBox[] | undefined> {
  const boxes: TopBox[] = [];
  for (let at = 0; at + 8 <= file.size && boxes.length < max; ) {
    const h = new DataView(await file.slice(at, at + 16).arrayBuffer());
    const type = String.fromCharCode(h.getUint8(4), h.getUint8(5), h.getUint8(6), h.getUint8(7));
    if (!/^[\x20-\x7e©]{4}$/.test(type)) break;
    let size = h.getUint32(0);
    if (size === 1 && h.byteLength >= 16) size = Number(h.getBigUint64(8));
    else if (size === 0) size = file.size - at;
    if (size < 8) break;
    boxes.push({ type, start: at, size });
    at += size;
  }
  return boxes.length > 0 &&
    ["ftyp", "moov", "mdat", "free", "wide", "skip"].includes(boxes[0]?.type ?? "")
    ? boxes
    : undefined;
}

/** File signatures of things that are not video or sound, for "this is a PNG image". */
const NOT_MEDIA: [number[], string][] = [
  [[0x89, 0x50, 0x4e, 0x47], "a PNG image"],
  [[0xff, 0xd8, 0xff], "a JPEG image"],
  [[0x47, 0x49, 0x46, 0x38], "a GIF image"],
  [[0x25, 0x50, 0x44, 0x46], "a PDF document"],
  [[0x50, 0x4b, 0x03, 0x04], "a ZIP archive"],
  [[0x52, 0x61, 0x72, 0x21], "a RAR archive"],
];

/** Every container and audio format some page opens, as written ("MP4, MOV, ..."). */
export function readableFormatNames(): string[] {
  const names = [...containers.map((c) => c.name), ...audioSources.map((s) => s.name)];
  return [...new Set(names)];
}

const list = (names: string[]) =>
  names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

/** "This page reads MP4, MOV, ... and WAV files." for a page's own accepted formats. */
export const acceptedFormatsHint = (names: string[] = readableFormatNames()) =>
  `This page reads ${list(names)} files.`;

/**
 * The failure for a file the reader cannot use. `reason`: "unrecognised" when no format matched,
 * "no-tracks" when it opened but holds no video or sound it can find. `accepts` is the page's own
 * list of formats, when the caller knows it.
 */
export async function unreadableFileError(
  file: Blob & { name?: string },
  reason: "unrecognised" | "no-tracks",
  accepts?: string[],
): Promise<EngineError> {
  const ext = file.name?.split(".").pop()?.toUpperCase();
  const boxes = await topLevelBoxes(file).catch(() => undefined);
  if (boxes) {
    const kind = ext === "MOV" ? "MOV" : ext === "M4A" ? "M4A" : "MP4";
    const moov = boxes.find((b) => b.type === "moov");
    const cut = boxes.find((b) => b.start + b.size > file.size);
    if (!moov || moov.start + moov.size > file.size) {
      const mdat = boxes.find((b) => b.type === "mdat");
      return new EngineError(
        "unsupported-input",
        `This ${kind} is missing its index (the moov box), which happens when a recording was cut off before it finished${mdat ? `: ${formatBytes(Math.min(mdat.size, file.size - mdat.start))} of picture and sound are there, but nothing says where each frame is` : ""}.`,
        "A repair tool that rebuilds the index from a good recording made by the same camera or app can sometimes save it; this page cannot.",
      );
    }
    if (cut) {
      return new EngineError(
        "unsupported-input",
        `This ${kind} is cut off: it ends ${formatBytes(cut.start + cut.size - file.size)} before its last part (${cut.type}) does, so the frames it lists are not all there.`,
        "Copy or download the file again from where it came from.",
      );
    }
    if (reason === "no-tracks")
      return new EngineError(
        "unsupported-input",
        `This ${kind} has an index but no video or sound track in it.`,
        "It may hold only metadata or chapters. Choose the file with the recording itself.",
      );
  }
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const other = NOT_MEDIA.find(([sig]) => sig.every((byte, i) => head[i] === byte));
  if (other)
    return new EngineError(
      "unsupported-input",
      `This file is ${other[1]}${ext ? ` named .${ext.toLowerCase()}` : ""}, not a video or audio file.`,
      acceptedFormatsHint(accepts),
    );
  const text =
    head.length > 0 &&
    head.every((b) => b === 0x09 || b === 0x0a || b === 0x0d || (b >= 0x20 && b < 0x7f));
  if (text)
    return new EngineError(
      "unsupported-input",
      "This is a text file, not a video or audio file.",
      acceptedFormatsHint(accepts),
    );
  return new EngineError(
    "unsupported-input",
    reason === "no-tracks"
      ? "The file opened, but no video or sound track was found in it."
      : `The contents of this file are not a video or audio format this tool reads${ext ? `, whatever the .${ext.toLowerCase()} name says` : ""}. It may be damaged or encrypted.`,
    acceptedFormatsHint(accepts),
  );
}
