/**
 * The schema builder for `OptionsSpec.remember` (ADR-0129): zod's small build, loaded with the
 * engine's spec after a file is chosen, never on a page's first load. zod's JIT is turned off first,
 * as everywhere in the browser (lib/zod-jitless), so it never probes `new Function` under the CSP.
 */
import "@/lib/zod-jitless";
import * as z from "zod/mini";

export { z };

/** A number from `min` to `max`, both included. */
export const between = (min: number, max: number) =>
  z.number().check(z.minimum(min), z.maximum(max));
