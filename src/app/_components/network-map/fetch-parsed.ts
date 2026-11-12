// Fetches JSON from the app's API and validates it with a Zod schema where it enters the client

import type { z } from "zod"

// --- HELPERS ---

/** Rejects on a non-2xx answer, an abort or a body that does not match the schema. */
export async function fetchParsed<Schema extends z.ZodType>(
    url: string,
    schema: Schema,
    signal?: AbortSignal,
): Promise<z.output<Schema>> {
    const response = await fetch(url, { signal })
    if (!response.ok) throw new Error(`${url} answered ${response.status}`)
    return schema.parse(await response.json())
}
