/**
 * SubRip (.srt). There is no formal spec; this reader follows what players accept: an optional index
 * line, a timing line "00:00:01,000 --> 00:00:02,500" (optionally followed by X1/X2/Y1/Y2
 * coordinates), then text until a blank line. Real files break every rule, so it also accepts missing
 * or wrong index numbers, dots for commas, one-digit hours, blank lines inside a cue's text and a
 * missing final newline. A timing line that cannot be read is skipped and reported with its line.
 */
import { fromSrt, toSrt } from "./markup";
import type { Cue, Features, Issue } from "./model";
import { parseTime, srtTime } from "./time";

/** A timing line: starts with a digit and has "-->". The times themselves are checked separately. */
export const TIMING = /^\s*(\d[\d:.,]*)\s*-->\s*(\S+)\s*(.*)$/;

export interface ReadResult {
  cues: Cue[];
  issues: Issue[];
}

export function readSrt(lines: string[], features: Features): ReadResult {
  const cues: Cue[] = [];
  const issues: Issue[] = [];
  let current: { cue: Cue; body: string[] } | null = null;
  let skipping = false;

  const isIndex = (s: string | undefined) => s !== undefined && /^\s*\d+\s*$/.test(s);
  const isTiming = (s: string | undefined) => s !== undefined && TIMING.test(s);
  const finish = () => {
    if (!current) return;
    // Trailing blank lines belong to the separator, not the text.
    while (current.body.length && current.body[current.body.length - 1]?.trim() === "")
      current.body.pop();
    const body = current.body.join("\n");
    const m = fromSrt(body);
    if (m.fonts) features.fonts++;
    current.cue.text = m.text;
    if (m.top) current.cue.top = true;
    current.cue.native = { ...current.cue.native, body };
    cues.push(current.cue);
    current = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const n = i + 1;
    const t = TIMING.exec(line);
    if (t) {
      finish();
      const start = parseTime(t[1] ?? "");
      const end = parseTime(t[2] ?? "");
      if (start === undefined || end === undefined) {
        const bad = start === undefined ? t[1] : t[2];
        issues.push({
          kind: "skipped",
          line: n,
          message: `Line ${n}: "${bad}" is not a valid time, so this cue was skipped.`,
        });
        skipping = true;
        continue;
      }
      skipping = false;
      const coords = (t[3] ?? "").trim();
      if (coords) features.coords++;
      current = {
        cue: { start, end, text: "", line: n, native: coords ? { coords } : {} },
        body: [],
      };
      continue;
    }
    // An index line: a bare number directly above a timing line (after a blank line, or glued to
    // the previous cue's text in files that forgot the blank line).
    if (isIndex(line) && isTiming(lines[i + 1])) continue;
    if (skipping) {
      if (line.trim() === "") skipping = false;
      continue;
    }
    if (current) {
      // A blank line ends the cue unless more text follows before the next index or timing line.
      if (line.trim() === "") {
        const next = lines[i + 1];
        if (next === undefined || next.trim() === "" || isTiming(next) || isIndex(next)) finish();
        // A blank line inside the text is dropped: written back, it would end the cue early.
        continue;
      }
      current.body.push(line);
      continue;
    }
    if (line.trim() !== "") {
      issues.push({
        kind: "skipped",
        line: n,
        message: `Line ${n}: text outside any cue was skipped.`,
      });
      skipping = true;
    }
  }
  finish();
  return { cues, issues };
}

/** Writes SRT. `native` keeps each cue's original body and coordinates (same-format edits). */
export function writeSrt(cues: Cue[], opts: { native: boolean; newline?: string }): string {
  const nl = opts.newline ?? "\n";
  return cues
    .map((c, i) => {
      const coords = opts.native && c.native?.coords ? ` ${c.native.coords}` : "";
      const body =
        opts.native && c.native?.body !== undefined ? c.native.body : toSrt(c.text, c.top);
      return `${i + 1}${nl}${srtTime(c.start)} --> ${srtTime(c.end)}${coords}${nl}${body.replace(/\n/g, nl)}${nl}`;
    })
    .join(nl);
}
