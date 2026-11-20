/**
 * A monoline stroke alphabet for labels inside tool illustrations (format names such as MOV and MP4,
 * sizes such as 8 MB, ratios such as 9:16). Letters are drawn as paths, not <text>, so they carry the
 * same 1.5 stroke, round caps and joins as the rest of the drawing, need no font, and render the same
 * in the card and in the OG image. Uppercase, digits, space, colon, dot and hyphen only.
 *
 * Each glyph sits on an 8×12 cell (x right, y down) with chamfered corners in place of curves.
 * `label()` scales the cell to height `h` (12 by default) and advances 12 units per character.
 */

type Stroke = [number, number][];

const O: Stroke = [
  [2, 0],
  [6, 0],
  [8, 2],
  [8, 10],
  [6, 12],
  [2, 12],
  [0, 10],
  [0, 2],
  [2, 0],
];
const P: Stroke = [
  [0, 12],
  [0, 0],
  [6, 0],
  [8, 2],
  [8, 4],
  [6, 6],
  [0, 6],
];

const GLYPHS: Record<string, Stroke[]> = {
  A: [
    [
      [0, 12],
      [0, 3],
      [3, 0],
      [5, 0],
      [8, 3],
      [8, 12],
    ],
    [
      [0, 7],
      [8, 7],
    ],
  ],
  B: [
    [
      [0, 6],
      [6, 6],
      [8, 4],
      [8, 2],
      [6, 0],
      [0, 0],
      [0, 12],
      [6, 12],
      [8, 10],
      [8, 8],
      [6, 6],
    ],
  ],
  C: [
    [
      [8, 2],
      [6, 0],
      [2, 0],
      [0, 2],
      [0, 10],
      [2, 12],
      [6, 12],
      [8, 10],
    ],
  ],
  D: [
    [
      [0, 0],
      [5, 0],
      [8, 3],
      [8, 9],
      [5, 12],
      [0, 12],
      [0, 0],
    ],
  ],
  E: [
    [
      [8, 0],
      [0, 0],
      [0, 12],
      [8, 12],
    ],
    [
      [0, 6],
      [6, 6],
    ],
  ],
  F: [
    [
      [8, 0],
      [0, 0],
      [0, 12],
    ],
    [
      [0, 6],
      [6, 6],
    ],
  ],
  G: [
    [
      [8, 2],
      [6, 0],
      [2, 0],
      [0, 2],
      [0, 10],
      [2, 12],
      [6, 12],
      [8, 10],
      [8, 6],
      [4, 6],
    ],
  ],
  H: [
    [
      [0, 0],
      [0, 12],
    ],
    [
      [8, 0],
      [8, 12],
    ],
    [
      [0, 6],
      [8, 6],
    ],
  ],
  I: [
    [
      [4, 0],
      [4, 12],
    ],
    [
      [1, 0],
      [7, 0],
    ],
    [
      [1, 12],
      [7, 12],
    ],
  ],
  J: [
    [
      [8, 0],
      [8, 10],
      [6, 12],
      [2, 12],
      [0, 10],
    ],
  ],
  K: [
    [
      [0, 0],
      [0, 12],
    ],
    [
      [8, 0],
      [0, 8],
    ],
    [
      [3, 5],
      [8, 12],
    ],
  ],
  L: [
    [
      [0, 0],
      [0, 12],
      [8, 12],
    ],
  ],
  M: [
    [
      [0, 12],
      [0, 0],
      [4, 6],
      [8, 0],
      [8, 12],
    ],
  ],
  N: [
    [
      [0, 12],
      [0, 0],
      [8, 12],
      [8, 0],
    ],
  ],
  O: [O],
  P: [P],
  Q: [
    O,
    [
      [5, 9],
      [8, 12],
    ],
  ],
  R: [
    P,
    [
      [4, 6],
      [8, 12],
    ],
  ],
  S: [
    [
      [8, 2],
      [6, 0],
      [2, 0],
      [0, 2],
      [0, 4],
      [2, 6],
      [6, 6],
      [8, 8],
      [8, 10],
      [6, 12],
      [2, 12],
      [0, 10],
    ],
  ],
  T: [
    [
      [0, 0],
      [8, 0],
    ],
    [
      [4, 0],
      [4, 12],
    ],
  ],
  U: [
    [
      [0, 0],
      [0, 10],
      [2, 12],
      [6, 12],
      [8, 10],
      [8, 0],
    ],
  ],
  V: [
    [
      [0, 0],
      [4, 12],
      [8, 0],
    ],
  ],
  W: [
    [
      [0, 0],
      [2, 12],
      [4, 6],
      [6, 12],
      [8, 0],
    ],
  ],
  X: [
    [
      [0, 0],
      [8, 12],
    ],
    [
      [8, 0],
      [0, 12],
    ],
  ],
  Y: [
    [
      [0, 0],
      [4, 6],
      [8, 0],
    ],
    [
      [4, 6],
      [4, 12],
    ],
  ],
  Z: [
    [
      [0, 0],
      [8, 0],
      [0, 12],
      [8, 12],
    ],
  ],
  "0": [
    O,
    [
      [2, 10],
      [6, 2],
    ],
  ],
  "1": [
    [
      [2, 2],
      [4, 0],
      [4, 12],
    ],
    [
      [1, 12],
      [7, 12],
    ],
  ],
  "2": [
    [
      [0, 2],
      [2, 0],
      [6, 0],
      [8, 2],
      [8, 4],
      [0, 12],
      [8, 12],
    ],
  ],
  "3": [
    [
      [0, 2],
      [2, 0],
      [6, 0],
      [8, 2],
      [8, 4],
      [6, 6],
      [3, 6],
    ],
    [
      [6, 6],
      [8, 8],
      [8, 10],
      [6, 12],
      [2, 12],
      [0, 10],
    ],
  ],
  "4": [
    [
      [6, 12],
      [6, 0],
      [0, 8],
      [8, 8],
    ],
  ],
  "5": [
    [
      [8, 0],
      [0, 0],
      [0, 5],
      [6, 5],
      [8, 7],
      [8, 10],
      [6, 12],
      [2, 12],
      [0, 10],
    ],
  ],
  "6": [
    [
      [7, 0],
      [2, 0],
      [0, 2],
      [0, 10],
      [2, 12],
      [6, 12],
      [8, 10],
      [8, 8],
      [6, 6],
      [0, 6],
    ],
  ],
  "7": [
    [
      [0, 0],
      [8, 0],
      [3, 12],
    ],
  ],
  "8": [
    [
      [2, 6],
      [0, 4],
      [0, 2],
      [2, 0],
      [6, 0],
      [8, 2],
      [8, 4],
      [6, 6],
      [2, 6],
      [0, 8],
      [0, 10],
      [2, 12],
      [6, 12],
      [8, 10],
      [8, 8],
      [6, 6],
    ],
  ],
  "9": [
    [
      [8, 6],
      [2, 6],
      [0, 4],
      [0, 2],
      [2, 0],
      [6, 0],
      [8, 2],
      [8, 10],
      [6, 12],
      [1, 12],
    ],
  ],
  ":": [
    [
      [4, 3],
      [4, 3],
    ],
    [
      [4, 9],
      [4, 9],
    ],
  ],
  ".": [
    [
      [4, 12],
      [4, 12],
    ],
  ],
  "-": [
    [
      [1, 6],
      [7, 6],
    ],
  ],
  " ": [],
};

const ADVANCE = 12;
const CELL = 8;

const n = (v: number) => String(Math.round(v * 2) / 2);

/** Width of `text` at height `h`, from the left edge of the first glyph to the right edge of the last. */
export function labelWidth(text: string, h = 12): number {
  const s = h / 12;
  return text.length === 0 ? 0 : ((text.length - 1) * ADVANCE + CELL) * s;
}

/**
 * Path data for `text` with its top-left corner at (x, y) and cap height `h`. Unknown characters
 * throw, so a label never silently drops a letter. Pair it with a <path> that inherits the frame's
 * stroke (no fill); dots and colons are zero-length segments, drawn by the round caps.
 */
export function label(text: string, x: number, y: number, h = 12): string {
  const s = h / 12;
  let d = "";
  [...text.toUpperCase()].forEach((ch, i) => {
    const g = GLYPHS[ch];
    if (!g) throw new Error(`No glyph for "${ch}" in illustration label "${text}"`);
    const ox = x + i * ADVANCE * s;
    for (const stroke of g) {
      d += stroke
        .map(([px, py], j) => `${j === 0 ? "M" : "L"}${n(ox + px * s)} ${n(y + py * s)}`)
        .join("");
    }
  });
  return d;
}

/** `label()` centred horizontally on `cx`. */
export function labelCentered(text: string, cx: number, y: number, h = 12): string {
  return label(text, cx - labelWidth(text, h) / 2, y, h);
}
