/**
 * Hands a result to the next tool without a download and re-upload (feature catalog L2, first step).
 * The next-step link stores the file here and the next page's stage takes it on mount. It is module
 * memory, so it survives client-side navigation and nothing else: a reload or a new tab starts empty,
 * and the file never leaves the device.
 */
let pending: File[] = [];

export function setHandoff(file: File): void {
  pending = [file];
}

/**
 * Several files at once (files shared to the installed app, ADR-0103): a multi-file page takes them
 * all, a page that batches runs them as a batch, any other page opens the first.
 */
export function setHandoffFiles(files: File[]): void {
  pending = [...files];
}

/** Returns the waiting file once and clears it (the first, when several wait). */
export function takeHandoff(): File | undefined {
  const file = pending[0];
  pending = [];
  return file;
}

/** Returns every waiting file once and clears them. */
export function takeHandoffFiles(): File[] {
  const files = pending;
  pending = [];
  return files;
}

/**
 * Whether a file matches an `<input accept>` list (".srt", "video/*", "image/gif"). A handed-on file
 * the next tool cannot take is dropped rather than opened into an error (design review 2).
 */
export function matchesAccept(file: File, accept: string): boolean {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return accept
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .some((t) =>
      t.startsWith(".")
        ? name.endsWith(t)
        : t.endsWith("/*")
          ? type.startsWith(t.slice(0, -1))
          : type === t,
    );
}
