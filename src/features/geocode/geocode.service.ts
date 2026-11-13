// Geocode service: Dutch addresses by text and the address at a point, from PDOK Locatieserver

import { config, parseBoundingBox, type BoundingBox } from "@/lib/config"
import type { Point } from "@/lib/place"

import { PdokResponseSchema, type Address } from "./geocode.schema"

// --- CONSTANTS ---

/** Stops are listed without waiting longer than this for addresses. */
const FETCH_TIMEOUT_MS = 1_500
const SEARCH_ROWS = 6
const CACHE_TTL_MS = 10 * 60_000
const CACHE_ENTRIES = 500
const FIELDS = [
    "straatnaam",
    "huisnummer",
    "huisletter",
    "huisnummertoevoeging",
    "postcode",
    "woonplaatsnaam",
    "centroide_ll",
].join(",")

// --- INTERFACES ---

export interface GeocodeServiceDependencies {
    /** Locatieserver base URL; empty turns address search off. */
    baseUrl: string
    userAgent: string
    /** Region the timetable covers: addresses outside it are left out, nearer ones rank higher. */
    region: BoundingBox
    fetch: typeof fetch
    now: () => number
}

// --- SERVICE ---

export const createGeocodeService = ({
    baseUrl = config.geocodeUrl,
    userAgent = config.userAgent,
    region = parseBoundingBox(config.gtfsBbox),
    fetch: fetchJson = fetch,
    now = Date.now,
}: Partial<GeocodeServiceDependencies> = {}) => {
    const cache = new Map<string, { addresses: Address[]; at: number }>()
    const center = {
        lat: (region.minLat + region.maxLat) / 2,
        lon: (region.minLon + region.maxLon) / 2,
    }
    const inRegion = (address: Address) =>
        address.lat >= region.minLat &&
        address.lat <= region.maxLat &&
        address.lon >= region.minLon &&
        address.lon <= region.maxLon

    async function request(path: string, params: Record<string, string>): Promise<Address[]> {
        const url = `${baseUrl}/${path}?${new URLSearchParams({ ...params, fl: FIELDS })}`
        const cached = cache.get(url)
        if (cached && now() - cached.at < CACHE_TTL_MS) return cached.addresses
        try {
            const response = await fetchJson(url, {
                headers: { "User-Agent": userAgent },
                signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            })
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            const parsed = PdokResponseSchema.parse(await response.json())
            const addresses = parsed.response.docs.filter(inRegion)
            if (cache.size >= CACHE_ENTRIES) cache.delete(cache.keys().next().value ?? "")
            cache.set(url, { addresses, at: now() })
            return addresses
        } catch (error) {
            console.warn(
                "Address search unavailable:",
                error instanceof Error ? error.message : error,
            )
            return []
        }
    }

    return {
        /** Addresses matching what is typed, nearest to the region first; [] when unavailable. */
        searchAddresses(query: string): Promise<Address[]> {
            if (!baseUrl) return Promise.resolve([])
            return request("suggest", {
                q: query,
                fq: "type:adres",
                rows: String(SEARCH_ROWS),
                lat: String(center.lat),
                lon: String(center.lon),
            })
        },

        /** The address within `meters` of a point, or null. */
        async addressAt(point: Point, meters: number): Promise<Address | null> {
            if (!baseUrl) return null
            const [address] = await request("reverse", {
                lat: point.lat.toFixed(5),
                lon: point.lon.toFixed(5),
                type: "adres",
                rows: "1",
                distance: String(meters),
            })
            return address ?? null
        },
    }
}

export type GeocodeService = ReturnType<typeof createGeocodeService>

export const geocodeService = createGeocodeService()
