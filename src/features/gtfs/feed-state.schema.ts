// Zod schema for the feed state file the GTFS import keeps next to the database

import { z } from "zod"

// --- SCHEMAS ---

/**
 * What the current database was built from. An unchanged feed only lets the import skip when
 * the other inputs (region, road network) are the same too.
 */
export const FeedStateSchema = z.object({
    etag: z.string(),
    inputs: z.string(),
})

export type FeedState = z.infer<typeof FeedStateSchema>
