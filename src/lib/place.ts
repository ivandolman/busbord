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
