/**
 * SBV, the plain caption format YouTube Studio exports ("Download › .sbv"): a timing line
 * "0:00:01.000,0:00:04.000", the text, then a blank line. No index, no markup. Also the plain-text
 * transcript writer (TXT), which keeps only the words.
 */
import { fromPlain, plain } from "./markup";
import type { Cue, Issue } from "./model";
import { cueClock, parseTime, sbvTime } from "./time";

export const SBV_TIMING = /^\s*(\d+:\d{1,2}:\d{1,2}[.,]\d+)\s*,\s*(\d+:\d{1,2}:\d{1,2}[.,]\d+)\s*$/;

export function readSbv(lines: string[]): { cues: Cue[]; issues: Issue[] } {
  const cues: Cue[] = [];
  const issues: Issue[] = [];
  let current: { cue: Cue; body: string[] } | null = null;
  const finish = () => {
    if (!current) return;
    const body = current.body.join("\n");
    current.cue.text = fromPlain(body).text;
    current.cue.native = { body };
    cues.push(current.cue);
    current = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const n = i + 1;
    const t = SBV_TIMING.exec(line);
    if (t) {
      finish();
      const start = parseTime(t[1] ?? "");
      const end = parseTime(t[2] ?? "");
      if (start === undefined || end === undefined) {
        issues.push({
          kind: "skipped",
          line: n,
          message: `Line ${n}: "${line.trim()}" is not a valid timing, so this cue was skipped.`,
        });
        continue;
      }
      current = { cue: { start, end, text: "", line: n }, body: [] };
      continue;
    }
    if (line.trim() === "") {
      finish();
      continue;
    }
    if (current) current.body.push(line);
    else
      issues.push({
        kind: "skipped",
        line: n,
        message: `Line ${n}: text outside any cue was skipped.`,
      });
  }
  finish();
  return { cues, issues };
}

export function writeSbv(cues: Cue[], opts: { native: boolean; newline?: string }): string {
  const nl = opts.newline ?? "\n";
  return cues
    .map((c) => {
      const body = opts.native && c.native?.body !== undefined ? c.native.body : plain(c.text);
      return `${sbvTime(c.start)},${sbvTime(c.end)}${nl}${body.replace(/\n/g, nl)}${nl}`;
    })
    .join(nl);
}

/**
 * Plain transcript: one line per cue, a cue's own line breaks joined with spaces. Auto-captions roll
 * each line through two cues ("A", then "A / B", then "B / C"), so leading lines that repeat the
 * previous cue's last line are written once. `times` prefixes each line with its start ("[1:02.50]").
 */
export function writeTxt(cues: Cue[], opts: { times: boolean }): string {
  const out: string[] = [];
  let last = "";
  for (const c of cues) {
    const lines = plain(c.text)
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const own = lines.at(-1);
    while (lines.length && lines[0] === last) lines.shift();
    if (own !== undefined) last = own;
    if (lines.length === 0) continue;
    const text = lines.join(" ");
    out.push(opts.times ? `[${cueClock(c.start)}] ${text}` : text);
  }
  return `${out.join("\n")}\n`;
}
