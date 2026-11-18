/**
 * Page thread only (it needs the DOM's image decoders, including SVG): reads a picked image into a
 * layer's file facts. Its natural size comes from the browser's decoder; an SVG is drawn once to a
 * PNG as long as the video's longer side (1024 to 4096 pixels), since the
 * engine worker has no SVG decoder; whether a GIF, WebP or PNG is animated is read from its bytes
 * (./options `looksAnimated`).
 */
import { looksAnimated } from "./options";

export interface ReadImage {
  name: string;
  blob: Blob;
  type: string;
  width: number;
  height: number;
  animated: boolean;
}

const TYPES: Record<string, string> = {
  png: "image/png",
  apng: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  svg: "image/svg+xml",
};

/** The image type from the MIME type or, failing that, the extension; undefined for anything else. */
export function imageType(file: { name: string; type: string }): string | undefined {
  if (Object.values(TYPES).includes(file.type)) return file.type;
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  return TYPES[ext];
}

async function decode(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/** Reads `file`; throws a sentence for the panel when it is not an image this page takes. */
export async function readLayerImage(
  file: File,
  picture: { width: number; height: number },
): Promise<ReadImage> {
  const type = imageType(file);
  if (!type) throw new Error(`${file.name} is not a PNG, JPEG, WebP, GIF, AVIF or SVG image.`);
  let img: HTMLImageElement;
  try {
    img = await decode(file);
  } catch {
    throw new Error(`${file.name} could not be read as an image.`);
  }
  const width = img.naturalWidth || 300;
  const height = img.naturalHeight || 150;
  if (type === "image/svg+xml") {
    // As large as the video's longer side, so it is sharp up to the full frame (4096 at most, 1024
    // at least: a canvas that size is about 64 MB at worst).
    const long = Math.min(4096, Math.max(1024, picture.width, picture.height));
    const k = long / Math.max(width, height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * k));
    canvas.height = Math.max(1, Math.round(height * k));
    const c = canvas.getContext("2d");
    if (!c) throw new Error(`${file.name} could not be drawn.`);
    c.drawImage(img, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
    if (!png) throw new Error(`${file.name} could not be drawn.`);
    return { name: file.name, blob: png, type: "image/png", width, height, animated: false };
  }
  const head = new Uint8Array(await file.slice(0, 4 * 1024 * 1024).arrayBuffer());
  const animated =
    (type === "image/gif" || type === "image/png" || type === "image/webp") && looksAnimated(head);
  return { name: file.name, blob: file, type, width, height, animated };
}
