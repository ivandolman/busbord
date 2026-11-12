// What the map highlights for the current selection: the lines and stops you can ride today

import type { DatabaseSync } from "node:sqlite"

import type { TimetableRepository } from "@/features/board/board.repository"
import {
    modeFromRouteType,
    pickBestPairPerTrip,
    worthwhileRides,
} from "@/features/board/build-board"
import { resolveEndpoint, splitSharedPlatforms } from "@/features/board/endpoint"
import type { Walker } from "@/features/roads/walking"
import { localServiceDate, serviceDayStart } from "@/lib/time"

import type { LatLon } from "./network.service"
import { rideSegments, type RideSegment } from "./segments"

// --- CONSTANTS ---

/** Today's service day runs past midnight (GTFS times go beyond 24:00). */
const SERVICE_DAY_SECONDS = 36 * 3600

// --- INTERFACES ---

export interface ReachableRequest {
    originId: string | null
    destinationId: string | null
    includeWalking: boolean
    walker: Walker | null
    maxWalkMeters: number
    walkTieSeconds: number
    now: Date
}

export type Reachable =
    | {
          direction: "both"
          areas: string[]
          routes: string[]
          segments: { routeId: string; path: LatLon[] }[]
          /** Where to draw each stop area: in the middle of the platforms actually used. */
          positions: Record<string, LatLon>
          boardAreas: string[]
      }
    | {
          direction: "from" | "to"
          areas: string[]
          routes: string[]
          segments: null
          /** Where you can get on: the origin's stops; with only a destination, any stop (null). */
          boardAreas: string[] | null
      }

// --- SERVICE ---

/**
 * What the map should show for the current selection, for today and without changing:
 * - only an origin: routes leaving it and the stops they reach;
 * - only a destination: routes arriving there and the stops you can board them;
 * - both: only the stretch of each line you would ride, from where you board to where you get off
 *   (chosen per trip exactly as on the board, leaving out stretches far slower than the quickest),
 *   and the stops along those stretches.
 */
export function getReachable(
    repository: TimetableRepository,
    db: DatabaseSync,
    request: ReachableRequest,
): Reachable {
    const today = localServiceDate(request.now.getTime())
    const endpoint = {
        walking: request.includeWalking,
        walker: request.walker,
        maxWalkMeters: request.maxWalkMeters,
    }
    const origin = request.originId
        ? resolveEndpoint(repository, request.originId, { ...endpoint, role: "from" })
        : null
    const destination = request.destinationId
        ? resolveEndpoint(repository, request.destinationId, { ...endpoint, role: "to" })
        : null

    if (origin && destination) {
        splitSharedPlatforms(origin, destination)
        const dayStart = serviceDayStart(today)
        const candidates = repository
            .findCandidates(
                [...origin.walkMeters.keys()],
                [...destination.walkMeters.keys()],
                today,
                dayStart,
                dayStart + SERVICE_DAY_SECONDS,
            )
            .filter((candidate) => candidate.mode !== "train")
        const trips = pickBestPairPerTrip(
            candidates,
            origin.walkMeters,
            destination.walkMeters,
            request.walkTieSeconds,
        )
        // Only stretches you would sensibly ride, not a ring line the long way round.
        const pairs = worthwhileRides(trips, origin.walkMeters, destination.walkMeters).map(
            ({ routeId, fromStopId, toStopId }) => ({ routeId, fromStopId, toStopId }),
        )
        const segments = rideSegments(db, pairs)
        return {
            direction: "both",
            areas: [...new Set(segments.flatMap((segment) => segment.areaIds))],
            routes: [...new Set(segments.map((segment) => segment.routeId))],
            segments: segments.map(({ routeId, path }) => ({ routeId, path })),
            positions: platformPositions(segments),
            boardAreas: repository.areasOfStops([...origin.walkMeters.keys()]),
        }
    }

    const rows = origin
        ? repository.reachableFrom([...origin.walkMeters.keys()], today)
        : repository.reachingTo([...(destination?.walkMeters.keys() ?? [])], today)
    const areas = new Set<string>()
    const routes = new Set<string>()
    for (const row of rows) {
        if (modeFromRouteType(row.routeType) === "train") continue
        areas.add(row.areaId)
        routes.add(row.routeId)
    }
    return {
        direction: origin ? "from" : "to",
        areas: [...areas],
        routes: [...routes],
        segments: null,
        boardAreas: origin ? repository.areasOfStops([...origin.walkMeters.keys()]) : null,
    }
}

// --- HELPERS ---

/**
 * Where to draw each stop area for a planned route: in the middle of the platforms actually used.
 * An area's own position averages all its platforms, which can lie well beside the line's end.
 */
function platformPositions(segments: RideSegment[]): Record<string, LatLon> {
    const sums = new Map<string, { lat: number; lon: number; count: number; seen: Set<string> }>()
    for (const segment of segments) {
        for (const stop of segment.stops) {
            const sum = sums.get(stop.areaId) ?? {
                lat: 0,
                lon: 0,
                count: 0,
                seen: new Set<string>(),
            }
            const key = stop.position.join(",")
            if (!sum.seen.has(key)) {
                sum.seen.add(key)
                sum.lat += stop.position[0]
                sum.lon += stop.position[1]
                sum.count += 1
            }
            sums.set(stop.areaId, sum)
        }
    }
    const round = (value: number) => Math.round(value * 1e5) / 1e5
    return Object.fromEntries(
        [...sums].map(([areaId, sum]) => [
            areaId,
            [round(sum.lat / sum.count), round(sum.lon / sum.count)],
        ]),
    )
}
