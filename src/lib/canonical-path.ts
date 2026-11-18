/**
 * The one address of a path: lowercase, no trailing slash, no whitespace around a segment. Returns the
 * input unchanged when it already is canonical (src/proxy.ts redirects when it is not).
 */
export function canonicalPath(pathname: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    // A malformed escape is left as it is: no route matches it, so it gets the 404.
    return pathname;
  }
  const clean = decoded
    .split("/")
    .map((segment) => segment.trim())
    .join("/")
    .toLowerCase();
  const trimmed = clean.length > 1 ? clean.replace(/\/+$/, "") : clean;
  return trimmed === decoded ? pathname : encodeURI(trimmed || "/");
}
