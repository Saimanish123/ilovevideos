/**
 * Gives ffmpeg.wasm an input without copying it into WASM memory. `writeFile(fetchFile(file))` held
 * the whole file in the module's memory: a 1.1 GB MP4 peaked at 3.9 GB of browser memory and a
 * 2.28 GB one failed ("File could not be read! Code=-1"), because a 32-bit WASM heap cannot hold it.
 * Mounted with WORKERFS, the file stays a File and ffmpeg's worker reads the bytes it asks for when
 * it asks (FileReaderSync), so the input costs no heap at all. Outputs are still written to the
 * in-memory file system and must fit there (./limits).
 */
import type { FFmpeg } from "@ffmpeg/ffmpeg";

let next = 0;

export interface MountedInput {
  /** The path to give ffmpeg's `-i`. */
  path: string;
  /** Unmounts and removes the directory; safe to call twice. */
  release: () => Promise<void>;
}

export async function mountInput(ff: FFmpeg, file: File): Promise<MountedInput> {
  next += 1;
  const dir = `/input-${next}`;
  await ff.createDir(dir);
  try {
    // "WORKERFS" is the string value of FFFSType.WORKERFS; the class library is loaded at run time
    // from our origin, so its enum is not imported into the bundle.
    await ff.mount("WORKERFS" as Parameters<FFmpeg["mount"]>[0], { files: [file] }, dir);
  } catch (e) {
    await ff.deleteDir(dir).catch(() => undefined);
    throw e;
  }
  let released = false;
  return {
    path: `${dir}/${file.name}`,
    release: async () => {
      if (released) return;
      released = true;
      await ff.unmount(dir).catch(() => undefined);
      await ff.deleteDir(dir).catch(() => undefined);
    },
  };
}
