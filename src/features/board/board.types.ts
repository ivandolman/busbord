// Shared board types: places, trips, departures and the boards built from them

// --- INTERFACES ---

export type Mode = "tram" | "bus" | "metro" | "train" | "ferry" | "other"

export interface Area {
    id: string
    name: string
    lat: number
    lon: number
    departures: number
}

/** One trip that serves an origin platform and, later, a destination platform. Times are epoch seconds. */
export interface Candidate {
    tripId: string
    routeId: string
    serviceDate: string
    line: string
    mode: Mode
    headsign: string
    fromStopId: string
    fromSeq: number
    toStopId: string
    toSeq: number
    plannedDeparture: number
    plannedArrival: number
}

export interface StopInfo {
    name: string
    platform: string
    lat: number
    lon: number
}

/** A platform on the board, with the walk to (or from) the place that was asked for; 0 = that stop itself. */
export interface BoardStop extends StopInfo {
    stopId: string
    walkMeters: number
}

/**
 * Where a board starts or ends: the platforms that count, each with its walking distance.
 * Platforms of the chosen stop itself have distance 0 and always win over nearby ones.
 */
export interface Endpoint {
    area: Area
    kind: "area" | "point"
    walkMeters: Map<string, number>
}

export interface RealtimeAdjustment {
    cancelled: boolean
    departureDelay: number
    arrivalDelay: number
}

export interface Departure {
    tripId: string
    line: string
    mode: Mode
    headsign: string
    from: BoardStop
    to: BoardStop
    plannedDeparture: number
    plannedArrival: number
    expectedDeparture: number
    expectedArrival: number
    cancelled: boolean
    /** Estimated walk to the boarding stop and from the stop where you get off, in seconds (0 at the chosen stop). */
    walkToSeconds: number
    walkFromSeconds: number
    /** When you have to set off: the vehicle's departure minus the walk to its stop. */
    leaveAt: number
    /** Arrival at the place you asked for: the vehicle's arrival plus the walk from its stop. */
    doorArrival: number
    /** False when the vehicle leaves before you could walk to its stop. */
    catchable: boolean
    /** Line that leaves no earlier yet arrives sooner, making this departure a worse choice. */
    overtakenBy: string | null
    firstToArrive: boolean
}

export interface BoardSummary {
    lines: { line: string; mode: Mode }[]
    /** Typical gap between useful departures in the coming hour, or null when there are too few. */
    headwayMinutes: number | null
}

export interface Board {
    origin: Area & { kind: Endpoint["kind"] }
    destination: Area & { kind: Endpoint["kind"] }
    generatedAt: number
    realtime: "live" | "unavailable" | "disabled"
    walkIncluded: boolean
    summary: BoardSummary
    departures: Departure[]
    /** Diversions and other notices about these lines or stops, active now. */
    alerts: { id: string; header: string; description: string }[]
    /** Trips with one change, when there is no useful direct ride (see transfers.ts). */
    transfers: Transfer[]
}

/** A trip with one change: two rides and the walk (or wait) between them. Times are epoch seconds. */
export interface Transfer {
    first: TransferLeg
    second: TransferLeg
    /** Walk between the two platforms (0 when they are the same stop). */
    changeWalkSeconds: number
    walkToSeconds: number
    walkFromSeconds: number
    /** When to set off from the origin, and arrival at the destination's door. */
    leaveAt: number
    doorArrival: number
}

export interface TransferLeg {
    tripId: string
    line: string
    mode: Mode
    headsign: string
    from: { stopId: string; name: string; platform: string; lat: number; lon: number }
    to: { stopId: string; name: string; platform: string; lat: number; lon: number }
    expectedDeparture: number
    expectedArrival: number
    delay: number
}

/** One departure on a stop's own board (the map popup). Times are epoch seconds. */
export interface StopDeparture {
    tripId: string
    line: string
    mode: Mode
    headsign: string
    platform: string
    plannedDeparture: number
    expectedDeparture: number
    cancelled: boolean
    /** True when this trip also calls at the chosen destination later on. */
    toDestination: boolean
    /** The pole it leaves from (StopBoard.poles). */
    poleId: string
}

/** The next ride of one line from a stop towards the chosen destination. */
export interface NextDeparture {
    line: string
    mode: Mode
    /** Epoch seconds, with realtime when known. */
    expectedDeparture: number
}

export interface NextDepartures {
    generatedAt: number
    /** Per requested stop area, one entry per line, soonest first. */
    areas: Record<string, NextDeparture[]>
}

/** One physical stop (pole or platform) of the clicked stop, so the traveller knows where to stand. */
export interface StopPole {
    id: string
    /** The platform code, or A, B, C… when the feed has none. */
    label: string
    lat: number
    lon: number
    /** Where most departures go next, e.g. "Stadsschouwburg": which side of the street. */
    towards: string | null
    /** Walk from the chosen origin, when one is chosen and the pole is within reach. */
    walkMeters: number | null
    walkSeconds: number | null
}

export interface TrainPlatform {
    code: string
    lat: number
    lon: number
}

/** A train station near a stop: where a traveller arriving by train gets off. */
export interface TrainStation {
    areaId: string
    name: string
    /** Platforms trains call at, in number order ("1", "4", "4a", "5"…). */
    platforms: TrainPlatform[]
}

export interface StopBoard {
    stop: { id: string; name: string }
    generatedAt: number
    realtime: Board["realtime"]
    /** Null when no destination was given. */
    destination: { id: string; name: string } | null
    /** Poles that have departures, in label order. */
    poles: StopPole[]
    departures: StopDeparture[]
    /** The train station nearby, to start from the platform you arrive at; null when none. */
    station: TrainStation | null
}
