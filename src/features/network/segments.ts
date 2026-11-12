// Cuts lines down to the stretch a traveller rides, for drawing a planned route on the map

import type { DatabaseSync } from "node:sqlite"

import { locateStopsOnPath, slicePath, type PathPosition } from "@/features/roads/line-path"

import type { LatLon } from "./network.service"
import { loadPatterns, type PatternRow } from "./patterns"

// --- CONSTANTS ---

/** Per database handle; a new import swaps the handle and drops the entry with it. */
const cache = new WeakMap<DatabaseSync, Lookup>()

// --- INTERFACES ---

/** Where a line is boarded and left for one origin/destination pair. */
export interface RidePair {
    routeId: string
    fromStopId: string
    toStopId: string
}

/** The stretch of a line between boarding and alighting, and the stop areas along it. */
export interface RideSegment {
    routeId: string
    path: LatLon[]
    areaIds: string[]
    /** The platforms ridden past, with their stop area: a ride starts and ends at these, not at the area's middle. */
    stops: { areaId: string; position: LatLon }[]
}

interface Lookup {
    byRoute: Map<string, PatternRow[]>
    stops: Map<string, { areaId: string; position: LatLon }>
    /** Where every stop of a pattern lies along its path, computed when first needed. */
    stopIndexes: WeakMap<PatternRow, PathPosition[]>
}

// --- SERVICE ---

/**
 * Cuts each line down to the part a traveller rides: from the stop where they board to the stop
 * where they get off, following the drawn route (or the stops in a straight line when the
 * database has no route shapes). A pair that no stored pattern covers in order (the importer
 * drops short runs) is drawn as a straight hop.
 */
export function rideSegments(db: DatabaseSync, pairs: RidePair[]): RideSegment[] {
    const { byRoute, stops, stopIndexes } = lookup(db)
    const seen = new Set<string>()
    const segments: RideSegment[] = []

    for (const pair of pairs) {
        const key = `${pair.routeId}|${pair.fromStopId}|${pair.toStopId}`
        if (seen.has(key)) continue
        seen.add(key)

        let best: { pattern: PatternRow; from: number; to: number } | null = null
        for (const pattern of byRoute.get(pair.routeId) ?? []) {
            const from = pattern.stopIds.indexOf(pair.fromStopId)
            if (from < 0) continue
            const to = pattern.stopIds.indexOf(pair.toStopId, from + 1)
            // The shortest matching stretch, in case a long pattern passes the stops more than once.
            if (to > from && (!best || to - from < best.to - best.from))
                best = { pattern, from, to }
        }

        if (!best) {
            const a = stops.get(pair.fromStopId)
            const b = stops.get(pair.toStopId)
            if (a && b) {
                segments.push({
                    routeId: pair.routeId,
                    path: [a.position, b.position],
                    areaIds: [a.areaId, b.areaId],
                    stops: [a, b],
                })
            }
            continue
        }

        const { pattern, from, to } = best
        const rideStops = pattern.stopIds.slice(from, to + 1)
        const rideStopInfo = rideStops
            .map((id) => stops.get(id))
            .filter((stop) => stop !== undefined)
        const areaIds = [...new Set(rideStopInfo.map((stop) => stop.areaId))]
        let path: LatLon[]
        if (pattern.path && pattern.path.length >= 2) {
            let indexes = stopIndexes.get(pattern)
            if (!indexes) {
                const positions = pattern.stopIds.map(
                    (id) => stops.get(id)?.position ?? ([0, 0] as LatLon),
                )
                indexes = locateStopsOnPath(pattern.path, positions)
                stopIndexes.set(pattern, indexes)
            }
            const start = indexes[from]
            const end = indexes[to]
            path = start && end ? slicePath(pattern.path, start, end) : pattern.path
        } else {
            path = rideStops
                .map((id) => stops.get(id)?.position)
                .filter((point): point is LatLon => !!point)
        }
        if (path.length >= 2)
            segments.push({ routeId: pair.routeId, path, areaIds, stops: rideStopInfo })
    }
    return segments
}

// --- HELPERS ---

function lookup(db: DatabaseSync): Lookup {
    let entry = cache.get(db)
    if (!entry) {
        const byRoute = new Map<string, PatternRow[]>()
        for (const pattern of loadPatterns(db)) {
            const list = byRoute.get(pattern.routeId) ?? []
            list.push(pattern)
            byRoute.set(pattern.routeId, list)
        }
        const rows = db
            .prepare("SELECT stop_id AS id, area_id AS areaId, lat, lon FROM stops")
            .all() as unknown as {
            id: string
            areaId: string
            lat: number
            lon: number
        }[]
        const stops = new Map(
            rows.map((row) => [
                row.id,
                { areaId: row.areaId, position: [row.lat, row.lon] as LatLon },
            ]),
        )
        entry = { byRoute, stops, stopIndexes: new WeakMap() }
        cache.set(db, entry)
    }
    return entry
}
