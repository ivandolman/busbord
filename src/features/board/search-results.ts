// The place search list: stops, train platforms and addresses in one order the traveller expects

import type { Address } from "@/features/geocode/geocode.schema"
import { parsePlatformQuery, pointId } from "@/lib/place"

// --- CONSTANTS ---

const MAX_RESULTS = 8
/** Rows kept for the second group, so the first never pushes it out of the list. */
const SECOND_GROUP_ROWS = 3
/** Shorter queries match half the country's streets. */
export const MIN_ADDRESS_QUERY_LENGTH = 3

// --- INTERFACES ---

export type PlaceKind = "stop" | "platform" | "address"

export interface PlaceSuggestion {
    id: string
    name: string
    kind: PlaceKind
    /** Addresses: the postcode, shown under the name. */
    detail?: string
}

// --- HELPERS ---

/** "kerkstraat 12", "3511 AB", "Oudegracht 10a utrecht": an address, not "utrecht spoor 5". */
export function looksLikeAddress(query: string): boolean {
    if (parsePlatformQuery(query)) return false
    return /\d{4}\s?[a-z]{2}\b/i.test(query) || /[a-z]{2,}\.?\s+\d+/i.test(query)
}

/**
 * Platforms and stops first, then addresses; when the query looks like an address, addresses
 * first. Duplicate points (two entrances of one house) are dropped.
 */
export function mergeSearchResults(
    query: string,
    stops: PlaceSuggestion[],
    addresses: Address[],
): PlaceSuggestion[] {
    const seen = new Set<string>()
    const places: PlaceSuggestion[] = []
    for (const address of addresses) {
        const id = pointId(address)
        if (seen.has(id) || stops.some((stop) => stop.id === id)) continue
        seen.add(id)
        places.push({
            id,
            name: address.name,
            kind: "address",
            ...(address.postcode ? { detail: address.postcode } : {}),
        })
    }

    return looksLikeAddress(query) ? stack(places, stops) : stack(stops, places)
}

function stack(first: PlaceSuggestion[], second: PlaceSuggestion[]): PlaceSuggestion[] {
    const room = MAX_RESULTS - Math.min(second.length, SECOND_GROUP_ROWS)
    return [...first.slice(0, room), ...second].slice(0, MAX_RESULTS)
}
