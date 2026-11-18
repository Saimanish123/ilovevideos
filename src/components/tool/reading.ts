/**
 * Files a stage is still reading (FileList draws a row for each). Kept apart from file-list.tsx so
 * the first-load stage can use it without pulling in the list.
 */

/** The list without the first occurrence of `file` (a file chosen twice is read twice). */
export function withoutFirst(files: File[], file: File): File[] {
  const i = files.indexOf(file);
  return i < 0 ? files : [...files.slice(0, i), ...files.slice(i + 1)];
}
