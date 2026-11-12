// Fetches what the current origin and destination make reachable on the map

"use client"

import { useEffect, useState } from "react"

import { fetchParsed } from "./fetch-parsed"
import { ReachableSchema, type Reachable } from "./network-map.schema"

// --- INTERFACES ---

interface UseReachableOptions {
    fromId: string | null
    toId: string | null
    walk: boolean
    /** Walking settings as query parameters; null until the settings are loaded. */
    walkQuery: string | null
}

// --- HOOK ---

export function useReachable({
    fromId,
    toId,
    walk,
    walkQuery,
}: UseReachableOptions): Reachable | null {
    const [reachable, setReachable] = useState<Reachable | null>(null)

    // Without origin and destination nothing narrows the map; forget the last answer at once.
    const hasSelection = Boolean(fromId || toId)
    const [hadSelection, setHadSelection] = useState(hasSelection)
    if (hadSelection !== hasSelection) {
        setHadSelection(hasSelection)
        if (!hasSelection) setReachable(null)
    }

    useEffect(() => {
        if ((!fromId && !toId) || walkQuery === null) return
        const controller = new AbortController()
        const query = new URLSearchParams(`${walkQuery}&walk=${walk ? "1" : "0"}`)
        if (fromId) query.set("from", fromId)
        if (toId) query.set("to", toId)
        fetchParsed(`/api/reachable?${query}`, ReachableSchema, controller.signal)
            .then(setReachable)
            .catch(() => {
                if (!controller.signal.aborted) setReachable(null)
            })
        return () => controller.abort()
    }, [fromId, toId, walk, walkQuery])

    return reachable
}
