// Pure board building blocks: walking estimates, picking and ranking departures, the summary

import type {
    Board,
    BoardSummary,
    Candidate,
    Departure,
    Mode,
    RealtimeAdjustment,
    StopInfo,
} from "./board.types"

// --- CONSTANTS ---

const HEADWAY_WINDOW_SECONDS = 3600

/** Walking speed: 5 km/h, about 83 m a minute, over a walking distance (see walkingMeters). */
export const WALK_SECONDS_PER_METER = 3600 / 5000

/** Streets are not straight lines: without a walking route, a straight line plus a quarter. */
export const STRAIGHT_LINE_DETOUR = 1.25

/**
 * Door-to-door times this close count as equal by default: the walking estimate is too rough to
 * tell them apart, and less walking is the safer choice. The traveller can change it (settings).
 */
export const PAIR_TIE_SECONDS = 2 * 60

/** How much slower than the fastest option a ride may be and still be drawn on the map. */
const MAP_SLACK_FACTOR = 1.5
const MAP_SLACK_SECONDS = 5 * 60

/** How far back to look so a delayed vehicle that should already have left still shows up. */
export const LATE_DEPARTURE_GRACE_SECONDS = 20 * 60

// --- HELPERS ---

export function modeFromRouteType(routeType: number): Mode {
    // Basic GTFS types plus the extended (HVT) ranges some feeds use.
    if (routeType === 0 || (routeType >= 900 && routeType < 1000)) return "tram"
    if (routeType === 3 || (routeType >= 700 && routeType < 800) || routeType === 11) return "bus"
    if (routeType === 1 || (routeType >= 400 && routeType < 500)) return "metro"
    if (routeType === 2 || (routeType >= 100 && routeType < 200)) return "train"
    if (routeType === 4 || routeType === 1000) return "ferry"
    return "other"
}

/** Walking metres in a number of minutes, at WALK_SECONDS_PER_METER. */
export function minutesToWalkMeters(minutes: number): number {
    return Math.round((minutes * 60) / WALK_SECONDS_PER_METER)
}

export function walkSeconds(meters: number): number {
    return meters > 0 ? Math.max(60, Math.round((meters * WALK_SECONDS_PER_METER) / 60) * 60) : 0
}

/**
 * A trip can match several origin/destination platform pairs (ring lines, or stops within
 * walking distance of each other). The stops the traveller chose always win over stops that
 * are merely nearby. Among equals, every pair within `tieSeconds` of the quickest
 * door-to-door time (walk, ride, walk) counts as just as quick; of those the one with the least
 * walking wins, then the quickest, then the later boarding. Without a walk map every platform
 * counts as chosen.
 */
export function pickBestPairPerTrip(
    candidates: Candidate[],
    originWalk: ReadonlyMap<string, number> = new Map(),
    destinationWalk: ReadonlyMap<string, number> = new Map(),
    tieSeconds = PAIR_TIE_SECONDS,
): Candidate[] {
    type Scored = { candidate: Candidate; nearbyOnly: number; walk: number; seconds: number }
    const byTrip = new Map<string, Scored[]>()
    for (const candidate of candidates) {
        const walkFrom = originWalk.get(candidate.fromStopId) ?? 0
        const walkTo = destinationWalk.get(candidate.toStopId) ?? 0
        const walk = walkFrom + walkTo
        const scored: Scored = {
            candidate,
            nearbyOnly: (walkFrom > 0 ? 1 : 0) + (walkTo > 0 ? 1 : 0),
            walk,
            seconds:
                walk * WALK_SECONDS_PER_METER +
                candidate.plannedArrival -
                candidate.plannedDeparture,
        }
        const key = `${candidate.serviceDate}|${candidate.tripId}`
        const list = byTrip.get(key) ?? []
        list.push(scored)
        byTrip.set(key, list)
    }

    const result: Candidate[] = []
    for (const list of byTrip.values()) {
        const fewestNearby = Math.min(...list.map((entry) => entry.nearbyOnly))
        const eligible = list.filter((entry) => entry.nearbyOnly === fewestNearby)
        const quickest = Math.min(...eligible.map((entry) => entry.seconds))
        let best: Scored | null = null
        for (const entry of eligible) {
            if (entry.seconds > quickest && entry.seconds >= quickest + tieSeconds) continue
            if (
                !best ||
                entry.walk < best.walk ||
                (entry.walk === best.walk &&
                    (entry.seconds < best.seconds ||
                        (entry.seconds === best.seconds &&
                            entry.candidate.plannedDeparture > best.candidate.plannedDeparture)))
            ) {
                best = entry
            }
        }
        if (best) result.push(best.candidate)
    }
    return result
}

/**
 * The rides worth showing on the map for a whole day. The board weeds out slow trips moment by
 * moment ("ingehaald"); the map has no moment, so it compares stretches instead: a stretch whose
 * quickest trip (door to door, walks included) takes far longer than the quickest stretch
 * overall, such as a ring line the long way round, is left out.
 */
export function worthwhileRides(
    trips: Candidate[],
    originWalk: ReadonlyMap<string, number> = new Map(),
    destinationWalk: ReadonlyMap<string, number> = new Map(),
): Candidate[] {
    const doorSeconds = (trip: Candidate) =>
        trip.plannedArrival -
        trip.plannedDeparture +
        walkSeconds(originWalk.get(trip.fromStopId) ?? 0) +
        walkSeconds(destinationWalk.get(trip.toStopId) ?? 0)
    const key = (trip: Candidate) => `${trip.routeId}|${trip.fromStopId}|${trip.toStopId}`

    const quickest = new Map<string, number>()
    for (const trip of trips) {
        const seconds = doorSeconds(trip)
        quickest.set(key(trip), Math.min(quickest.get(key(trip)) ?? Infinity, seconds))
    }
    const best = Math.min(...quickest.values())
    const limit = best * MAP_SLACK_FACTOR + MAP_SLACK_SECONDS
    return trips.filter((trip) => (quickest.get(key(trip)) ?? Infinity) <= limit)
}

export function toDeparture(
    candidate: Candidate,
    stops: Map<string, StopInfo>,
    adjustment: RealtimeAdjustment | null,
    originWalk: ReadonlyMap<string, number> = new Map(),
    destinationWalk: ReadonlyMap<string, number> = new Map(),
    nowSeconds = 0,
): Departure {
    const unknownStop: StopInfo = { name: "", platform: "", lat: 0, lon: 0 }
    const walkTo = walkSeconds(originWalk.get(candidate.fromStopId) ?? 0)
    const walkFrom = walkSeconds(destinationWalk.get(candidate.toStopId) ?? 0)
    const expectedDeparture = candidate.plannedDeparture + (adjustment?.departureDelay ?? 0)
    const expectedArrival = candidate.plannedArrival + (adjustment?.arrivalDelay ?? 0)
    return {
        tripId: candidate.tripId,
        line: candidate.line,
        mode: candidate.mode,
        headsign: candidate.headsign,
        from: {
            ...(stops.get(candidate.fromStopId) ?? unknownStop),
            stopId: candidate.fromStopId,
            walkMeters: originWalk.get(candidate.fromStopId) ?? 0,
        },
        to: {
            ...(stops.get(candidate.toStopId) ?? unknownStop),
            stopId: candidate.toStopId,
            walkMeters: destinationWalk.get(candidate.toStopId) ?? 0,
        },
        plannedDeparture: candidate.plannedDeparture,
        plannedArrival: candidate.plannedArrival,
        expectedDeparture,
        expectedArrival,
        cancelled: adjustment?.cancelled ?? false,
        walkToSeconds: walkTo,
        walkFromSeconds: walkFrom,
        leaveAt: expectedDeparture - walkTo,
        doorArrival: expectedArrival + walkFrom,
        // A minute of slack: the estimate is rough and buses wait a moment at the stop.
        catchable: walkTo === 0 || expectedDeparture - walkTo >= nowSeconds - 60,
        overtakenBy: null,
        firstToArrive: false,
    }
}

/** Seconds on foot for a departure, both ends together. */
export const departureWalkSeconds = (departure: Departure) =>
    departure.walkToSeconds + departure.walkFromSeconds

/**
 * Whether `other` is a better choice than `departure` by arrival alone: it arrives sooner, and
 * not merely by less than `tieSeconds` while walking more ("Minder lopen mag langer duren").
 */
export function arrivesClearlySooner(
    other: Departure,
    departure: Departure,
    tieSeconds: number,
): boolean {
    if (other.doorArrival >= departure.doorArrival) return false
    const walksMore = departureWalkSeconds(other) > departureWalkSeconds(departure)
    return !(walksMore && departure.doorArrival - other.doorArrival < tieSeconds)
}

/**
 * Orders departures the way a traveller reads a board (by departure) and flags the ones that are
 * a worse choice: another one you set off for no earlier still gets you there sooner, counting
 * the walks at both ends. Arriving less than `tieSeconds` sooner does not count when it takes
 * more walking. Cancelled trips and ones you cannot walk to in time neither overtake nor get
 * "first there".
 */
export function rankDepartures(departures: Departure[], tieSeconds = 0): Departure[] {
    const sorted = [...departures].sort(
        (a, b) => a.expectedDeparture - b.expectedDeparture || a.doorArrival - b.doorArrival,
    )
    const usable = sorted.filter((departure) => !departure.cancelled && departure.catchable)

    let earliestArrival: Departure | null = null
    for (const departure of usable) {
        if (!earliestArrival || departure.doorArrival < earliestArrival.doorArrival)
            earliestArrival = departure
    }

    return sorted.map((departure) => {
        if (departure.cancelled) return departure
        let overtaker: Departure | null = null
        for (const other of usable) {
            if (other === departure) continue
            if (
                other.leaveAt >= departure.leaveAt &&
                arrivesClearlySooner(other, departure, tieSeconds)
            ) {
                if (!overtaker || other.doorArrival < overtaker.doorArrival) overtaker = other
            }
        }
        return {
            ...departure,
            overtakenBy: overtaker?.line ?? null,
            firstToArrive: departure === earliestArrival,
        }
    })
}

function median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b)
    const middle = Math.floor(sorted.length / 2)
    const upper = sorted[middle] ?? 0
    return sorted.length % 2 === 1 ? upper : ((sorted[middle - 1] ?? upper) + upper) / 2
}

export function summarise(departures: Departure[], now: number): BoardSummary {
    const useful = departures.filter(
        (departure) =>
            !departure.cancelled && departure.catchable && departure.overtakenBy === null,
    )

    const counts = new Map<string, { line: string; mode: Mode; count: number }>()
    for (const departure of departures) {
        if (departure.cancelled) continue
        const key = `${departure.mode}|${departure.line}`
        const entry = counts.get(key) ?? { line: departure.line, mode: departure.mode, count: 0 }
        entry.count++
        counts.set(key, entry)
    }
    const lines = [...counts.values()]
        .sort((a, b) => b.count - a.count || a.line.localeCompare(b.line, "nl", { numeric: true }))
        .map(({ line, mode }) => ({ line, mode }))

    const upcoming = useful
        .map((departure) => departure.expectedDeparture)
        .filter((time) => time <= now + HEADWAY_WINDOW_SECONDS)
        .sort((a, b) => a - b)
    const gaps: number[] = []
    for (let i = 1; i < upcoming.length; i++) gaps.push((upcoming[i] ?? 0) - (upcoming[i - 1] ?? 0))
    // Fewer than three gaps says little about how often something runs.
    const headwayMinutes = gaps.length >= 3 ? Math.max(1, Math.round(median(gaps) / 60)) : null

    return { lines, headwayMinutes }
}

/** An older board without the buses that have left since. */
export function withoutPast(board: Board, now: number): Board {
    return {
        ...board,
        departures: board.departures.filter((departure) => departure.expectedDeparture >= now - 60),
        transfers: board.transfers.filter((journey) => journey.first.expectedDeparture >= now - 60),
    }
}
