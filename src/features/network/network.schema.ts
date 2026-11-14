// Zod schema for the map's reachable-lines query string, with the input type derived from it

import { z } from "zod"

import { DefaultOnFlagSchema, PlaceIdSchema } from "@/lib/schemas"

// --- SCHEMAS ---

/** At least one of `from` and `to`; `maxWalk`, `tie` and `speed` stay raw for the stored settings. */
export const ReachableQuerySchema = z
    .object({
        from: PlaceIdSchema.optional(),
        to: PlaceIdSchema.optional(),
        walk: DefaultOnFlagSchema,
        tie: z.string().optional(),
        maxWalk: z.string().optional(),
        speed: z.string().optional(),
    })
    .refine((query) => query.from !== undefined || query.to !== undefined)

// --- INTERFACES ---

export type ReachableQuery = z.infer<typeof ReachableQuerySchema>
