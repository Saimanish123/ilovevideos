/**
 * Our own static assets, loaded from this origin: the Geist font files that burned-in subtitles are
 * drawn with (copied to /wasm/fonts by scripts/copy-wasm.mjs, SIL Open Font License 1.1). Nothing
 * here carries user data; the path is checked so this can never become a general fetch.
 */

export const GEIST_FONTS = [
  { file: "Geist-Regular.ttf", weight: "400", style: "normal" },
  { file: "Geist-Bold.ttf", weight: "700", style: "normal" },
  { file: "Geist-Italic.ttf", weight: "400", style: "italic" },
  { file: "Geist-BoldItalic.ttf", weight: "700", style: "italic" },
] as const;

/** Total download for the four font files, for the loading line. */
export const GEIST_FONT_BYTES = 513_756;

const cache = new Map<string, Promise<Uint8Array>>();

export function loadFontFile(file: (typeof GEIST_FONTS)[number]["file"]): Promise<Uint8Array> {
  const path = `/wasm/fonts/${file}`;
  if (!/^\/wasm\/fonts\/[\w-]+\.ttf$/.test(path)) throw new Error("Not a bundled font.");
  let p = cache.get(path);
  if (!p) {
    p = fetch(path) // privacy-allow: our own font file under /wasm/fonts, same origin, no user data
      .then((r) => {
        if (!r.ok) throw new Error(`The subtitle font could not be loaded (${r.status}).`);
        return r.arrayBuffer();
      })
      .then((b) => new Uint8Array(b));
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return p;
}
