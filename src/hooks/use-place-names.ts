// Names of the chosen places, remembered as they become known and looked up when missing

import { useCallback, useEffect, useState } from "react"

import { z } from "zod"

// --- CONSTANTS ---

const PlaceSchema = z.object({ id: z.string(), name: z.string() })

// --- INTERFACES ---

export interface NamedPlace {
    id: string
    name: string
}

// --- HELPERS ---

export function usePlaceNames(fromId: string | null, toId: string | null) {
    const [names, setNames] = useState<Record<string, string>>({})

    const remember = useCallback((...places: NamedPlace[]) => {
        setNames((known) => ({
            ...known,
            ...Object.fromEntries(places.map((place) => [place.id, place.name])),
        }))
    }, [])

    // A selection restored from the URL arrives without a name; look it up once.
    useEffect(() => {
        const missing = [fromId, toId].filter((id): id is string => id !== null && !names[id])
        if (missing.length === 0) return
        const controller = new AbortController()
        for (const id of missing) {
            fetch(`/api/place?id=${encodeURIComponent(id)}`, { signal: controller.signal })
                .then((response) => (response.ok ? response.json() : null))
                .then((body: unknown) => {
                    const place = PlaceSchema.safeParse(body)
                    if (!place.success) return
                    const { id: placeId, name } = place.data
                    setNames((known) => (known[placeId] ? known : { ...known, [placeId]: name }))
                })
                .catch(() => {})
        }
        return () => controller.abort()
    }, [fromId, toId, names])

    return { names, remember }
}
