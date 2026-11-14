// Trips with one change, for when no direct ride is any use

import { distanceMeters } from "@/lib/geo"

import type { TimetableRepository } from "./board.repository"
import type {
    Area,
    Candidate,
    Endpoint,
    Mode,
    StopInfo,
    Transfer,
    TransferLeg,
} from "./board.types"
import { STRAIGHT_LINE_DETOUR, walkSeconds } from "./build-board"
import type { RealtimeSnapshot } from "./realtime"
import { stopNameKey } from "./stop-name"

// --- CONSTANTS ---

/** Time to get off one bus and onto another at the same stop. */
const MIN_CHANGE_SECONDS = 2 * 60
/** Same-named stops this close count as one place to change (other side of the street). */
const CHANGE_AREA_METERS = 200
/** How many places to change are tried, nearest to the straight line from origin to destination. */
const MAX_CHANGE_PLACES = 30
/** The second ride may leave up to this long after the board's horizon. */
const SECOND_LEG_EXTRA_SECONDS = 60 * 60
const MAX_RESULTS = 4
/** Longest wait at the change that is still considered. */
const MAX_CHANGE_WAIT_SECONDS = 30 * 60

// --- INTERFACES ---

interface ChangePlace {
    /** Area where the first ride ends. */
    arrive: Area
    /** Area where the second ride starts: the same, or a same-named one across the street. */
    depart: Area
    walkSeconds: number
}

export interface TransferRequest {
    origin: Endpoint
    destination: Endpoint
    serviceDates: string[]
    modes: ReadonlySet<Mode>
    fromEpoch: number
    untilEpoch: number
    nowSeconds: number
    snapshot: RealtimeSnapshot | null
    /** Walking pace in seconds per metre. */
    pace: number
}

// --- SERVICE ---

/**
 * Trips with one change, for when no direct ride helps. For every place to change, every first
 * ride from the origin there is joined to the first second ride you can still catch (with a
 * couple of minutes to change, plus the walk across the street). Only journeys that nothing
 * beats on both leaving later and arriving earlier are kept, soonest first.
 */
export function findTransfers(
    repository: TimetableRepository,
    request: TransferRequest,
): Transfer[] {
    const journeys: Transfer[] = []
    for (const serviceDate of request.serviceDates) {
        const places = changePlaces(repository, request, serviceDate)
        if (places.length === 0) continue

        const arriveStops = new Map<string, string>()
        const departStops = new Map<string, string>()
        for (const place of places) {
            for (const id of repository.stopIdsInAreas([place.arrive.id]))
                arriveStops.set(id, place.arrive.id)
            for (const id of repository.stopIdsInAreas([place.depart.id]))
                departStops.set(id, place.depart.id)
        }
        const firsts = repository
            .findCandidates(
                [...request.origin.walkMeters.keys()],
                [...arriveStops.keys()],
                serviceDate,
                request.fromEpoch,
                request.untilEpoch,
            )
            .filter((c) => request.modes.has(c.mode))
        const seconds = repository
            .findCandidates(
                [...departStops.keys()],
                [...request.destination.walkMeters.keys()],
                serviceDate,
                request.fromEpoch,
                request.untilEpoch + SECOND_LEG_EXTRA_SECONDS,
            )
            .filter((c) => request.modes.has(c.mode))
        if (firsts.length === 0 || seconds.length === 0) continue

        const stops = repository.stopInfo([
            ...new Set([...firsts, ...seconds].flatMap((c) => [c.fromStopId, c.toStopId])),
        ])
        const secondLegs = seconds
            .map((candidate) => ({ candidate, leg: leg(candidate, stops, request.snapshot) }))
            .filter(
                (entry): entry is { candidate: Candidate; leg: TransferLeg } => entry.leg !== null,
            )
            .sort((a, b) => a.leg.expectedDeparture - b.leg.expectedDeparture)

        for (const first of firsts) {
            const one = leg(first, stops, request.snapshot)
            if (!one) continue
            const walkTo = walkSeconds(
                request.origin.walkMeters.get(first.fromStopId) ?? 0,
                request.pace,
            )
            const leaveAt = one.expectedDeparture - walkTo
            if (leaveAt < request.nowSeconds - 30) continue
            const arriveArea = arriveStops.get(first.toStopId)
            let best: Transfer | null = null
            for (const place of places) {
                if (place.arrive.id !== arriveArea) continue
                const ready = one.expectedArrival + MIN_CHANGE_SECONDS + place.walkSeconds
                for (const { candidate, leg: two } of secondLegs) {
                    if (two.expectedDeparture < ready) continue
                    // Sorted by departure: waiting longer than this for a faster line is never the answer.
                    if (two.expectedDeparture > ready + MAX_CHANGE_WAIT_SECONDS) break
                    if (departStops.get(candidate.fromStopId) !== place.depart.id) continue
                    // The same vehicle going on is a direct ride, not a change.
                    if (candidate.tripId === first.tripId || candidate.routeId === first.routeId)
                        continue
                    const walkFrom = walkSeconds(
                        request.destination.walkMeters.get(candidate.toStopId) ?? 0,
                        request.pace,
                    )
                    const doorArrival = two.expectedArrival + walkFrom
                    if (!best || doorArrival < best.doorArrival) {
                        best = {
                            first: one,
                            second: two,
                            changeWalkSeconds: place.walkSeconds,
                            walkToSeconds: walkTo,
                            walkFromSeconds: walkFrom,
                            leaveAt,
                            doorArrival,
                        }
                    }
                }
            }
            if (best) journeys.push(best)
        }
    }

    // Keep journeys nothing beats: none leaves later (or equal) and arrives earlier (or equal).
    const kept = journeys.filter(
        (journey) =>
            !journeys.some(
                (other) =>
                    other !== journey &&
                    other.leaveAt >= journey.leaveAt &&
                    other.doorArrival <= journey.doorArrival &&
                    (other.leaveAt > journey.leaveAt || other.doorArrival < journey.doorArrival),
            ),
    )
    const unique = new Map<string, Transfer>()
    for (const journey of kept)
        unique.set(`${journey.first.tripId}|${journey.second.tripId}`, journey)
    return [...unique.values()].sort((a, b) => a.leaveAt - b.leaveAt).slice(0, MAX_RESULTS)
}

// --- HELPERS ---

/**
 * Stops where a line from the origin meets a line to the destination today, as pairs (same stop,
 * or same-named stops a short walk apart), the most direct ones first.
 */
function changePlaces(
    repository: TimetableRepository,
    request: TransferRequest,
    serviceDate: string,
): ChangePlace[] {
    const originStops = [...request.origin.walkMeters.keys()]
    const destinationStops = [...request.destination.walkMeters.keys()]
    const fromOrigin = new Set(
        repository.reachableFrom(originStops, serviceDate).map((row) => row.areaId),
    )
    const toDestination = new Set(
        repository.reachingTo(destinationStops, serviceDate).map((row) => row.areaId),
    )
    const ownAreas = new Set(repository.areasOfStops([...originStops, ...destinationStops]))
    for (const id of ownAreas) {
        fromOrigin.delete(id)
        toDestination.delete(id)
    }
    if (fromOrigin.size === 0 || toDestination.size === 0) return []

    const areas = new Map(
        repository
            .areasByIds([...new Set([...fromOrigin, ...toDestination])])
            .map((area) => [area.id, area]),
    )
    const departByName = new Map<string, Area[]>()
    for (const id of toDestination) {
        const area = areas.get(id)
        if (!area) continue
        const key = stopNameKey(area.name)
        departByName.set(key, [...(departByName.get(key) ?? []), area])
    }

    const places: (ChangePlace & { detour: number })[] = []
    const { area: o } = request.origin
    const { area: d } = request.destination
    for (const id of fromOrigin) {
        const arrive = areas.get(id)
        if (!arrive) continue
        for (const depart of departByName.get(stopNameKey(arrive.name)) ?? []) {
            const apart = distanceMeters(arrive.lat, arrive.lon, depart.lat, depart.lon)
            if (apart > CHANGE_AREA_METERS) continue
            places.push({
                arrive,
                depart,
                walkSeconds:
                    arrive.id === depart.id
                        ? 0
                        : Math.round(apart * STRAIGHT_LINE_DETOUR * request.pace),
                detour:
                    distanceMeters(o.lat, o.lon, arrive.lat, arrive.lon) +
                    distanceMeters(depart.lat, depart.lon, d.lat, d.lon),
            })
        }
    }
    return places.sort((a, b) => a.detour - b.detour).slice(0, MAX_CHANGE_PLACES)
}

function leg(
    candidate: Candidate,
    stops: Map<string, StopInfo>,
    snapshot: RealtimeSnapshot | null,
): TransferLeg | null {
    const adjustment = snapshot?.adjustmentFor(candidate) ?? null
    if (adjustment?.cancelled) return null
    const place = (stopId: string) => {
        const info = stops.get(stopId)
        return {
            stopId,
            name: info?.name ?? "",
            platform: info?.platform ?? "",
            lat: info?.lat ?? 0,
            lon: info?.lon ?? 0,
        }
    }
    return {
        tripId: candidate.tripId,
        line: candidate.line,
        mode: candidate.mode,
        headsign: candidate.headsign,
        from: place(candidate.fromStopId),
        to: place(candidate.toStopId),
        expectedDeparture: candidate.plannedDeparture + (adjustment?.departureDelay ?? 0),
        expectedArrival: candidate.plannedArrival + (adjustment?.arrivalDelay ?? 0),
        delay: adjustment?.departureDelay ?? 0,
    }
}
