import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Light-theme colours for build-time images (OG cards), read from the one source of truth,
 * `src/styles/globals.css` (ADR-0009), and converted from OKLCH to sRGB hex because the image
 * renderer does not understand OKLCH. Server/build only.
 */

export type OgPalette = Record<
  "bg" | "bgSubtle" | "bgRaised" | "fg" | "fgMuted" | "border",
  string
>;

function oklchToHex(l: number, c: number, hDeg: number): string {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  return `#${lin
    .map((x) => {
      const v = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
      return Math.round(Math.min(1, Math.max(0, v)) * 255)
        .toString(16)
        .padStart(2, "0");
    })
    .join("")}`;
}

let cached: OgPalette | undefined;

export function ogPalette(): OgPalette {
  if (cached) return cached;
  const css = readFileSync(join(process.cwd(), "src/styles/globals.css"), "utf8");
  const root = /:root\s*{([^}]*)}/.exec(css)?.[1] ?? "";
  const token = (name: string): string => {
    const m = new RegExp(`--${name}:\\s*oklch\\(([\\d.]+)%\\s+([\\d.]+)\\s+([\\d.]+)\\)`).exec(
      root,
    );
    if (!m) throw new Error(`OG palette: --${name} is not an oklch() value in globals.css`);
    return oklchToHex(Number(m[1]) / 100, Number(m[2]), Number(m[3]));
  };
  cached = {
    bg: token("bg"),
    bgSubtle: token("bg-subtle"),
    bgRaised: token("bg-raised"),
    fg: token("fg"),
    fgMuted: token("fg-muted"),
    border: token("border"),
  };
  return cached;
}
