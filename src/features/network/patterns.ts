// Line stopping patterns (computed or as stored by the importer) and shape simplification

import type { DatabaseSync } from "node:sqlite"

import type { LatLon } from "./network.service"

// --- CONSTANTS ---

const METERS_PER_DEGREE = 111_320

/**
 * A stretch of path counts as a detour when it is more than DETOUR_RATIO times as long as the
 * straight line across, plus DETOUR_SLACK_METERS, and no longer than DETOUR_WINDOW_METERS. Corners
 * and bends stay well below; a loop around a block where routing missed a turn does not.
 */
const DETOUR_RATIO = 2
const DETOUR_SLACK_METERS = 50
const DETOUR_WINDOW_METERS = 400
/** Path points this close to one of the line's stops are never cut: the bus goes there to stop. */
const STOP_GUARD_METERS = 40

// --- INTERFACES ---

/** One distinct stopping pattern of a route, with a trip that runs it (to look up its shape). */
export interface LinePattern {
    routeId: string
    tripId: string
    trips: number
    stopIds: string[]
}

export interface PatternRow {
    routeId: string
    /** Trips in the feed that run this pattern. */
    trips: number
    stopIds: string[]
    path: LatLon[] | null
    color: string | null
}

// --- SERVICE ---

/**
 * Distinct stopping patterns per route, enough to draw every route once. A pattern whose stops
 * are all covered by longer patterns of the same route (short runs, the opposite direction) is
 * dropped. One ordered pass over stop_times: about two seconds on the Utrecht region.
 */
export function computeLinePatterns(db: DatabaseSync): LinePattern[] {
    const rows = db
        .prepare(
            `SELECT st.trip_id AS tripId, st.stop_id AS stopId, t.route_id AS routeId
         FROM stop_times st JOIN trips t ON t.trip_id = st.trip_id
        ORDER BY st.trip_id, st.seq`,
        )
        .iterate() as Iterable<{ tripId: string; stopId: string; routeId: string }>

    const bySignature = new Map<string, LinePattern>()
    type Trip = { tripId: string; routeId: string; stopIds: string[] }
    let current = null as Trip | null
    const flush = () => {
        if (!current || current.stopIds.length < 2) return
        const signature = `${current.routeId}\u0001${current.stopIds.join("\u0002")}`
        const pattern = bySignature.get(signature)
        if (pattern) pattern.trips++
        else
            bySignature.set(signature, {
                routeId: current.routeId,
                tripId: current.tripId,
                trips: 1,
                stopIds: current.stopIds,
            })
    }
    for (const row of rows) {
        if (current?.tripId !== row.tripId) {
            flush()
            current = { tripId: row.tripId, routeId: row.routeId, stopIds: [] }
        }
        current.stopIds.push(row.stopId)
    }
    flush()

    const byRoute = new Map<string, LinePattern[]>()
    for (const pattern of bySignature.values()) {
        const list = byRoute.get(pattern.routeId) ?? []
        list.push(pattern)
        byRoute.set(pattern.routeId, list)
    }

    const kept: LinePattern[] = []
    for (const patterns of byRoute.values()) {
        patterns.sort((a, b) => b.stopIds.length - a.stopIds.length || b.trips - a.trips)
        const covered = new Set<string>()
        for (const pattern of patterns) {
            if (pattern.stopIds.every((stopId) => covered.has(stopId))) continue
            for (const stopId of pattern.stopIds) covered.add(stopId)
            kept.push(pattern)
        }
    }
    return kept
}

/** Patterns stored by the importer, or (for a database imported before they existed) computed now. */
export function loadPatterns(db: DatabaseSync): PatternRow[] {
    if (hasTable(db, "line_patterns")) {
        const rows = db
            .prepare(
                "SELECT route_id AS routeId, trips, stop_ids AS stopIds, path, color FROM line_patterns",
            )
            .all() as unknown as {
            routeId: string
            trips: number
            stopIds: string
            path: string
            color: string
        }[]
        const stops = stopPositions(db)
        return rows.map((row) => {
            const stopIds = JSON.parse(row.stopIds) as string[]
            const path = row.path ? (JSON.parse(row.path) as LatLon[]) : null
            const guarded = stopIds.flatMap((id) => {
                const position = stops.get(id)
                return position ? [position] : []
            })
            return {
                routeId: row.routeId,
                trips: row.trips,
                stopIds,
                path: path ? cutDetours(path, guarded) : null,
                color: /^#[0-9a-f]{6}$/i.test(row.color) ? row.color : null,
            }
        })
    }
    return computeLinePatterns(db).map((pattern) => ({
        routeId: pattern.routeId,
        trips: pattern.trips,
        stopIds: pattern.stopIds,
        path: null,
        color: null,
    }))
}

/** Douglas-Peucker, iterative so long shapes cannot overflow the stack. Rounds to ~1 m. */
export function simplifyPath(points: LatLon[], toleranceMeters: number): LatLon[] {
    if (points.length <= 2) return points.map(roundPoint)
    const cosLat = Math.cos(((points[0]?.[0] ?? 52) * Math.PI) / 180)
    const keep = new Uint8Array(points.length)
    keep[0] = 1
    keep[points.length - 1] = 1
    const stack: [number, number][] = [[0, points.length - 1]]
    const tolerance = toleranceMeters * toleranceMeters
    while (stack.length > 0) {
        const [first, last] = stack.pop() as [number, number]
        let worst = -1
        let worstDistance = tolerance
        for (let i = first + 1; i < last; i++) {
            const distance = squaredSegmentDistance(
                points[i] as LatLon,
                points[first] as LatLon,
                points[last] as LatLon,
                cosLat,
            )
            if (distance > worstDistance) {
                worst = i
                worstDistance = distance
            }
        }
        if (worst >= 0) {
            keep[worst] = 1
            stack.push([first, worst], [worst, last])
        }
    }
    return points.filter((_, index) => keep[index] === 1).map(roundPoint)
}

/**
 * Takes short loops out of a path: where it wanders off and comes back close to where it was
 * (routing that missed a turn and circles a block), the path goes straight across instead. On
 * the map such loops show as dead-end stubs and triangles. Points near `stops` are kept.
 */
export function cutDetours(path: LatLon[], stops: LatLon[]): LatLon[] {
    if (path.length < 3) return path
    const cosLat = Math.cos(((path[0] as LatLon)[0] * Math.PI) / 180)
    const distance = (a: LatLon, b: LatLon) => Math.sqrt(squaredDistance(a, b, cosLat))
    const along = [0]
    for (let i = 1; i < path.length; i++)
        along.push((along[i - 1] as number) + distance(path[i - 1] as LatLon, path[i] as LatLon))
    const guard = STOP_GUARD_METERS * STOP_GUARD_METERS
    const pinned = path.map((point) =>
        stops.some((stop) => squaredDistance(point, stop, cosLat) <= guard),
    )

    const result: LatLon[] = []
    let i = 0
    while (i < path.length) {
        result.push(path[i] as LatLon)
        let cutTo = -1
        for (let j = i + 2; j < path.length; j++) {
            const travelled = (along[j] as number) - (along[i] as number)
            if (travelled > DETOUR_WINDOW_METERS) break
            if (pinned[j - 1]) break
            const across = distance(path[i] as LatLon, path[j] as LatLon)
            if (travelled > across * DETOUR_RATIO + DETOUR_SLACK_METERS) cutTo = j
        }
        i = cutTo > 0 ? cutTo : i + 1
    }
    return result
}

/**
 * Cuts a full trip shape down to the part between the first and last stop we kept, since trips
 * that leave the region carry their whole route along.
 */
export function clipShape(shape: LatLon[], first: LatLon, last: LatLon): LatLon[] {
    if (shape.length < 2) return shape
    const cosLat = Math.cos((first[0] * Math.PI) / 180)
    const nearest = (target: LatLon, from: number) => {
        let best = from
        let bestDistance = Infinity
        for (let i = from; i < shape.length; i++) {
            const distance = squaredDistance(shape[i] as LatLon, target, cosLat)
            if (distance < bestDistance) {
                best = i
                bestDistance = distance
            }
        }
        return best
    }
    const start = nearest(first, 0)
    const end = nearest(last, start)
    return end > start ? shape.slice(start, end + 1) : shape
}

// --- HELPERS ---

function hasTable(db: DatabaseSync, name: string): boolean {
    return (
        db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !==
        undefined
    )
}

function stopPositions(db: DatabaseSync): Map<string, LatLon> {
    const rows = db.prepare("SELECT stop_id AS id, lat, lon FROM stops").all() as unknown as {
        id: string
        lat: number
        lon: number
    }[]
    return new Map(rows.map((row) => [row.id, [row.lat, row.lon]]))
}

function squaredDistance(a: LatLon, b: LatLon, cosLat: number): number {
    const dy = (a[0] - b[0]) * METERS_PER_DEGREE
    const dx = (a[1] - b[1]) * METERS_PER_DEGREE * cosLat
    return dx * dx + dy * dy
}

/** Squared distance in metres from p to segment a-b, on a local flat projection. */
function squaredSegmentDistance(p: LatLon, a: LatLon, b: LatLon, cosLat: number): number {
    const ax = a[1] * cosLat
    const bx = b[1] * cosLat
    const px = p[1] * cosLat
    const dx = bx - ax
    const dy = b[0] - a[0]
    const lengthSquared = dx * dx + dy * dy
    let t = lengthSquared === 0 ? 0 : ((px - ax) * dx + (p[0] - a[0]) * dy) / lengthSquared
    t = Math.max(0, Math.min(1, t))
    const ex = (px - (ax + t * dx)) * METERS_PER_DEGREE
    const ey = (p[0] - (a[0] + t * dy)) * METERS_PER_DEGREE
    return ex * ex + ey * ey
}

function roundPoint([lat, lon]: LatLon): LatLon {
    return [Math.round(lat * 1e5) / 1e5, Math.round(lon * 1e5) / 1e5]
}
