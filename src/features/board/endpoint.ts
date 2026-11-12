// Resolves an origin or destination (stop area or map point) into the platforms that count

import type { Walker } from "@/features/roads/walking"
import { config } from "@/lib/config"
import { parsePointId } from "@/lib/place"

import type { TimetableRepository } from "./board.repository"
import type { Area, Endpoint } from "./board.types"
import { minutesToWalkMeters, STRAIGHT_LINE_DETOUR } from "./build-board"

// --- CONSTANTS ---

/** A map point is named after the busiest stop this close ("Bij Utrecht, Kleinesingel"). */
const POINT_NAME_METERS = 800

// --- INTERFACES ---

/** How an origin or destination picks its stops. */
export interface EndpointOptions {
    /** "Ook haltes op loopafstand". */
    walking: boolean
    role: "from" | "to"
    /** The traveller's longest walk to (or from) a stop; default config.board.defaultMaxWalkMinutes. */
    maxWalkMeters?: number
    walker?: Walker | null
}

// --- ERRORS ---

export class UnknownAreaError extends Error {
    constructor(public readonly areaId: string) {
        super(`Unknown stop area: ${areaId}`)
        this.name = "UnknownAreaError"
    }
}

// --- SERVICE ---

/**
 * How far you may walk to a stop that is not the one you chose:
 * - a point on the map: the longest walk you set; with walking off, the shorter of that and a few
 *   hundred metres (a point has no stop of its own);
 * - a stop as origin: the longest walk with walking on, else only the stop itself;
 * - a stop as destination: just across the street (getting off further away is a different place).
 */
export function endpointWalkLimit(id: string, options: EndpointOptions): number {
    const { board } = config
    const max = options.maxWalkMeters ?? minutesToWalkMeters(board.defaultMaxWalkMinutes)
    if (parsePointId(id)) {
        return options.walking
            ? max
            : Math.min(max, Math.round(board.pointMeters * STRAIGHT_LINE_DETOUR))
    }
    if (!options.walking) return 0
    return options.role === "from"
        ? max
        : Math.min(max, Math.round(board.destinationWalkMeters * STRAIGHT_LINE_DETOUR))
}

/**
 * Turns a stop area id or a map point into the platforms that count, each with its walk.
 * A stop area always includes same-named areas next to it (the feed often splits bus and tram).
 */
export function resolveEndpoint(
    repository: TimetableRepository,
    id: string,
    options: EndpointOptions,
): Endpoint {
    const { board } = config
    const walker = options.walker ?? null
    const limit = endpointWalkLimit(id, options)
    const point = parsePointId(id)
    if (point) {
        // Named after the nearest stop, even when walking is off.
        const nearest = repository.nearestArea(point.lat, point.lon, POINT_NAME_METERS)
        const area: Area = {
            id,
            name: nearest ? `Bij ${nearest.name}` : "Punt op de kaart",
            lat: point.lat,
            lon: point.lon,
            departures: 0,
        }
        return {
            area,
            kind: "point",
            walkMeters: platformsWithinWalk(repository, [point.lat, point.lon], limit, walker),
        }
    }

    const area = repository.getArea(id)
    if (!area) throw new UnknownAreaError(id)
    const walkMeters = new Map<string, number>()
    if (limit > 0) {
        for (const [stopId, meters] of platformsWithinWalk(
            repository,
            [area.lat, area.lon],
            limit,
            walker,
        )) {
            // A nearby platform is never free: count at least a short walk so the chosen stop wins ties.
            walkMeters.set(stopId, Math.max(meters, 1))
        }
    }
    for (const stopId of repository.stopIdsInAreas(
        repository.sameStopAreaIds(area, board.sameStopMeters),
    )) {
        walkMeters.set(stopId, 0)
    }
    return { area, kind: "area", walkMeters }
}

/**
 * A platform cannot be both where you board and where you get off. A platform of the chosen
 * stop beats a merely nearby one; between two nearby claims the shorter walk wins, origin on a tie.
 */
export function splitSharedPlatforms(origin: Endpoint, destination: Endpoint): void {
    for (const [stopId, toOrigin] of origin.walkMeters) {
        const toDestination = destination.walkMeters.get(stopId)
        if (toDestination === undefined) continue
        if (toDestination < toOrigin) origin.walkMeters.delete(stopId)
        else destination.walkMeters.delete(stopId)
    }
}

// --- HELPERS ---

/**
 * The platforms within a walk of `limit` metres from a place, each with its walk. With a walker,
 * along streets and footpaths (a stop across the water is out, however close it looks); without
 * one, the straight line plus STRAIGHT_LINE_DETOUR.
 */
function platformsWithinWalk(
    repository: TimetableRepository,
    from: [number, number],
    limit: number,
    walker: Walker | null,
): Map<string, number> {
    const result = new Map<string, number>()
    if (limit <= 0) return result
    if (!walker) {
        for (const [id, line] of repository.stopsNear(
            from[0],
            from[1],
            limit / STRAIGHT_LINE_DETOUR,
        )) {
            result.set(id, Math.round(line * STRAIGHT_LINE_DETOUR))
        }
        return result
    }
    // Walking is never shorter than the straight line: nothing beyond `limit` that way can count.
    const straight = repository.stopsNear(from[0], from[1], limit)
    const ids = [...straight.keys()]
    if (ids.length === 0) return result
    const positions = repository.stopPositions(ids)
    const routed = walker.distances(
        from,
        ids.map((id) => positions.get(id) ?? from),
        limit,
    )
    ids.forEach((id, i) => {
        const walk = routed[i]
        if (walk == null) return
        // Shorter than the straight line: both ends snapped onto one path. Use the line.
        result.set(id, Math.round(Math.max(walk, straight.get(id) ?? 0)))
    })
    return result
}
