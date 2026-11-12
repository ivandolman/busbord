// Places stops along line geometry and builds stop-to-stop paths along the road network

import type { LatLon, RoadRouter, RouteMode } from "./router"

// --- CONSTANTS ---

const METERS_PER_DEGREE = 111_320

// --- INTERFACES ---

/** Where a stop lies along a path: on segment `index` → `index + 1`, at `point`. */
export interface PathPosition {
    index: number
    point: LatLon
}

export interface PathCache {
    get(key: string): LatLon[] | undefined
    set(key: string, value: LatLon[]): void
}

// --- HELPERS ---

function meters(a: LatLon, b: LatLon): number {
    const cosLat = Math.cos((a[0] * Math.PI) / 180)
    const dy = (a[0] - b[0]) * METERS_PER_DEGREE
    const dx = (a[1] - b[1]) * METERS_PER_DEGREE * cosLat
    return Math.sqrt(dx * dx + dy * dy)
}

function length(path: LatLon[]): number {
    let total = 0
    for (let i = 1; i < path.length; i++) total += meters(path[i - 1] as LatLon, path[i] as LatLon)
    return total
}

/** Closest point to `p` on segment a-b, with its distance in metres. */
function projectOnSegment(p: LatLon, a: LatLon, b: LatLon): { point: LatLon; distance: number } {
    const cosLat = Math.cos((p[0] * Math.PI) / 180)
    const ax = a[1] * cosLat
    const bx = b[1] * cosLat
    const px = p[1] * cosLat
    const dx = bx - ax
    const dy = b[0] - a[0]
    const lengthSquared = dx * dx + dy * dy
    let t = lengthSquared === 0 ? 0 : ((px - ax) * dx + (p[0] - a[0]) * dy) / lengthSquared
    t = Math.max(0, Math.min(1, t))
    const point: LatLon = [a[0] + t * dy, a[1] + t * (b[1] - a[1])]
    return { point, distance: meters(point, p) }
}

// --- SERVICE ---

/**
 * Index of the shape point closest to each stop, never going backwards along the shape. The
 * search for a stop ends once the shape has come close and then clearly moved on, so a line that
 * passes the same place twice (a loop, or out and back) matches the right pass.
 */
export function locateStops(shape: LatLon[], stops: LatLon[]): number[] {
    const result: number[] = []
    let from = 0
    for (const stop of stops) {
        let best = from
        let bestDistance = Infinity
        for (let j = from; j < shape.length; j++) {
            const distance = meters(shape[j] as LatLon, stop)
            if (distance < bestDistance) {
                best = j
                bestDistance = distance
            } else if (bestDistance < 75 && distance > bestDistance + 400) {
                break
            }
        }
        result.push(best)
        from = best
    }
    return result
}

/**
 * Like `locateStops`, but each stop is projected onto the path's segments rather than snapped to
 * its nearest vertex. Simplified paths have long straight segments, and a vertex can lie far
 * before the stop; cutting at the projection makes a ride start and end right at its stops.
 */
export function locateStopsOnPath(path: LatLon[], stops: LatLon[]): PathPosition[] {
    const result: PathPosition[] = []
    let from = 0
    let fromPoint: LatLon | null = null
    for (const stop of stops) {
        let best: PathPosition = { index: from, point: fromPoint ?? (path[from] as LatLon) }
        let bestDistance = Infinity
        for (let i = from; i < path.length - 1; i++) {
            // On the segment where the previous stop was found, never go back past it.
            const start = i === from && fromPoint ? fromPoint : (path[i] as LatLon)
            const { point, distance } = projectOnSegment(stop, start, path[i + 1] as LatLon)
            if (distance < bestDistance) {
                best = { index: i, point }
                bestDistance = distance
            } else if (bestDistance < 75 && distance > bestDistance + 400) {
                break
            }
        }
        if (path.length === 1) best = { index: 0, point: path[0] as LatLon }
        result.push(best)
        from = best.index
        fromPoint = best.point
    }
    return result
}

/** The part of a path between two positions, starting and ending exactly at them. */
export function slicePath(path: LatLon[], from: PathPosition, to: PathPosition): LatLon[] {
    const middle = path.slice(from.index + 1, to.index + 1)
    const result = [from.point, ...middle, to.point]
    return result.filter(
        (point, i) => i === 0 || point[0] !== result[i - 1]?.[0] || point[1] !== result[i - 1]?.[1],
    )
}

/**
 * The line between consecutive stops along the network, guided by the feed's shape where there
 * is one. Falls back to the feed's own piece (or a straight hop) when routing fails or produces
 * an implausible detour.
 */
export function buildLinePath(
    router: RoadRouter,
    mode: RouteMode,
    stops: { id: string; position: LatLon }[],
    shape: LatLon[] | null,
    cache: PathCache,
): LatLon[] {
    const positions = stops.map((stop) => stop.position)
    const at = shape && shape.length >= 2 ? locateStops(shape, positions) : null
    const path: LatLon[] = []

    for (let i = 1; i < stops.length; i++) {
        const a = stops[i - 1] as { id: string; position: LatLon }
        const b = stops[i] as { id: string; position: LatLon }
        const hint = at && shape ? shape.slice(at[i - 1], (at[i] as number) + 1) : null
        const usefulHint = hint && hint.length >= 2 ? hint : null
        const key = `${mode}|${a.id}|${b.id}`

        let piece = cache.get(key)
        if (!piece) {
            // Start and end where the feed's shape passes the stop: that is on the road, the stop pole is not.
            const from = usefulHint ? (usefulHint[0] as LatLon) : a.position
            const to = usefulHint ? (usefulHint[usefulHint.length - 1] as LatLon) : b.position
            const routed = router.route(mode, from, to, usefulHint)
            const direct = meters(a.position, b.position)
            const limit = Math.max(
                direct * 2.5,
                direct + 800,
                usefulHint ? length(usefulHint) * 1.5 : 0,
            )
            piece =
                routed && length(routed) <= limit
                    ? routed
                    : (usefulHint ?? [a.position, b.position])
            cache.set(key, piece)
        }
        for (const point of piece) {
            const last = path[path.length - 1]
            if (!last || last[0] !== point[0] || last[1] !== point[1]) path.push(point)
        }
    }
    return path
}
