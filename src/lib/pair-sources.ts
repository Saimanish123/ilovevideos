/**
 * Source formats that have a format page of their own for a target ("mov" for `mov-to-mp4`), from a
 * list of slugs. One helper for the home page (registry slugs) and search (index slugs), so a
 * file-first suggestion names the specific page only when it exists (ADR-0125).
 */
export function pairSources(slugs: readonly string[], target: string): string[] {
  const rx = new RegExp(`^([a-z0-9]+)-to-${target}$`);
  return slugs.flatMap((s) => rx.exec(s)?.[1] ?? []);
}

/** Video sources with a `<x>-to-mp4` page and audio sources with a `<x>-to-mp3` page. */
export const pairSourcesOf = (slugs: readonly string[]) => ({
  video: pairSources(slugs, "mp4"),
  audio: pairSources(slugs, "mp3"),
});
