// Network service: every line and stop for the map, and what is reachable from the current selection

import { createHash } from "node:crypto"
import type { DatabaseSync } from "node:sqlite"

import { TimetableRepository } from "@/features/board/board.repository"
import type { Mode } from "@/features/board/board.types"
import { modeFromRouteType } from "@/features/board/build-board"
import { stopNameKey } from "@/features/board/stop-name"
import { getWalker, type Walker } from "@/features/roads/walking"
import {
    maxWalkMeters as storedMaxWalkMeters,
    walkTieSeconds as storedWalkTieSeconds,
} from "@/features/user-data/user-data.service"
import { config } from "@/lib/config"
import { getDatabase } from "@/lib/db"
import { distanceMeters } from "@/lib/geo"

import { buildCorridors, compareDrawingOrder, type Corridor } from "./corridors"
import type { ReachableQuery } from "./network.schema"
import { runningNightLines } from "./night-lines"
import { loadPatterns } from "./patterns"
import { getReachable } from "./reachable"

// --- CONSTANTS ---

/** Modes drawn on the map; trains are left out, as on the board. */
const MAP_MODES: ReadonlySet<Mode> = new Set<Mode>(["bus", "tram", "metro", "ferry"])

/** Built once per database handle; a new import swaps the handle and drops the entry with it. */
const networkJsonCache = new WeakMap<DatabaseSync, { json: string; etag: string }>()

/** Running night lines per database handle, worked out at most once a minute. */
const nightLinesCache = new WeakMap<DatabaseSync, { minute: number; routes: string[] }>()

// --- INTERFACES ---

export type LatLon = [lat: number, lon: number]

export interface NetworkLine {
    id: string
    line: string
    name: string
    mode: Mode
    /** "#rrggbb" from the feed, or null to colour by mode. */
    color: string | null
    /** Trips in the feed, all patterns together: how busy the line is, for the line widths. */
    trips: number
}

/**
 * One stop as a traveller sees it: every stop area with this name close together (bus and tram
 * side, one per operator) drawn as one dot. `id` is the busiest of them.
 */
export interface NetworkStop {
    id: string
    /** Every stop area in this stop, `id` first. */
    areaIds: string[]
    name: string
    lat: number
    lon: number
    /** Indexes into `lines`. */
    lines: number[]
}

export interface Network {
    /** True when paths follow the road (shapes.txt); false when they connect stops in a straight line. */
    shaped: boolean
    lines: NetworkLine[]
    /** Every road a line runs along, once, with the lines on it; see corridors.ts. */
    corridors: Corridor[]
    stops: NetworkStop[]
}

export interface NetworkServiceDependencies {
    /** Looked up on every call: a new import swaps the database file. */
    database: () => DatabaseSync
    walker: () => Walker | null
    /** The `maxWalk` query value (minutes) in metres, or the stored setting without one. */
    maxWalkMeters: (param: string | null) => number
    /** The `tie` query value (minutes) in seconds, or the stored setting without one. */
    walkTieSeconds: (param: string | null) => number
    now: () => Date
}

// --- SERVICE ---

export function buildNetwork(db: DatabaseSync): Network {
    const routes = db
        .prepare("SELECT route_id AS id, short_name AS line, long_name AS name, type FROM routes")
        .all() as unknown as {
        id: string
        line: string
        name: string
        type: number
    }[]
    const stops = new Map(
        (
            db
                .prepare("SELECT stop_id AS id, area_id AS areaId, lat, lon FROM stops")
                .all() as unknown as {
                id: string
                areaId: string
                lat: number
                lon: number
            }[]
        ).map((stop) => [stop.id, stop]),
    )

    const lines: NetworkLine[] = []
    const lineIndex = new Map<string, number>()
    for (const route of routes) {
        const mode = modeFromRouteType(route.type)
        if (!MAP_MODES.has(mode)) continue
        lineIndex.set(route.id, lines.length)
        lines.push({
            id: route.id,
            line: route.line,
            name: route.name,
            mode,
            color: null,
            trips: 0,
        })
    }

    const linesOfArea = new Map<string, Set<number>>()
    const pathsOfLine = new Map<number, LatLon[][]>()
    let shaped = false
    for (const pattern of loadPatterns(db)) {
        const index = lineIndex.get(pattern.routeId)
        const line = index === undefined ? undefined : lines[index]
        if (index === undefined || !line) continue
        if (pattern.color) line.color = pattern.color
        line.trips += pattern.trips

        const coordinates: LatLon[] = []
        for (const stopId of pattern.stopIds) {
            const stop = stops.get(stopId)
            if (!stop) continue
            coordinates.push([stop.lat, stop.lon])
            const set = linesOfArea.get(stop.areaId) ?? new Set<number>()
            set.add(index)
            linesOfArea.set(stop.areaId, set)
        }
        const paths = pathsOfLine.get(index) ?? []
        pathsOfLine.set(index, paths)
        if (pattern.path && pattern.path.length >= 2) {
            shaped = true
            paths.push(pattern.path)
        } else if (coordinates.length >= 2) {
            paths.push(coordinates)
        }
    }

    const areas = db
        .prepare(
            "SELECT area_id AS id, name, lat, lon FROM areas WHERE departures > 0 ORDER BY departures DESC, area_id",
        )
        .all() as unknown as { id: string; name: string; lat: number; lon: number }[]
    // Busiest first, so each group is named after (and centred on) its main area.
    const groups: {
        first: (typeof areas)[number]
        members: (typeof areas)[number][]
        lines: Set<number>
    }[] = []
    const groupsByName = new Map<string, typeof groups>()
    for (const area of areas) {
        const served = linesOfArea.get(area.id)
        if (!served) continue
        const nameKey = stopNameKey(area.name)
        const sameName = groupsByName.get(nameKey) ?? []
        let group = sameName.find(
            (candidate) =>
                distanceMeters(candidate.first.lat, candidate.first.lon, area.lat, area.lon) <=
                config.board.sameStopMeters,
        )
        if (!group) {
            group = { first: area, members: [], lines: new Set() }
            groups.push(group)
            sameName.push(group)
            groupsByName.set(nameKey, sameName)
        }
        group.members.push(area)
        for (const index of served) group.lines.add(index)
    }
    const networkStops: NetworkStop[] = groups.map(({ first, members, lines: served }) => {
        const lat = members.reduce((sum, member) => sum + member.lat, 0) / members.length
        const lon = members.reduce((sum, member) => sum + member.lon, 0) / members.length
        return {
            id: first.id,
            areaIds: members.map((member) => member.id),
            name: first.name,
            lat: Math.round(lat * 1e5) / 1e5,
            lon: Math.round(lon * 1e5) / 1e5,
            lines: [...served].sort((a, b) => a - b),
        }
    })

    const drawingOrder = [...pathsOfLine.keys()].sort((a, b) =>
        compareDrawingOrder(lines[a] as NetworkLine, lines[b] as NetworkLine),
    )
    const corridors = buildCorridors(
        drawingOrder.map((index) => ({ index, paths: pathsOfLine.get(index) ?? [] })),
    )

    // Lines stay in place even without a path: stops refer to them by index.
    return { shaped, lines, corridors, stops: networkStops }
}

export const createNetworkService = ({
    database = getDatabase,
    walker = getWalker,
    maxWalkMeters = storedMaxWalkMeters,
    walkTieSeconds = storedWalkTieSeconds,
    now = () => new Date(),
}: Partial<NetworkServiceDependencies> = {}) => ({
    /**
     * The whole network as JSON with an ETag (a hash of the payload). It changes only with a new
     * import, so it is built once per database handle.
     */
    getNetworkJson(): { json: string; etag: string } {
        const db = database()
        let entry = networkJsonCache.get(db)
        if (entry === undefined) {
            const json = JSON.stringify(buildNetwork(db))
            entry = { json, etag: `"${createHash("sha1").update(json).digest("base64url")}"` }
            networkJsonCache.set(db, entry)
        }
        return entry
    },

    /** Route ids of the night lines under way now or leaving within the hour. */
    getRunningNightLines(): { routes: string[] } {
        const db = database()
        const nowMs = now().getTime()
        const minute = Math.floor(nowMs / 60_000)
        let entry = nightLinesCache.get(db)
        if (entry?.minute !== minute) {
            entry = { minute, routes: runningNightLines(new TimetableRepository(db), nowMs) }
            nightLinesCache.set(db, entry)
        }
        return { routes: entry.routes }
    },

    getReachable(query: ReachableQuery) {
        const db = database()
        return getReachable(new TimetableRepository(db), db, {
            originId: query.from ?? null,
            destinationId: query.to ?? null,
            includeWalking: query.walk,
            walker: walker(),
            maxWalkMeters: maxWalkMeters(query.maxWalk ?? null),
            walkTieSeconds: walkTieSeconds(query.tie ?? null),
            now: now(),
        })
    },
})

export const networkService = createNetworkService()
