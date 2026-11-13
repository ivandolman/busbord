// The train station near the chosen origin (/api/station), to start from one of its platforms

import { useEffect, useState } from "react"

import { z } from "zod"

import type { TrainStation } from "@/features/board/board.types"
import { pointId } from "@/lib/place"

// --- CONSTANTS ---

const StationResponseSchema = z.object({
    station: z
        .object({
            areaId: z.string(),
            name: z.string(),
            platforms: z.array(z.object({ code: z.string(), lat: z.number(), lon: z.number() })),
        })
        .nullable(),
})

// --- HELPERS ---

/** The platform of `station` that place `id` starts at, if any. */
export function platformAt(id: string | null, station: TrainStation | null) {
    return station?.platforms.find((platform) => pointId(platform) === id) ?? null
}

/** Null when nothing is chosen, no station is near, or while a new station loads. */
export function useTrainStation(id: string | null): TrainStation | null {
    const [found, setFound] = useState<{ id: string; station: TrainStation | null } | null>(null)

    useEffect(() => {
        if (id === null) return
        const controller = new AbortController()
        fetch(`/api/station?id=${encodeURIComponent(id)}`, { signal: controller.signal })
            .then((response) => (response.ok ? response.json() : null))
            .then((body: unknown) => {
                const parsed = StationResponseSchema.safeParse(body)
                if (parsed.success) setFound({ id, station: parsed.data.station })
            })
            .catch(() => {
                // Aborted by the next selection, or offline: no platform choice then.
            })
        return () => controller.abort()
    }, [id])

    if (!found || id === null) return null
    if (found.id === id) return found.station
    // Switching platform changes the id, not the station: keep the chips while it reloads.
    return platformAt(id, found.station) ? found.station : null
}
