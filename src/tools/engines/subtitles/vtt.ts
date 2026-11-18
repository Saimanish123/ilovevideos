/**
 * WebVTT (.vtt), per the W3C WebVTT spec: a "WEBVTT" header block, then blocks separated by blank
 * lines. A block is a cue (optional identifier line, "start --> end [settings]", payload), a NOTE
 * comment, or a STYLE/REGION block (only allowed before the first cue). Lenient where real files are
 * not: a comma in a timestamp, a missing header, and a timing line inside a payload (which starts a
 * new cue, as browsers do).
 */
import { fromVtt, toVtt } from "./markup";
import type { Cue, Extra, Features, Issue } from "./model";
import { parseTime, vttTime } from "./time";

const TIMING = /^\s*([\d:.,]+)\s+-->\s+([\d:.,]+)(?:\s+(.*))?$/;
const LOOSE_TIMING = /^\s*([\d:.,]+)\s*-->\s*([\d:.,]+)\s*(.*)$/;

export interface VttRead {
  cues: Cue[];
  issues: Issue[];
  header: string;
  extras: Extra[];
}

/** True when the settings place the cue in the top half ("line:0", "line:10%"). */
function isTop(settings: string): boolean {
  const m = /(?:^|\s)line:(-?\d+(?:\.\d+)?)(%?)/.exec(settings);
  if (!m) return false;
  const v = Number(m[1]);
  return m[2] === "%" ? v < 50 : v >= 0 && v <= 3;
}

export function readVtt(lines: string[], features: Features): VttRead {
  const cues: Cue[] = [];
  const issues: Issue[] = [];
  const extras: Extra[] = [];
  const header: string[] = [];
  let i = 0;
  // Header block: "WEBVTT" plus optional text and metadata lines, up to the first blank line.
  if (/^WEBVTT(?:[ \t].*)?$/.test(lines[0] ?? "")) {
    while (i < lines.length && (lines[i] ?? "").trim() !== "") header.push(lines[i++] ?? "");
  } else {
    header.push("WEBVTT");
  }

  const timingOf = (s: string | undefined) =>
    s === undefined ? null : (TIMING.exec(s) ?? LOOSE_TIMING.exec(s));

  while (i < lines.length) {
    while (i < lines.length && (lines[i] ?? "").trim() === "") i++;
    if (i >= lines.length) break;
    const blockStart = i;
    const block: string[] = [];
    while (i < lines.length && (lines[i] ?? "").trim() !== "") block.push(lines[i++] ?? "");
    const first = block[0] ?? "";
    if (/^NOTE($|[ \t])/.test(first)) {
      features.blocks++;
      if (cues.length === 0) header.push("", ...block);
      else extras.push({ kind: "vtt-note", line: blockStart + 1, raw: block.join("\n") });
      continue;
    }
    if (/^(STYLE|REGION)[ \t]*$/.test(first)) {
      features.blocks++;
      if (cues.length === 0) header.push("", ...block);
      continue;
    }
    // A payload may hold another timing line with no blank line before it: split there.
    let j = 0;
    while (j < block.length) {
      let id: string | undefined;
      let t = timingOf(block[j]);
      // Only a block's first line can be an identifier.
      if (!t && j === 0 && block[1] !== undefined && timingOf(block[1])) {
        id = block[j];
        j++;
        t = timingOf(block[j]);
      }
      const lineNo = blockStart + j + 1;
      if (!t) {
        issues.push({
          kind: "skipped",
          line: lineNo,
          message: `Line ${lineNo}: this block has no timing line, so it was skipped.`,
        });
        break;
      }
      const start = parseTime(t[1] ?? "");
      const end = parseTime(t[2] ?? "");
      j++;
      // As browsers do: the payload runs to the end of the block or to the next line with "-->".
      const payload: string[] = [];
      while (j < block.length && !timingOf(block[j])) payload.push(block[j++] ?? "");
      if (start === undefined || end === undefined) {
        const bad = start === undefined ? t[1] : t[2];
        issues.push({
          kind: "skipped",
          line: lineNo,
          message: `Line ${lineNo}: "${bad}" is not a valid time, so this cue was skipped.`,
        });
        continue;
      }
      const settings = (t[3] ?? "").trim();
      const body = payload.join("\n");
      const m = fromVtt(body);
      if (settings && /(line|position|size|align|region|vertical):/.test(settings))
        features.positioned++;
      if (m.voices) features.voices++;
      if (m.spans) features.spans++;
      cues.push({
        start,
        end,
        text: m.text,
        top: isTop(settings) || undefined,
        line: lineNo,
        native: { id, settings: settings || undefined, body },
      });
    }
  }
  return { cues, issues, header: header.join("\n"), extras };
}

/** Writes WebVTT. `native` keeps the header, STYLE/REGION/NOTE blocks, identifiers and settings. */
export function writeVtt(
  cues: Cue[],
  opts: { native: boolean; header?: string; extras?: Extra[]; newline?: string },
): string {
  const nl = opts.newline ?? "\n";
  const blocks: string[] = [opts.native && opts.header ? opts.header : "WEBVTT"];
  const notes = opts.native ? [...(opts.extras ?? [])].sort((a, b) => a.line - b.line) : [];
  for (const c of cues) {
    while (notes.length && (notes[0]?.line ?? 0) < c.line) {
      const note = notes.shift();
      if (note?.raw) blocks.push(note.raw);
    }
    const native = opts.native ? c.native : undefined;
    const settings = native?.settings ?? (c.top ? "line:0" : "");
    const body = native?.body ?? toVtt(c.text);
    const lines = [
      ...(native?.id ? [native.id] : []),
      `${vttTime(c.start)} --> ${vttTime(c.end)}${settings ? ` ${settings}` : ""}`,
      // A blank line would end the cue: never write one inside the payload.
      ...body.split("\n").filter((l) => l.trim() !== ""),
    ];
    blocks.push(lines.join("\n"));
  }
  for (const note of notes) if (note.raw) blocks.push(note.raw);
  return `${blocks.join("\n\n")}\n`.replace(/\n/g, nl);
}
