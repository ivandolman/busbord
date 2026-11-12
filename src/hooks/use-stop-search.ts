// Stops matching what is typed (/api/stops), debounced, with the highlighted option

import { useEffect, useState } from "react"

import { z } from "zod"

// --- CONSTANTS ---

const SEARCH_DEBOUNCE_MS = 200

const StopsResponseSchema = z.object({
    stops: z.array(z.object({ id: z.string(), name: z.string() })),
})

// --- INTERFACES ---

export type StopSearchResult = z.infer<typeof StopsResponseSchema>["stops"][number]

// --- HELPERS ---

/** `query` is searched only while `enabled`; otherwise the list is empty. */
export function useStopSearch(query: string, enabled: boolean) {
    const [options, setOptions] = useState<StopSearchResult[]>([])
    const [active, setActive] = useState(0)

    // Cleared while rendering, so a list for an old query never shows when searching resumes.
    if (!enabled && options.length > 0) setOptions([])

    useEffect(() => {
        if (!enabled) return
        const controller = new AbortController()
        const timer = setTimeout(async () => {
            try {
                const response = await fetch(`/api/stops?q=${encodeURIComponent(query)}`, {
                    signal: controller.signal,
                })
                if (!response.ok) return
                const body = StopsResponseSchema.parse(await response.json())
                setOptions(body.stops)
                setActive(0)
            } catch {
                // Aborted by the next keystroke, or offline; the list simply stays as it was.
            }
        }, SEARCH_DEBOUNCE_MS)
        return () => {
            clearTimeout(timer)
            controller.abort()
        }
    }, [query, enabled])

    return { options, active, setActive }
}
