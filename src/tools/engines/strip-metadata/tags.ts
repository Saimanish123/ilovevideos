/**
 * Names for the container-level tags a file may carry, so the panel can say exactly what will be
 * removed. MP4/MOV tags are `ilst` atom names (`©nam`, `©xyz`) or QuickTime keys
 * (`com.apple.quicktime.location.ISO6709`); Matroska uses SimpleTag names. Pure; unit-tested.
 */
import type { MediaInfo } from "../types";

export interface TagLine {
  label: string;
  /** Shown value when it is short text; omitted for binary or long payloads. */
  value?: string;
  /** Says where, when, by whom or on what it was filmed: listed first, and named in the verdict. */
  sensitive: boolean;
}

const LOCATION = "Location (GPS)";

const known: Array<[RegExp, string]> = [
  [
    /^(©xyz|loci|com\.apple\.quicktime\.location\.(iso6709|name|accuracy\.horizontal)|location)$/i,
    LOCATION,
  ],
  [
    /^(©day|com\.apple\.quicktime\.creationdate|date_recorded|date|creation_time)$/i,
    "Creation date",
  ],
  [
    /^(©too|com\.apple\.quicktime\.software|encoder|encoded_by|handler_name)$/i,
    "Encoding software",
  ],
  [/^(©mak|com\.apple\.quicktime\.make)$/i, "Device make"],
  [/^(©mod|com\.apple\.quicktime\.model)$/i, "Device model"],
  [/^(©swr|com\.apple\.quicktime\.author|©aut|©wrt|artist|author)$/i, "Author"],
  [/^(©nam|title|com\.apple\.quicktime\.title)$/i, "Title"],
  [/^(©cmt|comment|com\.apple\.quicktime\.comment)$/i, "Comment"],
  [/^(desc|ldes|description|com\.apple\.quicktime\.description)$/i, "Description"],
  [/^(©alb|album)$/i, "Album"],
  [/^(©gen|genre)$/i, "Genre"],
  [/^(©cpy|cprt|copyright|com\.apple\.quicktime\.copyright)$/i, "Copyright"],
  [/^(keyw|com\.apple\.quicktime\.keywords)$/i, "Keywords"],
  [/^(covr|attached_pic)$/i, "Cover image"],
  [/^(©enc|encoded_by)$/i, "Encoded by"],
];

/**
 * The order the list is read in: where it was filmed first, then on what, when and by whom, then
 * the software, then descriptive text. Labels not named here follow in the order found.
 */
const ORDER = [
  LOCATION,
  "Device make",
  "Device model",
  "Creation date",
  "Author",
  "Encoding software",
  "Title",
  "Comment",
  "Description",
];
const SENSITIVE = new Set([LOCATION, "Device make", "Device model", "Creation date", "Author"]);

const short = (s: string | undefined) => (s && s.length <= 60 ? s : undefined);

/** One line per tag family found in the file, location first; unknown keys are counted. */
export function describeTags(tags: MediaInfo["tags"]): { lines: TagLine[]; other: number } {
  if (!tags) return { lines: [], other: 0 };
  const seen = new Map<string, string | undefined>();
  const add = (label: string, value?: string) => {
    if (!seen.has(label) || (value && !seen.get(label))) seen.set(label, value);
  };
  if (tags.location) add(LOCATION, short(tags.location));
  if (tags.make) add("Device make", short(tags.make));
  if (tags.model) add("Device model", short(tags.model));
  if (tags.software) add("Encoding software", short(tags.software));
  if (tags.title) add("Title", short(tags.title));
  if (tags.artist) add("Author", short(tags.artist));
  if (tags.album) add("Album", short(tags.album));
  if (tags.comment) add("Comment", short(tags.comment));
  if (tags.description) add("Description", short(tags.description));
  if (tags.genre) add("Genre", short(tags.genre));
  if (tags.date) add("Creation date", tags.date.slice(0, 10));
  if (tags.recordedAt) add("Creation date", tags.recordedAt.slice(0, 10));
  let other = 0;
  for (const key of tags.rawKeys ?? []) {
    const hit = known.find(([rx]) => rx.test(key));
    if (hit) add(hit[1]);
    else other += 1;
  }
  const rank = (label: string) => {
    const i = ORDER.indexOf(label);
    return i === -1 ? ORDER.length : i;
  };
  const lines = [...seen]
    .map(([label, value]) => ({ label, value, sensitive: SENSITIVE.has(label) }))
    // Stable: labels outside ORDER keep the order they were found in.
    .sort((a, b) => rank(a.label) - rank(b.label));
  return { lines, other };
}

/** Number of tags the run removes: every raw key, or the normalised fields when raw keys are absent. */
export function countTags(tags: MediaInfo["tags"]): number {
  if (!tags) return 0;
  const header = tags.recordedAt ? 1 : 0;
  if (tags.rawKeys?.length) return tags.rawKeys.length + header;
  return (
    [
      tags.title,
      tags.artist,
      tags.album,
      tags.comment,
      tags.description,
      tags.genre,
      tags.date,
    ].filter(Boolean).length + header
  );
}

/** "48.8584° N, 2.2945° E" from signed decimal degrees. */
export function formatCoordinates(lat: number, lon: number): string | undefined {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180)
    return undefined;
  const f = (v: number) => Number(Math.abs(v).toFixed(4)).toString();
  return `${f(lat)}° ${lat < 0 ? "S" : "N"}, ${f(lon)}° ${lon < 0 ? "W" : "E"}`;
}

/** ISO 6709 point as phones and ffmpeg write it ("+48.8584+002.2945/", "+37.3349-122.0090+010.000/"). */
export function parseIso6709(s: string): string | undefined {
  const m = /^([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)/.exec(s.trim());
  if (!m?.[1] || !m[2]) return undefined;
  return formatCoordinates(Number(m[1]), Number(m[2]));
}

/**
 * 3GPP `loci` payload (TS 26.244 §8.19, as the tag reader returns it: version and flags first):
 * language, a null-terminated place name, role, then longitude, latitude and altitude as signed
 * 16.16 fixed point.
 */
export function parseLoci(bytes: Uint8Array): string | undefined {
  let at = 4 + 2;
  while (at < bytes.length && bytes[at] !== 0) at++;
  at += 2; // the name's terminator, then the role byte
  if (at + 8 > bytes.length) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const lon = view.getInt32(at) / 65536;
  const lat = view.getInt32(at + 4) / 65536;
  return formatCoordinates(lat, lon);
}

/**
 * The identifying tag values from the reader's raw map, for display only (never written anywhere).
 * Text values are trimmed; anything that does not parse is left out rather than guessed.
 */
export function readTagValues(
  raw: Record<string, unknown>,
): Pick<NonNullable<MediaInfo["tags"]>, "location" | "make" | "model" | "software"> {
  const out: Pick<NonNullable<MediaInfo["tags"]>, "location" | "make" | "model" | "software"> = {};
  const text = (...keys: string[]) => {
    for (const k of keys) {
      const hit = Object.entries(raw).find(([key]) => key.toLowerCase() === k.toLowerCase());
      if (typeof hit?.[1] === "string" && hit[1].trim()) return hit[1].trim();
    }
    return undefined;
  };
  const iso = text("com.apple.quicktime.location.ISO6709", "©xyz", "location");
  const loci = raw.loci;
  const location =
    (iso ? parseIso6709(iso) : undefined) ??
    (loci instanceof Uint8Array ? parseLoci(loci) : undefined);
  if (location) out.location = location;
  const make = text("com.apple.quicktime.make", "©mak");
  if (make) out.make = make;
  const model = text("com.apple.quicktime.model", "©mod");
  if (model) out.model = model;
  const software = text("com.apple.quicktime.software", "©too", "encoder");
  if (software) out.software = software;
  return out;
}
