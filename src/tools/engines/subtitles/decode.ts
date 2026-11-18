/**
 * Bytes to text. Subtitle files arrive in whatever their author's editor saved: UTF-8 with or without
 * a byte order mark, UTF-16 from Windows tools, or a legacy code page. UTF-8 is tried strictly first;
 * a file that is not valid UTF-8 is read as Windows-1252, the most common legacy encoding for Latin
 * subtitles, and the page says so, because a Cyrillic or Greek code page would read as wrong letters.
 */
import type { Encoding } from "./model";

export function decodeSubtitleBytes(bytes: Uint8Array): { text: string; encoding: Encoding } {
  if (bytes[0] === 0xff && bytes[1] === 0xfe)
    return { text: new TextDecoder("utf-16le").decode(bytes.subarray(2)), encoding: "utf-16le" };
  if (bytes[0] === 0xfe && bytes[1] === 0xff)
    return { text: new TextDecoder("utf-16be").decode(bytes.subarray(2)), encoding: "utf-16be" };
  const body =
    bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? bytes.subarray(3) : bytes;
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(body), encoding: "utf-8" };
  } catch {
    return { text: new TextDecoder("windows-1252").decode(body), encoding: "windows-1252" };
  }
}

/** Strips a leading BOM left in already-decoded text (a string read with `File.text()`). */
export const stripBom = (text: string) => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);

/** Splits into lines and reports the dominant line ending, so a same-format write can keep it. */
export function splitLines(text: string): { lines: string[]; newline: "\n" | "\r\n" } {
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const lf = (text.match(/\n/g) ?? []).length;
  return {
    lines: stripBom(text).split(/\r\n|\r|\n/),
    newline: crlf > 0 && crlf * 2 >= lf ? "\r\n" : "\n",
  };
}
