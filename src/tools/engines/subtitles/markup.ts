/**
 * Inline markup between formats. The normal form keeps exactly six tags (<i> </i> <b> </b> <u> </u>)
 * and "\n" line breaks; any other "<" is a literal character. Each reader reports what it could not
 * keep so the page can list the loss with a number instead of a vague warning.
 */

export interface ReadMarkup {
  text: string;
  top: boolean;
  /** Tags or overrides beyond italic/bold/underline/alignment were removed. */
  styled: boolean;
  /** SRT <font> tags. */
  fonts: boolean;
  /** WebVTT <v> voices. */
  voices: boolean;
  /** WebVTT <c>, <ruby>, <lang> spans or inline timestamps. */
  spans: boolean;
  /** ASS: the text was (or contained) a vector drawing. */
  drawing: boolean;
}

const blank = (text: string): ReadMarkup => ({
  text,
  top: false,
  styled: false,
  fonts: false,
  voices: false,
  spans: false,
  drawing: false,
});

/** Removes redundant pairs ("<i></i>") and trims spaces around line breaks. */
function tidy(text: string): string {
  let t = text;
  for (let i = 0; i < 3; i++) t = t.replace(/<([ibu])>\s*<\/\1>/g, "");
  return t
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/g, "").replace(/^[ \t]+/g, ""))
    .filter((l) => l !== "")
    .join("\n");
}

/** ASS override tags inside one {...} block that this model can keep. */
function readOverrides(block: string, state: { i: boolean; b: boolean; u: boolean }) {
  const out: string[] = [];
  let top: boolean | undefined;
  let styled = false;
  let drawing: boolean | undefined;
  // \i, \b, \u toggle, take 0/1, or (bold) a weight; 600 and up counts as bold.
  const flag = (key: "i" | "b" | "u", arg: string) => {
    const on =
      arg === ""
        ? !state[key]
        : key === "b"
          ? arg !== "0" && (Number(arg) === 1 || Number(arg) >= 600)
          : arg !== "0";
    if (on !== state[key]) out.push(on ? `<${key}>` : `</${key}>`);
    state[key] = on;
  };
  for (const raw of block.split("\\").slice(1)) {
    const tag = raw.trim();
    if (tag === "") continue;
    const emphasis = /^([ibu])(\d*)$/.exec(tag);
    const an = /^an([1-9])$/.exec(tag);
    const legacy = /^a(\d{1,2})$/.exec(tag);
    const draw = /^p(\d+)$/.exec(tag);
    if (emphasis) flag(emphasis[1] as "i" | "b" | "u", emphasis[2] ?? "");
    else if (an) top = Number(an[1]) >= 7;
    else if (legacy) {
      // SSA legacy alignment: 1-3 bottom, 5-7 top, 9-11 middle.
      const a = Number(legacy[1]);
      top = a >= 5 && a <= 7;
    } else if (draw) drawing = Number(draw[1]) > 0;
    else if (tag.startsWith("r")) {
      // \r resets to the line's style (or another style): close whatever this model opened.
      if (state.u) out.push("</u>");
      if (state.b) out.push("</b>");
      if (state.i) out.push("</i>");
      state.i = false;
      state.b = false;
      state.u = false;
      if (tag.length > 1) styled = true;
    } else styled = true;
  }
  return { tags: out.join(""), top, styled, drawing };
}

/**
 * ASS Text field → normal form. `base` is the line's style (italic/bold/underline/top from the
 * [V4+ Styles] entry), applied to the whole cue as the player would.
 */
export function fromAss(
  text: string,
  base: { italic?: boolean; bold?: boolean; underline?: boolean; top?: boolean } = {},
): ReadMarkup {
  const r = blank("");
  r.top = base.top ?? false;
  const state = { i: !!base.italic, b: !!base.bold, u: !!base.underline };
  let out = `${state.i ? "<i>" : ""}${state.b ? "<b>" : ""}${state.u ? "<u>" : ""}`;
  let drawing = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "{") {
      const close = text.indexOf("}", i);
      if (close === -1) {
        out += text.slice(i);
        break;
      }
      const block = text.slice(i + 1, close);
      i = close + 1;
      // A block without a backslash is a comment by convention (Aegisub, fansub notes).
      if (!block.includes("\\")) continue;
      const o = readOverrides(block, state);
      out += o.tags;
      if (o.top !== undefined) r.top = o.top;
      if (o.styled) r.styled = true;
      if (o.drawing !== undefined) {
        drawing = o.drawing;
        if (o.drawing) r.drawing = true;
      }
      continue;
    }
    if (drawing) {
      i++;
      continue;
    }
    if (ch === "\\" && i + 1 < text.length) {
      const next = text[i + 1];
      if (next === "N") {
        out += "\n";
        i += 2;
        continue;
      }
      // \n is a soft break (a space unless the script uses WrapStyle 2); \h is a hard space.
      if (next === "n") {
        out += " ";
        i += 2;
        continue;
      }
      if (next === "h") {
        out += " ";
        i += 2;
        continue;
      }
    }
    out += ch;
    i++;
  }
  out += `${state.u ? "</u>" : ""}${state.b ? "</b>" : ""}${state.i ? "</i>" : ""}`;
  r.text = tidy(out.replace(/ {2,}/g, " "));
  return r;
}

/** SRT cue body → normal form. Keeps <i>/<b>/<u>, drops <font>, reads {\an8} and stray ASS overrides. */
export function fromSrt(body: string): ReadMarkup {
  const r = blank("");
  let t = body.replace(/<\s*(\/?)\s*([ibu])\s*>/gi, (_m, slash: string, tag: string) => {
    return `<${slash}${tag.toLowerCase()}>`;
  });
  t = t.replace(/<\s*\/?\s*(font|s|span)\b[^>]*>/gi, (m) => {
    if (/font/i.test(m)) r.fonts = true;
    else r.styled = true;
    return "";
  });
  const state = { i: false, b: false, u: false };
  t = t.replace(/\{([^{}]*\\[^{}]*)\}/g, (_m, block: string) => {
    const o = readOverrides(block, state);
    if (o.top !== undefined) r.top = o.top;
    if (o.styled) r.styled = true;
    return o.tags;
  });
  r.text = tidy(t);
  return r;
}

const entities: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  nbsp: " ",
  lrm: "‎",
  rlm: "‏",
  quot: '"',
  apos: "'",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, name: string) => {
    if (name[0] === "#") {
      const code =
        name[1] === "x" || name[1] === "X"
          ? Number.parseInt(name.slice(2), 16)
          : Number.parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return entities[name.toLowerCase()] ?? m;
  });
}

/**
 * WebVTT cue payload → normal form. Keeps <i>/<b>/<u> (class names dropped), unwraps <c>, <v>,
 * <lang> and <ruby> (the ruby annotation text is dropped, the base text kept), removes inline
 * timestamps, decodes entities. Literal "<" in the result is escaped back on write.
 */
export function fromVtt(payload: string): ReadMarkup {
  const r = blank("");
  // Ruby annotations (<rt>...</rt>) are pronunciation hints; the base text carries the words.
  let t = payload.replace(/<rt(\.[^>\s]*)?>[\s\S]*?<\/rt>/g, () => {
    r.spans = true;
    return "";
  });
  t = t.replace(/<([^>]*)>/g, (_m, inner: string) => {
    const tag = inner.trim();
    if (/^\/?[ibu](\.[^\s>]*)?$/.test(tag)) {
      const close = tag.startsWith("/");
      return `<${close ? "/" : ""}${tag.replace(/^\//, "")[0]}>`;
    }
    if (/^v(\.|\s|$)/.test(tag)) {
      r.voices = true;
      return "";
    }
    if (/^\/v$/.test(tag)) return "";
    r.spans = true;
    return "";
  });
  r.text = tidy(decodeEntities(t));
  return r;
}

/** SBV has no markup; the text is taken as it is. */
export const fromPlain = (body: string): ReadMarkup => blank(tidy(body));

const TAG = /<\/?[ibu]>/g;

/** Normal form → plain text (SBV, TXT, cue list previews). */
export const plain = (text: string) => text.replace(TAG, "");

/** True when the text uses italic, bold or underline. */
export const hasEmphasis = (text: string) => /<[ibu]>/.test(text);

/** Normal form → SRT body. SRT has no escaping; the six tags pass through. */
export const toSrt = (text: string, top?: boolean) => `${top ? "{\\an8}" : ""}${text}`;

/** Normal form → WebVTT payload: escapes & < > outside the six tags. */
export function toVtt(text: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  let out = "";
  let last = 0;
  for (const m of text.matchAll(TAG)) {
    out += esc(text.slice(last, m.index)) + m[0];
    last = (m.index ?? 0) + m[0].length;
  }
  return out + esc(text.slice(last));
}

/** Normal form → ASS Text field: tags become overrides, line breaks become \N. */
export function toAss(text: string, top?: boolean): string {
  const map: Record<string, string> = {
    "<i>": "{\\i1}",
    "</i>": "{\\i0}",
    "<b>": "{\\b1}",
    "</b>": "{\\b0}",
    "<u>": "{\\u1}",
    "</u>": "{\\u0}",
  };
  const body = text.replace(TAG, (t) => map[t] ?? "").replace(/\n/g, "\\N");
  return `${top ? "{\\an8}" : ""}${body.replace(/\}\{/g, "")}`;
}
