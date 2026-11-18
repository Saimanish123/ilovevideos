/**
 * "Short phrases" for burned-in subtitles: a long cue split into a few words at a time, the way
 * social captions show them. A subtitle file says when a cue starts and ends, not when each word is
 * spoken, so each phrase gets the cue's time in proportion to its share of the cue's characters.
 * That is an estimate (speech is not even), and the page says so. Pure; the preview and the worker
 * split the same way.
 */
import { toRuns } from "../overlay/text";
import type { Cue } from "../subtitles/model";

interface Word {
  text: string;
  i: boolean;
  b: boolean;
  u: boolean;
}

/** Longest phrase, in characters, before a cue is split. */
export const PHRASE_CHARS = 18;
/** No phrase is shown for less than this. */
export const MIN_PHRASE_MS = 300;

const len = (s: string) => Array.from(s).length;
const PAUSE = /[.,!?;:…，。！？、；：]$/;

function words(text: string): Word[] {
  const out: Word[] = [];
  for (const line of toRuns(text))
    for (const r of line)
      for (const t of r.text.split(/\s+/)) if (t) out.push({ text: t, i: r.i, b: r.b, u: r.u });
  return out;
}

/** A token longer than a phrase (a script written without spaces) in pieces of `max` characters. */
function pieces(w: Word, max: number): Word[] {
  const chars = Array.from(w.text);
  if (chars.length <= max) return [w];
  const out: Word[] = [];
  for (let i = 0; i < chars.length; i += max)
    out.push({ ...w, text: chars.slice(i, i + max).join("") });
  return out;
}

/** Words back to cue text, with <i>, <b> and <u> around runs that carry them. */
function serialise(ws: Word[]): string {
  let out = "";
  let prev: Word | undefined;
  for (const w of ws) {
    const same = prev && prev.i === w.i && prev.b === w.b && prev.u === w.u;
    if (prev && !same) out += close(prev);
    if (prev) out += " ";
    if (!same) out += open(w);
    out += w.text;
    prev = w;
  }
  return prev ? out + close(prev) : out;
}
const open = (w: Word) => `${w.b ? "<b>" : ""}${w.i ? "<i>" : ""}${w.u ? "<u>" : ""}`;
const close = (w: Word) => `${w.u ? "</u>" : ""}${w.i ? "</i>" : ""}${w.b ? "</b>" : ""}`;

/** Characters of words i..j−1 joined by spaces. */
const spanLen = (lens: number[], i: number, j: number) => {
  let n = j - i - 1;
  for (let k = i; k < j; k++) n += lens[k] ?? 0;
  return n;
};

/**
 * Words in as few phrases of at most `max` characters as fit, as even in length as possible ("First
 * line on" + "the picture", not "First line on the" + "picture"): the fewest parts that fit, split
 * where the squared difference from an even share is smallest.
 */
function balance(ws: Word[], max: number): Word[][] {
  const lens = ws.map((w) => len(w.text));
  const n = ws.length;
  const total = spanLen(lens, 0, n);
  if (total <= max || n <= 1) return [ws];
  for (let parts = Math.ceil(total / max); parts <= n; parts++) {
    const target = total / parts;
    // cost[j][i]: best cost of the first i words in j phrases; from[j][i]: where the last one starts.
    const cost = Array.from({ length: parts + 1 }, () => new Array<number>(n + 1).fill(Infinity));
    const from = Array.from({ length: parts + 1 }, () => new Array<number>(n + 1).fill(0));
    (cost[0] as number[])[0] = 0;
    for (let j = 1; j <= parts; j++)
      for (let i = j; i <= n; i++)
        for (let s = j - 1; s < i; s++) {
          const l = spanLen(lens, s, i);
          const prev = cost[j - 1]?.[s] ?? Infinity;
          if (l > max || prev === Infinity) continue;
          const c = prev + (l - target) ** 2;
          if (c < (cost[j]?.[i] ?? Infinity)) {
            (cost[j] as number[])[i] = c;
            (from[j] as number[])[i] = s;
          }
        }
    if ((cost[parts]?.[n] ?? Infinity) === Infinity) continue;
    const out: Word[][] = [];
    let i = n;
    for (let j = parts; j > 0; j--) {
      const s = from[j]?.[i] ?? 0;
      out.unshift(ws.slice(s, i));
      i = s;
    }
    return out;
  }
  return ws.map((w) => [w]);
}

/** Clauses (ending at punctuation, when the clause is not tiny), each balanced into phrases. */
function group(ws: Word[], max: number): Word[][] {
  const clauses: Word[][] = [];
  let cur: Word[] = [];
  for (const w of ws) {
    cur.push(w);
    if (
      PAUSE.test(w.text) &&
      spanLen(
        cur.map((x) => len(x.text)),
        0,
        cur.length,
      ) >= 4
    ) {
      clauses.push(cur);
      cur = [];
    }
  }
  if (cur.length) clauses.push(cur);
  return clauses.flatMap((c) => balance(c, max));
}

/** One cue as short phrases, or the cue itself when it is already short. */
export function splitCue(cue: Cue, max = PHRASE_CHARS, minMs = MIN_PHRASE_MS): Cue[] {
  const all = words(cue.text);
  const letters = all.reduce((s, w) => s + len(w.text), 0);
  const dur = cue.end - cue.start;
  if (letters === 0 || letters + all.length - 1 <= max || dur < 2 * minMs) return [cue];
  // No more phrases than the time allows at the minimum length each.
  const most = Math.max(1, Math.floor(dur / minMs));
  let limit = max;
  let phrases = group(
    all.flatMap((w) => pieces(w, limit)),
    limit,
  );
  while (phrases.length > most) {
    limit = Math.ceil(limit * 1.25);
    phrases = group(
      all.flatMap((w) => pieces(w, limit)),
      limit,
    );
  }
  if (phrases.length <= 1) return [cue];
  const out: Cue[] = [];
  let done = 0;
  let start = cue.start;
  for (const [k, p] of phrases.entries()) {
    done += p.reduce((s, w) => s + len(w.text), 0);
    const end = k === phrases.length - 1 ? cue.end : cue.start + Math.round((dur * done) / letters);
    out.push({ ...cue, start, end, text: serialise(p), native: undefined });
    start = end;
  }
  return out;
}

/** Every cue as short phrases. */
export const splitPhrases = (cues: Cue[], max = PHRASE_CHARS) =>
  cues.flatMap((c) => splitCue(c, max));

/** The cues a burn-in draws: as they are, or as short phrases. */
export const burnCues = (cues: Cue[], o: { phrases: boolean }) =>
  o.phrases ? splitPhrases(cues) : cues;
