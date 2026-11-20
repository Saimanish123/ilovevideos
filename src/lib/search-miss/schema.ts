/**
 * The endpoint's contract (ADR-0150), server side. A body is accepted only when it is exactly what
 * the palette sends (`missPayload`): four known keys, a query already normalised and short, a count
 * that agrees with `zero`. Anything else is refused, so the store can only ever hold search words.
 */
import { z } from "zod";
import { MAX_QUERY, MAX_RESULTS, MIN_QUERY, missQuery } from "./index";

/** Largest body read, in bytes. The longest valid body is about 130; anything bigger is refused. */
export const MAX_BODY_BYTES = 512;

export const searchMissSchema = z
  .strictObject({
    q: z
      .string()
      .min(MIN_QUERY)
      .max(MAX_QUERY)
      .regex(/^[a-z0-9]+(?: [a-z0-9]+)*$/),
    results: z.number().int().min(0).max(MAX_RESULTS),
    opened: z.literal(false),
    zero: z.boolean(),
  })
  .refine((v) => v.zero === (v.results === 0), { message: "zero must match results" })
  // The same filter the browser applies: nothing that looks like an address or a long number.
  .refine((v) => missQuery(v.q) === v.q, { message: "query is not in counted form" });

export type SearchMissBody = z.infer<typeof searchMissSchema>;
