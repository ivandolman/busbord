// Board endpoint ids: a stop area id or a point picked on the map, written "@lat,lon"

import type { z } from "zod"

import { AreaIdSchema, PlaceIdSchema, PointIdSchema, type PointSchema } from "@/lib/schemas"

// --- INTERFACES ---

export type Point = z.infer<typeof PointSchema>

// --- HELPERS ---

export function parsePointId(id: string): Point | null {
    return PointIdSchema.safeParse(id).data ?? null
}

/** Five decimals is about a metre: plenty, and it keeps URLs short. */
export function pointId(point: Point): string {
    return `@${point.lat.toFixed(5)},${point.lon.toFixed(5)}`
}

export function isAreaId(value: string | null): value is string {
    return value !== null && AreaIdSchema.safeParse(value).success
}

/** A stop area id or a map point ("@lat,lon"). Safe to use in the browser. */
export function isPlaceId(value: string | null): value is string {
    return value !== null && PlaceIdSchema.safeParse(value).success
}

/** "Utrecht Centraal, spoor 5": the origin you get by starting from a train platform. */
export function platformPlace(
    station: { name: string },
    platform: { code: string; lat: number; lon: number },
): { id: string; name: string } {
    return {
        id: pointId({ lat: platform.lat, lon: platform.lon }),
        name: `${station.name}, spoor ${platform.code}`,
    }
}

/** "utrecht centraal spoor 5" → the station part and the platform code; null without "spoor". */
export function parsePlatformQuery(query: string): { station: string; code: string } | null {
    const [, station, code] = /^(.*\S)\s+spoor\s*([0-9]+[a-z]?)$/i.exec(query.trim()) ?? []
    if (!station || !code) return null
    return { station, code: code.toLowerCase() }
}
