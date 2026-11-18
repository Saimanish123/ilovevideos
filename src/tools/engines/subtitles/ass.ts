/**
 * Advanced SubStation Alpha (.ass) and SubStation Alpha v4 (.ssa). Sections in square brackets; the
 * [Events] section's Format line names the fields of every Dialogue line, and the Text field is last
 * (it may contain commas). Styles come from [V4+ Styles] (or [V4 Styles]); a cue inherits italic,
 * bold, underline and top alignment from its style. Comment lines and pure vector drawings are not
 * cues but are kept, and shifted, for same-format writes.
 */
import { fromAss, toAss } from "./markup";
import type { Cue, Extra, Features, Issue } from "./model";
import { assTime, parseTime } from "./time";

interface Style {
  italic: boolean;
  bold: boolean;
  underline: boolean;
  top: boolean;
}

export interface AssRead {
  cues: Cue[];
  issues: Issue[];
  header: string;
  footer?: string;
  eventFormat: string[];
  extras: Extra[];
}

const DEFAULT_EVENT_FORMAT = [
  "layer",
  "start",
  "end",
  "style",
  "name",
  "marginl",
  "marginr",
  "marginv",
  "effect",
  "text",
];

const truthy = (v: string | undefined) => v !== undefined && v.trim() !== "0" && v.trim() !== "";

export function readAss(lines: string[], features: Features): AssRead {
  const cues: Cue[] = [];
  const issues: Issue[] = [];
  const extras: Extra[] = [];
  const styles = new Map<string, Style>();
  const header: string[] = [];
  const footer: string[] = [];
  let section = "";
  let styleFormat: string[] = [];
  let eventFormat: string[] = [];
  let legacy = false;
  let inEvents = false;
  let afterEvents = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const n = i + 1;
    const sec = /^\s*\[([^\]]+)\]\s*$/.exec(line);
    if (sec) {
      section = (sec[1] ?? "").trim().toLowerCase();
      if (inEvents && section !== "events") afterEvents = true;
      inEvents = section === "events";
    }
    if (afterEvents) {
      footer.push(line);
      continue;
    }
    if (sec) {
      header.push(line);
      continue;
    }
    const kv = /^\s*([A-Za-z]+)\s*:\s?(.*)$/.exec(line);
    if (section === "script info" && kv && /^ScriptType$/i.test(kv[1] ?? "")) {
      legacy = /v4\.00$/i.test((kv[2] ?? "").trim()) && !/v4\.00\+/i.test(kv[2] ?? "");
    }
    if ((section === "v4+ styles" || section === "v4 styles") && kv) {
      const key = (kv[1] ?? "").toLowerCase();
      const values = (kv[2] ?? "").split(",").map((s) => s.trim());
      if (key === "format") styleFormat = values.map((v) => v.toLowerCase());
      else if (key === "style") {
        features.styles++;
        const get = (f: string) => values[styleFormat.indexOf(f)];
        const align = Number(get("alignment") ?? 2);
        // SSA v4 numbers alignment 1-3 bottom, 5-7 top, 9-11 middle; ASS uses the numpad.
        const top = legacy || section === "v4 styles" ? align >= 5 && align <= 7 : align >= 7;
        styles.set((get("name") ?? "").replace(/^\*/, ""), {
          italic: truthy(get("italic")),
          bold: truthy(get("bold")) && get("bold") !== "0",
          underline: truthy(get("underline")),
          top,
        });
      }
      header.push(line);
      continue;
    }
    if (section === "events" && kv) {
      const key = (kv[1] ?? "").toLowerCase();
      if (key === "format") {
        eventFormat = (kv[2] ?? "").split(",").map((s) => s.trim().toLowerCase());
        header.push(line);
        continue;
      }
      if (key === "dialogue" || key === "comment") {
        const format = eventFormat.length ? eventFormat : DEFAULT_EVENT_FORMAT;
        const raw = kv[2] ?? "";
        const fields = splitFields(raw, format.length);
        const get = (f: string) => fields[format.indexOf(f)];
        const start = parseTime(get("start") ?? "");
        const end = parseTime(get("end") ?? "");
        if (start === undefined || end === undefined) {
          const bad = start === undefined ? get("start") : get("end");
          issues.push({
            kind: "skipped",
            line: n,
            message: `Line ${n}: "${bad ?? ""}" is not a valid time, so this line was skipped.`,
          });
          continue;
        }
        const text = get("text") ?? "";
        const cue: Cue = { start, end, text: "", line: n, native: { fields, body: text } };
        if (key === "comment") {
          features.comments++;
          extras.push({ kind: "ass-comment", line: n, cue });
          continue;
        }
        const style =
          styles.get((get("style") ?? "").trim().replace(/^\*/, "")) ?? styles.get("Default");
        const m = fromAss(text, style ?? {});
        if (m.drawing) features.drawings++;
        const words = m.text.replace(/<\/?[ibu]>/g, "").trim();
        if (m.drawing && words === "") {
          extras.push({ kind: "ass-drawing", line: n, cue });
          continue;
        }
        if (m.styled || /karaoke|scroll|banner/i.test(get("effect") ?? "")) features.styledCues++;
        if (Number(get("layer") ?? 0) > 0) features.layered++;
        cue.text = m.text;
        if (m.top) cue.top = true;
        cues.push(cue);
        continue;
      }
    }
    // Anything before the first Dialogue line is header (script info, styles, blank lines).
    if (cues.length === 0 && extras.length === 0) header.push(line);
  }
  if (eventFormat.length === 0 && cues.length === 0 && extras.length === 0) {
    return { cues, issues, header: header.join("\n"), eventFormat: DEFAULT_EVENT_FORMAT, extras };
  }
  while (header.length && (header[header.length - 1] ?? "").trim() === "") header.pop();
  return {
    cues,
    issues,
    header: header.join("\n"),
    footer: footer.length ? footer.join("\n") : undefined,
    eventFormat: eventFormat.length ? eventFormat : DEFAULT_EVENT_FORMAT,
    extras,
  };
}

/** Splits a Dialogue value into `count` fields; the last (Text) keeps its commas. */
function splitFields(value: string, count: number): string[] {
  const out: string[] = [];
  let rest = value;
  for (let k = 0; k < count - 1; k++) {
    const c = rest.indexOf(",");
    if (c === -1) {
      out.push(rest);
      rest = "";
      continue;
    }
    out.push(rest.slice(0, c));
    rest = rest.slice(c + 1);
  }
  out.push(rest);
  return out;
}

/**
 * The header written for a file converted to ASS: the same defaults ffmpeg's ASS encoder uses
 * (384×288 script resolution, Arial 16, white text, black outline, bottom centre), so any renderer
 * shows it the same way.
 */
export const DEFAULT_ASS_HEADER = [
  "[Script Info]",
  "ScriptType: v4.00+",
  "PlayResX: 384",
  "PlayResY: 288",
  "ScaledBorderAndShadow: yes",
  "WrapStyle: 0",
  "",
  "[V4+ Styles]",
  "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
  "Style: Default,Arial,16,&Hffffff,&Hffffff,&H0,&H0,0,0,0,0,100,100,0,0,1,1,0,2,10,10,10,0",
  "",
  "[Events]",
  "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
].join("\n");

/**
 * ASS times are centiseconds. Both ends are rounded the same way; a cue that would collapse to zero
 * length keeps one centisecond so no line silently disappears.
 */
function assRange(c: Cue): [string, string] {
  const s = Math.round(c.start / 10);
  const e = Math.max(s + (c.end > c.start ? 1 : 0), Math.round(c.end / 10));
  return [assTime(s * 10), assTime(e * 10)];
}

export function writeAss(
  cues: Cue[],
  opts: {
    native: boolean;
    header?: string;
    footer?: string;
    eventFormat?: string[];
    extras?: Extra[];
    newline?: string;
  },
): string {
  const nl = opts.newline ?? "\n";
  if (!opts.native) {
    const lines = cues.map((c) => {
      const [s, e] = assRange(c);
      return `Dialogue: 0,${s},${e},Default,,0,0,0,,${toAss(c.text, c.top)}`;
    });
    return `${[DEFAULT_ASS_HEADER, ...lines].join("\n")}\n`.replace(/\n/g, nl);
  }
  const format = opts.eventFormat ?? DEFAULT_EVENT_FORMAT;
  const si = format.indexOf("start");
  const ei = format.indexOf("end");
  const lineOf = (c: Cue, kind: "Dialogue" | "Comment") => {
    const fields = [...(c.native?.fields ?? [])];
    const [s, e] = assRange(c);
    if (si >= 0) fields[si] = s;
    if (ei >= 0) fields[ei] = e;
    return `${kind}: ${fields.join(",")}`;
  };
  const extras = [...(opts.extras ?? [])].sort((a, b) => a.line - b.line);
  const out: string[] = [opts.header ?? DEFAULT_ASS_HEADER];
  const flush = (before: number) => {
    while (extras.length && (extras[0]?.line ?? 0) < before) {
      const x = extras.shift();
      if (x?.cue) out.push(lineOf(x.cue, x.kind === "ass-comment" ? "Comment" : "Dialogue"));
    }
  };
  for (const c of cues) {
    flush(c.line);
    out.push(lineOf(c, "Dialogue"));
  }
  flush(Number.POSITIVE_INFINITY);
  if (opts.footer) out.push("", opts.footer);
  return `${out.join("\n")}\n`.replace(/\n/g, nl);
}
