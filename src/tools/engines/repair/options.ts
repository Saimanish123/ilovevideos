import { z } from "zod";

/** Repair has no settings: the diagnosis decides what is done (ADR-0097). */
export const RepairOptions = z.object({});
export type RepairOptions = z.infer<typeof RepairOptions>;
