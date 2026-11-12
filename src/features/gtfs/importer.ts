// Imports a GTFS zip into the SQLite timetable database the app reads

import { mkdirSync, renameSync, rmSync } from "node:fs"
import { dirname } from "node:path"
import { DatabaseSync, type StatementSync } from "node:sqlite"

import { modeFromRouteType } from "@/features/board/build-board"
import { clipShape, computeLinePatterns, simplifyPath } from "@/features/network/patterns"
import { buildLinePath } from "@/features/roads/line-path"
import type { LatLon, RoadRouter, RouteMode } from "@/features/roads/router"
import type { BoundingBox } from "@/lib/config"
import { distanceMeters, normaliseForSearch } from "@/lib/geo"
import { parseGtfsTime, shiftServiceDate } from "@/lib/time"

import { forEachCsvRow } from "./csv"
import { CREATE_INDEXES, CREATE_TABLES, SCHEMA_VERSION } from "./gtfs-tables"
import { openGtfsArchive, type GtfsArchive } from "./zip"

// --- CONSTANTS ---

const BATCH_SIZE = 50_000
/** Map lines lose detail below this; keeps the network payload around a megabyte. */
const SHAPE_TOLERANCE_METERS = 6
/** Routed lines keep more detail, so curves stay round. */
const ROUTED_TOLERANCE_METERS = 3
/** Platforms without a parent station that share a name within this distance become one area. */
const SAME_NAME_MERGE_METERS = 200
const WEEKDAY_COLUMNS = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
] as const

// --- INTERFACES ---

export interface ImportOptions {
    zipPath: string
    dbPath: string
    bbox: BoundingBox
    source: string
    log?: (message: string) => void
    /** When given, map lines are routed along these roads and tracks instead of the feed's shapes alone. */
    roads?: RoadRouter
}

export interface ImportSummary {
    stops: number
    areas: number
    stopTimes: number
    trips: number
    routes: number
    serviceDates: number
    firstDate: string | null
    lastDate: string | null
}

interface StopRow {
    stopId: string
    name: string
    platform: string
    lat: number
    lon: number
    parent: string
}

interface AreaDraft {
    areaId: string
    name: string
    latSum: number
    lonSum: number
    count: number
}

// --- HELPERS ---

/** Wraps a prepared insert so rows are committed in large transactions instead of one by one. */
class BatchInserter {
    private pending = 0
    total = 0

    constructor(
        private readonly db: DatabaseSync,
        private readonly statement: StatementSync,
    ) {}

    add(...values: (string | number)[]): void {
        if (this.pending === 0) this.db.exec("BEGIN")
        this.statement.run(...values)
        this.total++
        if (++this.pending >= BATCH_SIZE) this.flush()
    }

    flush(): void {
        if (this.pending > 0) {
            this.db.exec("COMMIT")
            this.pending = 0
        }
    }
}

async function readTable(
    archive: GtfsArchive,
    table: string,
    columns: readonly string[],
    onRow: (values: string[]) => void,
): Promise<number> {
    return forEachCsvRow(await archive.open(table), columns, onRow)
}

/** Groups platforms into areas and returns both the areas and each platform's area id. */
function buildAreas(
    stops: StopRow[],
    stationNames: Map<string, string>,
): { areas: Map<string, AreaDraft>; areaOfStop: Map<string, string> } {
    const areas = new Map<string, AreaDraft>()
    const orphansByName = new Map<string, AreaDraft[]>()
    const areaOfStop = new Map<string, string>()

    const addTo = (area: AreaDraft, stop: StopRow) => {
        area.latSum += stop.lat
        area.lonSum += stop.lon
        area.count++
        areaOfStop.set(stop.stopId, area.areaId)
    }

    for (const stop of stops) {
        if (stop.parent) {
            let area = areas.get(stop.parent)
            if (!area) {
                area = {
                    areaId: stop.parent,
                    name: stationNames.get(stop.parent) ?? stop.name,
                    latSum: 0,
                    lonSum: 0,
                    count: 0,
                }
                areas.set(area.areaId, area)
            }
            addTo(area, stop)
            continue
        }

        const sameName = orphansByName.get(stop.name) ?? []
        let area = sameName.find(
            (candidate) =>
                distanceMeters(
                    candidate.latSum / candidate.count,
                    candidate.lonSum / candidate.count,
                    stop.lat,
                    stop.lon,
                ) <= SAME_NAME_MERGE_METERS,
        )
        if (!area) {
            area = {
                areaId: `stop:${stop.stopId}`,
                name: stop.name,
                latSum: 0,
                lonSum: 0,
                count: 0,
            }
            sameName.push(area)
            orphansByName.set(stop.name, sameName)
            areas.set(area.areaId, area)
        }
        addTo(area, stop)
    }

    return { areas, areaOfStop }
}

async function readServiceDates(
    archive: GtfsArchive,
    serviceIds: Set<string>,
): Promise<Map<string, Set<string>>> {
    const dates = new Map<string, Set<string>>()
    const datesFor = (serviceId: string) => {
        let set = dates.get(serviceId)
        if (!set) dates.set(serviceId, (set = new Set()))
        return set
    }

    if (archive.has("calendar.txt")) {
        await readTable(
            archive,
            "calendar.txt",
            ["service_id", "start_date", "end_date", ...WEEKDAY_COLUMNS],
            (row) => {
                const [serviceId = "", startDate = "", endDate = "", ...weekdays] = row
                if (
                    !serviceIds.has(serviceId) ||
                    !/^\d{8}$/.test(startDate) ||
                    !/^\d{8}$/.test(endDate)
                )
                    return
                const set = datesFor(serviceId)
                for (let date = startDate; date <= endDate; date = shiftServiceDate(date, 1)) {
                    const weekday = new Date(
                        Date.UTC(
                            Number(date.slice(0, 4)),
                            Number(date.slice(4, 6)) - 1,
                            Number(date.slice(6, 8)),
                        ),
                    ).getUTCDay()
                    if (weekdays[weekday] === "1") set.add(date)
                }
            },
        )
    }

    if (archive.has("calendar_dates.txt")) {
        const removals: [string, string][] = []
        await readTable(
            archive,
            "calendar_dates.txt",
            ["service_id", "date", "exception_type"],
            (row) => {
                const [serviceId = "", date = "", exceptionType = ""] = row
                if (!serviceIds.has(serviceId) || !/^\d{8}$/.test(date)) return
                if (exceptionType === "1") datesFor(serviceId).add(date)
                else if (exceptionType === "2") removals.push([serviceId, date])
            },
        )
        for (const [serviceId, date] of removals) dates.get(serviceId)?.delete(date)
    }

    return dates
}

/**
 * Stores each route's distinct stopping patterns with the road geometry of one of its trips,
 * cut to the stretch inside the region. Only the shapes those trips use are read from shapes.txt.
 */
async function writeLinePatterns(
    db: DatabaseSync,
    archive: GtfsArchive,
    shapeOfTrip: Map<string, string>,
    routeColors: Map<string, string>,
    log: (message: string) => void,
    roads?: RoadRouter,
): Promise<number> {
    const patterns = computeLinePatterns(db)
    const wanted = new Set(
        patterns.map((pattern) => shapeOfTrip.get(pattern.tripId)).filter((id) => id !== undefined),
    )

    const shapes = new Map<string, { seq: number; point: LatLon }[]>()
    if (wanted.size > 0 && archive.has("shapes.txt")) {
        await readTable(
            archive,
            "shapes.txt",
            ["shape_id", "shape_pt_lat", "shape_pt_lon", "shape_pt_sequence"],
            ([shapeId = "", latRaw = "", lonRaw = "", seqRaw = ""]) => {
                if (!wanted.has(shapeId)) return
                const lat = Number(latRaw)
                const lon = Number(lonRaw)
                const seq = Number(seqRaw)
                if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(seq)) return
                let points = shapes.get(shapeId)
                if (!points) shapes.set(shapeId, (points = []))
                points.push({ seq, point: [lat, lon] })
            },
        )
        log(`  read ${shapes.size} of ${wanted.size} shapes`)
    }

    const position = new Map(
        (
            db.prepare("SELECT stop_id AS id, lat, lon FROM stops").all() as unknown as {
                id: string
                lat: number
                lon: number
            }[]
        ).map((stop) => [stop.id, [stop.lat, stop.lon] as LatLon]),
    )
    const routeMode = new Map<string, RouteMode | null>()
    for (const route of db.prepare("SELECT route_id AS id, type FROM routes").all() as unknown as {
        id: string
        type: number
    }[]) {
        const mode = modeFromRouteType(route.type)
        routeMode.set(
            route.id,
            mode === "bus" ? "road" : mode === "tram" || mode === "metro" ? "tram" : null,
        )
    }
    const routedPieces = new Map<string, LatLon[]>()
    let routed = 0

    const insert = new BatchInserter(
        db,
        db.prepare("INSERT INTO line_patterns VALUES (?, ?, ?, ?, ?)"),
    )
    for (const pattern of patterns) {
        const shapeId = shapeOfTrip.get(pattern.tripId)
        const raw = shapeId ? shapes.get(shapeId) : undefined
        const first = position.get(pattern.stopIds[0] ?? "")
        const last = position.get(pattern.stopIds[pattern.stopIds.length - 1] ?? "")
        const ordered =
            raw && raw.length >= 2
                ? raw.sort((a, b) => a.seq - b.seq).map((entry) => entry.point)
                : null
        const mode = routeMode.get(pattern.routeId) ?? null
        let path: LatLon[] = []
        if (roads && mode) {
            const stops = pattern.stopIds.flatMap((id) => {
                const point = position.get(id)
                return point ? [{ id, position: point }] : []
            })
            if (stops.length >= 2) {
                path = simplifyPath(
                    buildLinePath(roads, mode, stops, ordered, routedPieces),
                    ROUTED_TOLERANCE_METERS,
                )
                routed++
            }
        } else if (ordered && first && last) {
            path = simplifyPath(clipShape(ordered, first, last), SHAPE_TOLERANCE_METERS)
        }
        insert.add(
            pattern.routeId,
            pattern.trips,
            JSON.stringify(pattern.stopIds),
            path.length >= 2 ? JSON.stringify(path) : "",
            routeColors.get(pattern.routeId) ?? "",
        )
    }
    insert.flush()
    if (roads)
        log(
            `  routed ${routed} patterns along the road network (${routedPieces.size} stop-to-stop pieces)`,
        )
    return insert.total
}

// --- SERVICE ---

/**
 * Builds the SQLite database the app reads, keeping only what touches the bounding box.
 * The database is written next to its final path and swapped in at the end, so a running app
 * never sees a half-imported file.
 */
export async function importGtfs(options: ImportOptions): Promise<ImportSummary> {
    const log = options.log ?? (() => {})
    const { bbox } = options
    const tempPath = `${options.dbPath}.importing`
    mkdirSync(dirname(options.dbPath), { recursive: true })
    rmSync(tempPath, { force: true })

    const archive = await openGtfsArchive(options.zipPath)
    const db = new DatabaseSync(tempPath)
    try {
        db.exec("PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF;")
        db.exec(CREATE_TABLES)

        log("Reading stops…")
        const stationNames = new Map<string, string>()
        const stops: StopRow[] = []
        await readTable(
            archive,
            "stops.txt",
            [
                "stop_id",
                "stop_name",
                "stop_lat",
                "stop_lon",
                "location_type",
                "parent_station",
                "platform_code",
            ],
            ([
                stopId = "",
                name = "",
                latRaw = "",
                lonRaw = "",
                locationType = "",
                parent = "",
                platform = "",
            ]) => {
                if (locationType === "1") {
                    stationNames.set(stopId, name)
                    return
                }
                if (locationType !== "" && locationType !== "0") return
                const lat = Number(latRaw)
                const lon = Number(lonRaw)
                if (!stopId || !Number.isFinite(lat) || !Number.isFinite(lon)) return
                if (
                    lat < bbox.minLat ||
                    lat > bbox.maxLat ||
                    lon < bbox.minLon ||
                    lon > bbox.maxLon
                )
                    return
                stops.push({ stopId, name, platform, lat, lon, parent })
            },
        )
        if (stops.length === 0)
            throw new Error("No stops fall inside the bounding box; check GTFS_BBOX.")

        const { areas, areaOfStop } = buildAreas(stops, stationNames)
        const stopIds = new Set(stops.map((stop) => stop.stopId))

        const insertStop = new BatchInserter(
            db,
            db.prepare("INSERT INTO stops VALUES (?, ?, ?, ?, ?, ?)"),
        )
        for (const stop of stops) {
            insertStop.add(
                stop.stopId,
                areaOfStop.get(stop.stopId) ?? `stop:${stop.stopId}`,
                stop.name,
                stop.platform,
                stop.lat,
                stop.lon,
            )
        }
        insertStop.flush()

        const insertArea = new BatchInserter(
            db,
            db.prepare("INSERT INTO areas VALUES (?, ?, ?, ?, ?, 0)"),
        )
        for (const area of areas.values()) {
            insertArea.add(
                area.areaId,
                area.name,
                normaliseForSearch(area.name),
                area.latSum / area.count,
                area.lonSum / area.count,
            )
        }
        insertArea.flush()
        log(`  ${stops.length} platforms in ${areas.size} stop areas`)

        log("Reading stop times (the big one, this takes a few minutes on the national feed)…")
        const tripIds = new Set<string>()
        const insertStopTime = new BatchInserter(
            db,
            db.prepare("INSERT OR IGNORE INTO stop_times VALUES (?, ?, ?, ?, ?, ?, ?)"),
        )
        const scanned = await readTable(
            archive,
            "stop_times.txt",
            [
                "trip_id",
                "stop_sequence",
                "stop_id",
                "arrival_time",
                "departure_time",
                "pickup_type",
                "drop_off_type",
            ],
            ([
                tripId = "",
                seqRaw = "",
                stopId = "",
                arrivalRaw = "",
                departureRaw = "",
                pickupType = "",
                dropOffType = "",
            ]) => {
                if (!stopIds.has(stopId)) return
                const departure = parseGtfsTime(departureRaw) ?? parseGtfsTime(arrivalRaw)
                const arrival = parseGtfsTime(arrivalRaw) ?? departure
                const seq = Number(seqRaw)
                if (!tripId || departure === null || arrival === null || !Number.isInteger(seq))
                    return
                // GTFS type 1 means "not available"; every other value still lets a traveller board/alight.
                insertStopTime.add(
                    tripId,
                    seq,
                    stopId,
                    arrival,
                    departure,
                    pickupType === "1" ? 0 : 1,
                    dropOffType === "1" ? 0 : 1,
                )
                tripIds.add(tripId)
            },
        )
        insertStopTime.flush()
        log(`  kept ${insertStopTime.total} of ${scanned} stop times`)

        log("Reading trips, routes and calendars…")
        const routeIds = new Set<string>()
        const serviceIds = new Set<string>()
        const shapeOfTrip = new Map<string, string>()
        const insertTrip = new BatchInserter(
            db,
            db.prepare("INSERT OR IGNORE INTO trips VALUES (?, ?, ?, ?)"),
        )
        await readTable(
            archive,
            "trips.txt",
            ["trip_id", "route_id", "service_id", "trip_headsign", "shape_id"],
            ([tripId = "", routeId = "", serviceId = "", headsign = "", shapeId = ""]) => {
                if (!tripIds.has(tripId)) return
                insertTrip.add(tripId, routeId, serviceId, headsign)
                if (shapeId) shapeOfTrip.set(tripId, shapeId)
                routeIds.add(routeId)
                serviceIds.add(serviceId)
            },
        )
        insertTrip.flush()

        const routeColors = new Map<string, string>()
        const insertRoute = new BatchInserter(
            db,
            db.prepare("INSERT OR IGNORE INTO routes VALUES (?, ?, ?, ?, ?)"),
        )
        await readTable(
            archive,
            "routes.txt",
            [
                "route_id",
                "agency_id",
                "route_short_name",
                "route_long_name",
                "route_type",
                "route_color",
            ],
            ([
                routeId = "",
                agencyId = "",
                shortName = "",
                longName = "",
                routeType = "",
                color = "",
            ]) => {
                if (!routeIds.has(routeId)) return
                if (/^[0-9a-f]{6}$/i.test(color))
                    routeColors.set(routeId, `#${color.toLowerCase()}`)
                insertRoute.add(routeId, agencyId, shortName, longName, Number(routeType) || 0)
            },
        )
        insertRoute.flush()

        const serviceDates = await readServiceDates(archive, serviceIds)
        const insertServiceDate = new BatchInserter(
            db,
            db.prepare("INSERT OR IGNORE INTO service_dates VALUES (?, ?)"),
        )
        let firstDate: string | null = null
        let lastDate: string | null = null
        for (const [serviceId, dates] of serviceDates) {
            for (const date of dates) {
                insertServiceDate.add(serviceId, date)
                if (firstDate === null || date < firstDate) firstDate = date
                if (lastDate === null || date > lastDate) lastDate = date
            }
        }
        insertServiceDate.flush()

        log("Building indexes…")
        db.exec(CREATE_INDEXES)
        db.exec(`
      UPDATE areas SET departures = (
        SELECT COUNT(*) FROM stop_times st JOIN stops s ON s.stop_id = st.stop_id WHERE s.area_id = areas.area_id
      );
    `)

        log("Building line patterns for the map…")
        const patternCount = await writeLinePatterns(
            db,
            archive,
            shapeOfTrip,
            routeColors,
            log,
            options.roads,
        )
        log(`  ${patternCount} patterns`)

        const setMeta = db.prepare("INSERT INTO meta VALUES (?, ?)")
        setMeta.run("schema_version", SCHEMA_VERSION)
        setMeta.run("source", options.source)
        setMeta.run("imported_at", new Date().toISOString())
        setMeta.run("first_date", firstDate ?? "")
        setMeta.run("last_date", lastDate ?? "")
        setMeta.run("bbox", JSON.stringify(bbox))
        db.exec("ANALYZE;")
        db.close()

        renameSync(tempPath, options.dbPath)

        return {
            stops: stops.length,
            areas: areas.size,
            stopTimes: insertStopTime.total,
            trips: insertTrip.total,
            routes: insertRoute.total,
            serviceDates: insertServiceDate.total,
            firstDate,
            lastDate,
        }
    } catch (error) {
        try {
            db.close()
        } catch {
            // Already closed; the original error is the one worth reporting.
        }
        rmSync(tempPath, { force: true })
        throw error
    } finally {
        archive.close()
    }
}
