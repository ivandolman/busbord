// Board service: departures between two places, a stop's own board, and the walks around them

import type { DatabaseSync } from "node:sqlite"

import { getWalker, type Walker } from "@/features/roads/walking"
import {
    maxWalkMeters as storedMaxWalkMeters,
    walkTieSeconds as storedWalkTieSeconds,
} from "@/features/user-data/user-data.service"
import { config } from "@/lib/config"
import { getDatabase } from "@/lib/db"
import { distanceMeters } from "@/lib/geo"
import { parsePointId, type Point } from "@/lib/place"
import { localServiceDate, shiftServiceDate } from "@/lib/time"

import { getAlertSource, matchAlerts, type AlertSource } from "./alerts"
import { TimetableRepository, type StopDepartureRow } from "./board.repository"
import type { BoardQuery, NextDeparturesQuery, StopBoardQuery, WalkAreaQuery } from "./board.schema"
import type {
    Board,
    Candidate,
    Endpoint,
    Mode,
    StopBoard,
    StopDeparture,
    StopPole,
} from "./board.types"
import {
    LATE_DEPARTURE_GRACE_SECONDS,
    pickBestPairPerTrip,
    rankDepartures,
    STRAIGHT_LINE_DETOUR,
    summarise,
    toDeparture,
    WALK_SECONDS_PER_METER,
} from "./build-board"
import {
    endpointWalkLimit,
    resolveEndpoint,
    splitSharedPlatforms,
    UnknownAreaError,
} from "./endpoint"
import { shortHeadsign } from "./group"
import { getNextDepartures } from "./next-departures"
import { getRealtimeSource, type RealtimeSource } from "./realtime"
import { findTransfers } from "./transfers"

// --- CONSTANTS ---

/** A stop's card offers the platforms of a train station this close (bus station to tracks). */
const STATION_METERS = 500
/** Trains are left out unless asked for: the board is about getting around town. */
const DEFAULT_MODES: ReadonlySet<Mode> = new Set<Mode>(["bus", "tram", "metro"])
const ALL_MODES: ReadonlySet<Mode> = new Set<Mode>([
    "bus",
    "tram",
    "metro",
    "train",
    "ferry",
    "other",
])
/** What the map shows: everything but trains. */
const MAP_MODES: ReadonlySet<Mode> = new Set<Mode>(["bus", "tram", "metro", "ferry"])

const STOP_BOARD_HORIZON_SECONDS = 60 * 60
const STOP_BOARD_LIMIT = 80
const NEXT_DEPARTURES_HORIZON_SECONDS = 90 * 60
const STOP_SEARCH_LIMIT = 8

/** Poles further than this from the origin get no walking time: you would not walk there. */
const MAX_POLE_WALK_METERS = 3000
/** Stops this close together are one pole (the feed often lists a pole once per operator). */
const SAME_POLE_METERS = 15

/** Nobody walks further to a bus; longer requests are refused rather than routed. */
const MAX_WALK_ROUTE_METERS = 4000

// --- INTERFACES ---

export interface BoardRequest {
    originId: string
    destinationId: string
    includeWalking: boolean
    modes: ReadonlySet<Mode>
    now: Date
    /** Pairs this much slower than the quickest still count as quick enough to prefer less walking. */
    walkTieSeconds?: number
    /** Real walking routes; without one, walks are estimated from straight lines. */
    walker?: Walker | null
    /** The longest walk to or from a stop, in metres. */
    maxWalkMeters?: number
    alerts?: AlertSource | null
}

export interface StopBoardRequest {
    stopId: string
    /** Optional: mark the departures that also reach this place. */
    destinationId: string | null
    includeWalking: boolean
    modes: ReadonlySet<Mode>
    now: Date
    horizonSeconds: number
    limit: number
    maxWalkMeters?: number
    /** Optional: where the traveller sets off, to tell them how far each pole is. */
    originId?: string | null
    walker?: Walker | null
}

export interface BoardServiceDependencies {
    /** Looked up on every call: a new import swaps the database file. */
    database: () => DatabaseSync
    realtime: () => RealtimeSource | null
    alerts: () => AlertSource | null
    walker: () => Walker | null
    /** The `maxWalk` query value (minutes) in metres, or the stored setting without one. */
    maxWalkMeters: (param: string | null) => number
    /** The `tie` query value (minutes) in seconds, or the stored setting without one. */
    walkTieSeconds: (param: string | null) => number
    now: () => Date
}

/** The walkable area around an origin or destination, as the map draws it. */
export interface WalkArea {
    center: [number, number]
    radiusMeters: number
    limitMeters: number
    minutes: number
    /** Null without a road network (or off it); the map then draws a circle of `radiusMeters`. */
    polygon: [number, number][] | null
}

// --- ERRORS ---

export class WalkTooLongError extends Error {
    constructor() {
        super(`Walking routes are limited to ${MAX_WALK_ROUTE_METERS} m`)
        this.name = "WalkTooLongError"
    }
}

// --- SERVICE ---

export async function getBoard(
    repository: TimetableRepository,
    realtime: RealtimeSource | null,
    request: BoardRequest,
): Promise<Board> {
    const { board } = config
    const endpoint = {
        walking: request.includeWalking,
        maxWalkMeters: request.maxWalkMeters,
        walker: request.walker,
    }
    const origin = resolveEndpoint(repository, request.originId, { ...endpoint, role: "from" })
    const destination = resolveEndpoint(repository, request.destinationId, {
        ...endpoint,
        role: "to",
    })
    splitSharedPlatforms(origin, destination)
    const originStops = [...origin.walkMeters.keys()]
    const destinationStops = [...destination.walkMeters.keys()]

    const nowSeconds = Math.floor(request.now.getTime() / 1000)
    const from = nowSeconds - LATE_DEPARTURE_GRACE_SECONDS
    const until = nowSeconds + board.horizonSeconds

    // Trips after midnight still belong to yesterday's service day (GTFS times run past 24:00).
    const today = localServiceDate(request.now.getTime())
    const candidates = [shiftServiceDate(today, -1), today].flatMap((serviceDate) =>
        repository.findCandidates(originStops, destinationStops, serviceDate, from, until),
    )
    const trips = pickBestPairPerTrip(
        candidates.filter((candidate) => request.modes.has(candidate.mode)),
        origin.walkMeters,
        destination.walkMeters,
        request.walkTieSeconds,
    )

    const snapshot = realtime ? await realtime.snapshot() : null
    const stopInfo = repository.stopInfo([
        ...new Set(trips.flatMap((trip) => [trip.fromStopId, trip.toStopId])),
    ])

    const departures = rankDepartures(
        trips
            .map((trip) =>
                toDeparture(
                    trip,
                    stopInfo,
                    snapshot?.adjustmentFor(trip) ?? null,
                    origin.walkMeters,
                    destination.walkMeters,
                    nowSeconds,
                ),
            )
            // The grace window pulled in vehicles that really have left; drop those again.
            .filter((departure) => departure.expectedDeparture >= nowSeconds - 30),
    ).slice(0, board.maxDepartures)

    return {
        origin: { ...origin.area, kind: origin.kind },
        destination: { ...destination.area, kind: destination.kind },
        generatedAt: nowSeconds,
        realtime: realtime === null ? "disabled" : snapshot === null ? "unavailable" : "live",
        walkIncluded: request.includeWalking,
        summary: summarise(departures, nowSeconds),
        departures,
        alerts: await boardAlerts(request.alerts ?? null, trips, origin, destination, nowSeconds),
        // Only worth the search when no direct ride is any use.
        transfers: departures.some((departure) => !departure.cancelled && departure.catchable)
            ? []
            : findTransfers(repository, {
                  origin,
                  destination,
                  serviceDates: [shiftServiceDate(today, -1), today],
                  modes: request.modes,
                  fromEpoch: from,
                  untilEpoch: until,
                  nowSeconds,
                  snapshot,
              }),
    }
}

/** Everything leaving one stop soon, every line, as a departure board for the map. */
export async function getStopBoard(
    repository: TimetableRepository,
    realtime: RealtimeSource | null,
    request: StopBoardRequest,
): Promise<StopBoard> {
    const stop = resolveEndpoint(repository, request.stopId, { walking: false, role: "from" })
    const origin =
        request.originId && request.originId !== request.stopId
            ? resolveEndpoint(repository, request.originId, { walking: false, role: "from" })
            : null
    const destination = request.destinationId
        ? resolveEndpoint(repository, request.destinationId, {
              walking: request.includeWalking,
              role: "to",
              maxWalkMeters: request.maxWalkMeters,
              walker: request.walker,
          })
        : null
    if (destination) splitSharedPlatforms(stop, destination)
    const stopIds = [...stop.walkMeters.keys()]

    const nowSeconds = Math.floor(request.now.getTime() / 1000)
    const from = nowSeconds - LATE_DEPARTURE_GRACE_SECONDS
    const until = nowSeconds + request.horizonSeconds
    const today = localServiceDate(request.now.getTime())
    const serviceDates = [shiftServiceDate(today, -1), today]

    const rows = serviceDates
        .flatMap((serviceDate) => repository.departuresFrom(stopIds, serviceDate, from, until))
        .filter((row) => request.modes.has(row.mode))

    const reaching = new Set<string>()
    if (destination) {
        const destinationStops = [...destination.walkMeters.keys()]
        for (const serviceDate of serviceDates) {
            for (const candidate of repository.findCandidates(
                stopIds,
                destinationStops,
                serviceDate,
                from,
                until,
            )) {
                reaching.add(`${candidate.serviceDate}|${candidate.tripId}|${candidate.fromSeq}`)
            }
        }
    }

    const snapshot = realtime ? await realtime.snapshot() : null
    const departures: StopDeparture[] = rows
        .map((row) => {
            const adjustment =
                snapshot?.departureAt(
                    row.tripId,
                    row.serviceDate,
                    row.seq,
                    row.stopId,
                    row.planned,
                ) ?? null
            return {
                tripId: row.tripId,
                line: row.line,
                mode: row.mode,
                headsign: row.headsign,
                platform: row.platform,
                plannedDeparture: row.planned,
                expectedDeparture: row.planned + (adjustment?.delay ?? 0),
                cancelled: adjustment?.cancelled ?? false,
                toDestination: reaching.has(`${row.serviceDate}|${row.tripId}|${row.seq}`),
                poleId: row.stopId,
            }
        })
        .filter((departure) => departure.expectedDeparture >= nowSeconds - 30)
        .sort(
            (a, b) =>
                a.expectedDeparture - b.expectedDeparture ||
                a.line.localeCompare(b.line, "nl", { numeric: true }),
        )
        .slice(0, request.limit)

    const shown = new Set(departures.map((departure) => departure.poleId))
    const { poles, poleOf } = describePoles(
        repository,
        rows.filter((row) => shown.has(row.stopId)),
        stop.area.name,
        origin,
        request.walker ?? null,
    )

    return {
        stop: { id: stop.area.id, name: stop.area.name },
        generatedAt: nowSeconds,
        realtime: realtime === null ? "disabled" : snapshot === null ? "unavailable" : "live",
        destination: destination ? { id: destination.area.id, name: destination.area.name } : null,
        poles,
        departures: departures.map((departure) => ({
            ...departure,
            poleId: poleOf.get(departure.poleId) ?? departure.poleId,
        })),
        station: repository.trainStationNear(stop.area.lat, stop.area.lon, STATION_METERS),
    }
}

/**
 * The board operations behind the API routes, with the timetable, live feeds, walker and the
 * user's settings injected so tests can pass fakes.
 */
export const createBoardService = ({
    database = getDatabase,
    realtime = getRealtimeSource,
    alerts = getAlertSource,
    walker = getWalker,
    maxWalkMeters = storedMaxWalkMeters,
    walkTieSeconds = storedWalkTieSeconds,
    now = () => new Date(),
}: Partial<BoardServiceDependencies> = {}) => {
    const repository = () => new TimetableRepository(database())

    return {
        getBoard: (query: BoardQuery) =>
            getBoard(repository(), realtime(), {
                originId: query.from,
                destinationId: query.to,
                includeWalking: query.walk,
                modes: query.trains ? ALL_MODES : DEFAULT_MODES,
                now: now(),
                walkTieSeconds: walkTieSeconds(query.tie ?? null),
                walker: walker(),
                maxWalkMeters: maxWalkMeters(query.maxWalk ?? null),
                alerts: alerts(),
            }),

        /**
         * Next hour of departures from one stop, every line; `to` marks the ones that reach a
         * destination, `from` adds the walk from there to each of the stop's poles.
         */
        getStopBoard: (query: StopBoardQuery) =>
            getStopBoard(repository(), realtime(), {
                stopId: query.stop,
                destinationId: query.to === undefined || query.to === query.stop ? null : query.to,
                includeWalking: query.walk,
                modes: MAP_MODES,
                now: now(),
                horizonSeconds: STOP_BOARD_HORIZON_SECONDS,
                limit: STOP_BOARD_LIMIT,
                originId: query.from ?? null,
                walker: walker(),
                maxWalkMeters: maxWalkMeters(query.maxWalk ?? null),
            }),

        /** Per stop area, the next ride of each line towards `to`. */
        getNextDepartures: (query: NextDeparturesQuery) =>
            getNextDepartures(repository(), realtime(), {
                areaIds: query.areas,
                destinationId: query.to,
                includeWalking: query.walk,
                modes: MAP_MODES,
                now: now(),
                horizonSeconds: NEXT_DEPARTURES_HORIZON_SECONDS,
                walker: walker(),
                maxWalkMeters: maxWalkMeters(query.maxWalk ?? null),
            }),

        /** Display name for a stop area or map point, for selections restored from the URL. */
        getPlace(id: string): { id: string; name: string } {
            const { area } = resolveEndpoint(repository(), id, { walking: false, role: "from" })
            return { id, name: area.name }
        },

        searchStops(query: string): { id: string; name: string }[] {
            return repository()
                .searchAreas(query, STOP_SEARCH_LIMIT, config.board.sameStopMeters)
                .map(({ id, name }) => ({ id, name }))
        },

        /**
         * The area within walking distance of an origin or destination, the same limit the board
         * uses to pick stops.
         */
        getWalkArea(query: WalkAreaQuery): WalkArea {
            const point = parsePointId(query.id)
            let center: [number, number]
            if (point) {
                center = [point.lat, point.lon]
            } else {
                const area = repository().getArea(query.id)
                if (!area) throw new UnknownAreaError(query.id)
                center = [area.lat, area.lon]
            }
            const limitMeters = endpointWalkLimit(query.id, {
                walking: query.walk,
                role: query.role,
                maxWalkMeters: maxWalkMeters(query.maxWalk ?? null),
            })
            const polygon = limitMeters > 0 ? (walker()?.area(center, limitMeters) ?? null) : null
            return {
                center,
                radiusMeters: Math.round(limitMeters / STRAIGHT_LINE_DETOUR),
                limitMeters,
                minutes: Math.round((limitMeters * WALK_SECONDS_PER_METER) / 60),
                polygon: polygon?.map(roundPosition) ?? null,
            }
        },

        /**
         * The walking route between two points along streets and footpaths. `path` is null without a
         * road network or when either end is off it; the map then draws a straight dashed line.
         */
        getWalkRoute(from: Point, to: Point): { path: [number, number][] | null } {
            if (distanceMeters(from.lat, from.lon, to.lat, to.lon) > MAX_WALK_ROUTE_METERS) {
                throw new WalkTooLongError()
            }
            const path = walker()?.route([from.lat, from.lon], [to.lat, to.lon]) ?? null
            return { path: path?.map(roundPosition) ?? null }
        },
    }
}

export const boardService = createBoardService()

// --- HELPERS ---

/** Alerts about the lines on this board, or about the stops where you get on and off. */
async function boardAlerts(
    source: AlertSource | null,
    trips: Candidate[],
    origin: Endpoint,
    destination: Endpoint,
    nowSeconds: number,
): Promise<Board["alerts"]> {
    const alerts = source ? await source.alerts() : null
    if (!alerts) return []
    const routeIds = new Set(trips.map((trip) => trip.routeId))
    const stopIds = new Set([...origin.walkMeters.keys(), ...destination.walkMeters.keys()])
    return matchAlerts(alerts, routeIds, stopIds, nowSeconds)
}

/**
 * The poles of a stop that have departures, each with a label, the direction its buses go and,
 * with an origin, the walk to it. Labels are the feed's platform codes when every pole has its
 * own; otherwise A, B, C… in a fixed order. Also returns, for every stop id, the pole it belongs to.
 */
function describePoles(
    repository: TimetableRepository,
    rows: StopDepartureRow[],
    stopName: string,
    origin: Endpoint | null,
    walker: Walker | null,
): { poles: StopPole[]; poleOf: Map<string, string> } {
    const allIds = [...new Set(rows.map((row) => row.stopId))].sort()
    const positions = repository.stopPositions(allIds)
    // Merge stops on the same spot into the first of them.
    const poleOf = new Map<string, string>()
    const ids: string[] = []
    for (const id of allIds) {
        const [lat, lon] = positions.get(id) ?? [0, 0]
        const same = ids.find((other) => {
            const [oLat, oLon] = positions.get(other) ?? [0, 0]
            return distanceMeters(lat, lon, oLat, oLon) <= SAME_POLE_METERS
        })
        poleOf.set(id, same ?? id)
        if (!same) ids.push(id)
    }
    const info = repository.stopInfo(ids)
    const platforms = ids.map((id) => info.get(id)?.platform ?? "")
    const usePlatforms = platforms.every(Boolean) && new Set(platforms).size === platforms.length

    const walks = new Map<string, number>()
    if (origin) {
        const from: [number, number] = [origin.area.lat, origin.area.lon]
        const away = ids.filter((id) => origin.walkMeters.get(id) !== 0)
        const routed = walker
            ? walker.distances(
                  from,
                  away.map((id) => positions.get(id) ?? from),
                  MAX_POLE_WALK_METERS,
              )
            : []
        away.forEach((id, i) => {
            const [lat, lon] = positions.get(id) ?? from
            const line = distanceMeters(from[0], from[1], lat, lon)
            const meters =
                routed[i] != null
                    ? Math.max(routed[i] as number, line)
                    : line * STRAIGHT_LINE_DETOUR
            if (meters <= MAX_POLE_WALK_METERS) walks.set(id, Math.round(meters))
        })
        for (const id of allIds)
            if (origin.walkMeters.get(id) === 0) walks.set(poleOf.get(id) ?? id, 0)
    }

    const poles = ids.map((id, i) => {
        const counts = new Map<string, number>()
        for (const row of rows) {
            if (poleOf.get(row.stopId) === id && row.nextStop)
                counts.set(row.nextStop, (counts.get(row.nextStop) ?? 0) + 1)
        }
        const towards = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
        const [lat, lon] = positions.get(id) ?? [0, 0]
        const walk = walks.get(id)
        return {
            id,
            label: usePlatforms ? (platforms[i] as string) : String.fromCharCode(65 + (i % 26)),
            lat,
            lon,
            towards: towards ? shortHeadsign(towards, stopName) : null,
            walkMeters: walk ?? null,
            walkSeconds: walk === undefined ? null : Math.round(walk * WALK_SECONDS_PER_METER),
        }
    })
    poles.sort((a, b) => a.label.localeCompare(b.label, "nl", { numeric: true }))
    return { poles, poleOf }
}

/** Five decimals: about a metre, and a much smaller response. */
function roundPosition([lat, lon]: [number, number]): [number, number] {
    return [Math.round(lat * 1e5) / 1e5, Math.round(lon * 1e5) / 1e5]
}
