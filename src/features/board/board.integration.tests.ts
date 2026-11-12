// Integration tests for the board, stop board, transfers, network and realtime on the demo feed

import assert from "node:assert"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { after, before, describe, it } from "node:test"

import GtfsRealtimeBindings from "gtfs-realtime-bindings"

import { TimetableRepository } from "@/features/board/board.repository"
import { getBoard, getStopBoard } from "@/features/board/board.service"
import type { Mode } from "@/features/board/board.types"
import { UnknownAreaError } from "@/features/board/endpoint"
import { getNextDepartures } from "@/features/board/next-departures"
import { decodeTripUpdates, type RealtimeSource } from "@/features/board/realtime"
import { writeDemoFeed } from "@/features/gtfs/demo-feed"
import { importGtfs } from "@/features/gtfs/importer"
import { buildNetwork } from "@/features/network/network.service"
import { rideSegments } from "@/features/network/segments"
import { parseBoundingBox } from "@/lib/config"

// --- CONSTANTS ---

const CS_CENTRUM = "stoparea:cs-centrum"
const CS_JAARBEURS = "stoparea:cs-jaarbeurs"
const HEIDELBERGLAAN = "stoparea:heidelberglaan"
const DE_BILT = "stoparea:de-bilt"
const NIEUWEGEIN = "stoparea:nieuwegein"
const MODES: ReadonlySet<Mode> = new Set<Mode>(["bus", "tram"])

// 12 November 2026, 14:00 in Utrecht (CET, UTC+1).
const AFTERNOON = new Date(Date.UTC(2026, 10, 12, 13, 0))

// --- HELPERS ---

let directory: string
let db: DatabaseSync
let repository: TimetableRepository

before(async () => {
    directory = mkdtempSync(join(tmpdir(), "bestemmingsbord-"))
    const zipPath = join(directory, "feed.zip")
    const dbPath = join(directory, "gtfs.sqlite")
    await writeDemoFeed(zipPath, "20261111", 3)
    await importGtfs({ zipPath, dbPath, bbox: parseBoundingBox(undefined), source: "test" })
    db = new DatabaseSync(dbPath, { readOnly: true })
    repository = new TimetableRepository(db)
})

after(() => {
    db.close()
    rmSync(directory, { recursive: true, force: true })
})

const board = (
    originId: string,
    destinationId: string,
    now = AFTERNOON,
    realtime: RealtimeSource | null = null,
    includeWalking = false,
) => getBoard(repository, realtime, { originId, destinationId, includeWalking, modes: MODES, now })

const sorted = (values: number[]) => [...values].sort((a, b) => a - b)

function assertIncludesAll<T>(actual: readonly T[] | undefined, expected: readonly T[]) {
    for (const value of expected) {
        assert.ok(actual?.includes(value), `expected ${JSON.stringify(actual)} to include ${value}`)
    }
}

// --- TESTS ---

describe("stop search", () => {
    it("matches every word, ignores punctuation and ranks busy stops first", () => {
        assert.deepStrictEqual(
            repository.searchAreas("utrecht cs", 5).map((area) => area.name),
            ["Utrecht, CS Centrumzijde", "Utrecht, CS Jaarbeurszijde"],
        )
        assert.deepStrictEqual(repository.searchAreas("100%_", 5), [])
    })
})

describe("getBoard", () => {
    it("bundles every line that links the two stops", async () => {
        const result = await board(CS_CENTRUM, HEIDELBERGLAAN)
        assert.deepStrictEqual(result.summary.lines.map((entry) => entry.line).sort(), [
            "20",
            "22",
            "28",
        ])
        assert.strictEqual(result.realtime, "disabled")
        assert.ok(result.departures.every((d) => d.expectedDeparture >= result.generatedAt - 30))
        assert.ok(result.departures.every((d) => d.expectedArrival > d.expectedDeparture))
    })

    it("shows platforms and flags the slow bus that trams overtake", async () => {
        const result = await board(CS_CENTRUM, HEIDELBERGLAAN)
        const buses = result.departures.filter((d) => d.line === "28")
        assert.ok(buses.length > 0)
        assert.ok(buses.every((d) => d.from.platform === "B2"))
        assert.ok(buses.some((d) => d.overtakenBy === "20" || d.overtakenBy === "22"))
        assert.strictEqual(result.departures.filter((d) => d.firstToArrive).length, 1)
    })

    it("only looks in the requested direction", async () => {
        const result = await board(DE_BILT, CS_CENTRUM)
        assert.deepStrictEqual(result.summary.lines.map((entry) => entry.line).sort(), ["73", "77"])
        assert.ok(result.departures.every((d) => d.to.name === "Utrecht, CS Centrumzijde"))
    })

    it("adds platforms within walking distance only when asked", async () => {
        const without = await board(CS_JAARBEURS, HEIDELBERGLAAN)
        assert.ok(!without.summary.lines.map((entry) => entry.line).includes("22"))
        const withWalking = await board(CS_JAARBEURS, HEIDELBERGLAAN, AFTERNOON, null, true)
        assert.ok(withWalking.summary.lines.map((entry) => entry.line).includes("22"))
    })

    it("boards at the chosen stop, not a nearby one further down the line", async () => {
        // Line 20 calls at CS Jaarbeurszijde and then CS Centrumzijde, which is within walking distance.
        const result = await board(CS_JAARBEURS, HEIDELBERGLAAN, AFTERNOON, null, true)
        const tram20 = result.departures.filter((d) => d.line === "20")
        assert.ok(tram20.length > 0)
        assert.ok(
            tram20.every(
                (d) => d.from.name === "Utrecht, CS Jaarbeurszijde" && d.from.walkMeters === 0,
            ),
        )
        const tram22 = result.departures.filter((d) => d.line === "22")
        assert.ok(tram22.every((d) => d.from.walkMeters > 0))
    })

    it("keeps the destination's own platforms when they lie within the origin's walking radius", async () => {
        const result = await board(CS_CENTRUM, CS_JAARBEURS, AFTERNOON, null, true)
        assert.ok(result.summary.lines.map((entry) => entry.line).includes("28"))
        assert.ok(result.departures.every((d) => d.to.walkMeters === 0))
    })

    it("starts from a point on the map using the stops around it", async () => {
        const result = await board("@52.08540,5.17240", CS_CENTRUM)
        assert.strictEqual(result.origin.kind, "point")
        assert.strictEqual(result.origin.name, "Bij Utrecht, Heidelberglaan")
        assert.ok(result.departures.length > 0)
        assert.ok(result.departures.every((d) => d.from.walkMeters > 0 && d.from.walkMeters <= 400))
    })

    it("keeps serving yesterday's trips after midnight", async () => {
        // 00:20 local on 13 November: demo trips that left the terminus at "24:xx" are still running.
        const result = await board(
            CS_CENTRUM,
            HEIDELBERGLAAN,
            new Date(Date.UTC(2026, 10, 12, 23, 20)),
        )
        assert.ok(result.departures.length > 0)
    })

    it("rejects unknown stops", async () => {
        await assert.rejects(board("stoparea:nope", CS_CENTRUM), UnknownAreaError)
    })
})

describe("stop board", () => {
    it("lists every line leaving a stop and marks the ones that reach the destination", async () => {
        const result = await getStopBoard(repository, null, {
            stopId: CS_CENTRUM,
            destinationId: HEIDELBERGLAAN,
            includeWalking: false,
            modes: MODES,
            now: AFTERNOON,
            horizonSeconds: 3600,
            limit: 100,
        })
        const lines = new Set(result.departures.map((d) => d.line))
        assert.deepStrictEqual(lines, new Set(["18", "20", "22", "28", "73", "77"]))
        const reaching = new Set(
            result.departures.filter((d) => d.toDestination).map((d) => d.line),
        )
        assert.deepStrictEqual(reaching, new Set(["20", "22", "28"]))
        const times = result.departures.map((d) => d.expectedDeparture)
        assert.deepStrictEqual(times, sorted(times))
    })

    it("says which pole each departure leaves from and how far it is from the origin", async () => {
        const result = await getStopBoard(repository, null, {
            stopId: CS_CENTRUM,
            destinationId: null,
            includeWalking: false,
            modes: MODES,
            now: AFTERNOON,
            horizonSeconds: 3600,
            limit: 100,
            originId: CS_JAARBEURS,
        })
        assert.ok(result.poles.length > 0)
        const poleIds = new Set(result.poles.map((pole) => pole.id))
        assert.ok(result.departures.every((d) => poleIds.has(d.poleId)))
        assert.strictEqual(
            new Set(result.poles.map((pole) => pole.label)).size,
            result.poles.length,
        )
        // Without a walker: the straight line plus a quarter, in walking time too.
        for (const pole of result.poles) {
            assert.ok((pole.walkMeters ?? 0) > 0)
            assert.strictEqual(pole.walkSeconds, Math.round((pole.walkMeters ?? 0) * 0.72))
        }
    })
})

describe("transfers", () => {
    it("offers a change at CS when there is no direct ride", async () => {
        const result = await board(DE_BILT, HEIDELBERGLAAN)
        assert.deepStrictEqual(
            result.departures.filter((d) => d.catchable && !d.cancelled),
            [],
        )
        assert.ok(result.transfers.length > 0)
        for (const journey of result.transfers) {
            assert.ok(["73", "77"].includes(journey.first.line))
            assert.ok(["20", "22", "28"].includes(journey.second.line))
            assert.ok(journey.second.expectedDeparture >= journey.first.expectedArrival + 120)
            assert.ok(journey.doorArrival > journey.leaveAt)
        }
        const leave = result.transfers.map((j) => j.leaveAt)
        assert.deepStrictEqual(leave, sorted(leave))
    })

    it("does not search for changes when a direct ride works", async () => {
        assert.deepStrictEqual((await board(CS_CENTRUM, HEIDELBERGLAAN)).transfers, [])
    })
})

describe("next departures for map labels", () => {
    it("gives each stop only the lines that go to the destination, soonest ride per line", async () => {
        const result = await getNextDepartures(repository, null, {
            areaIds: [CS_CENTRUM, DE_BILT],
            destinationId: HEIDELBERGLAAN,
            includeWalking: false,
            modes: MODES,
            now: AFTERNOON,
            horizonSeconds: 3600,
        })
        const atCs = result.areas[CS_CENTRUM] ?? []
        assert.deepStrictEqual(new Set(atCs.map((d) => d.line)), new Set(["20", "22", "28"]))
        const times = atCs.map((d) => d.expectedDeparture)
        assert.deepStrictEqual(times, sorted(times))
        // De Bilt has no direct ride to Heidelberglaan.
        assert.deepStrictEqual(result.areas[DE_BILT], [])
    })
})

describe("network", () => {
    it("draws every bus and tram line and knows which lines serve each stop", () => {
        const network = buildNetwork(db)
        assert.strictEqual(network.shaped, false)
        const lines = network.lines.map((line) => line.line)
        assertIncludesAll(lines, ["20", "22", "28", "73", "77"])
        assert.ok(network.lines.every((line) => line.paths.length > 0))
        const heidelberglaan = network.stops.find((stop) => stop.id === HEIDELBERGLAAN)
        const served = heidelberglaan?.lines.map((index) => network.lines[index]?.line).sort()
        assertIncludesAll(served, ["20", "22", "28"])
        // Every stop area is drawn exactly once, inside one merged stop named after its first area.
        const areaIds = network.stops.flatMap((stop) => stop.areaIds)
        assert.strictEqual(new Set(areaIds).size, areaIds.length)
        assert.ok(network.stops.every((stop) => stop.areaIds[0] === stop.id))
    })

    it("lists what is reachable without changing", () => {
        const stops = repository.stopIdsInAreas([DE_BILT])
        const areas = new Set(repository.reachableFrom(stops, "20261112").map((row) => row.areaId))
        assert.strictEqual(areas.has(CS_CENTRUM), true)
        assert.strictEqual(areas.has(NIEUWEGEIN), true)
        assert.strictEqual(areas.has(HEIDELBERGLAAN), false)
    })

    it("lists where a destination is reached from, and which lines link two stops in that direction", () => {
        const routeLine = (routeId: string) =>
            buildNetwork(db).lines.find((line) => line.id === routeId)?.line
        const toDeBilt = repository.reachingTo(repository.stopIdsInAreas([DE_BILT]), "20261112")
        assert.strictEqual(new Set(toDeBilt.map((row) => row.areaId)).has(CS_CENTRUM), true)
        assert.deepStrictEqual(
            new Set(toDeBilt.map((row) => routeLine(row.routeId))),
            new Set(["73", "77"]),
        )

        // CS to Heidelberglaan: lines 20, 22 and 28, each only between boarding and getting off.
        const pairs = repository
            .findCandidates(
                repository.stopIdsInAreas([CS_CENTRUM]),
                repository.stopIdsInAreas([HEIDELBERGLAAN]),
                "20261112",
                0,
                4e9,
            )
            .map((candidate) => ({
                routeId: candidate.routeId,
                fromStopId: candidate.fromStopId,
                toStopId: candidate.toStopId,
            }))
        const segments = rideSegments(db, pairs)
        assert.deepStrictEqual(
            new Set(segments.map((segment) => routeLine(segment.routeId))),
            new Set(["20", "22", "28"]),
        )
        const tram20 = segments.find((segment) => routeLine(segment.routeId) === "20")
        // Line 20 starts in Nieuwegein, but the ride starts at CS and ends at Heidelberglaan, not P+R Science Park.
        assert.deepStrictEqual(tram20?.areaIds, [
            CS_CENTRUM,
            "stoparea:galgenwaard",
            HEIDELBERGLAAN,
        ])
        assert.deepStrictEqual(tram20?.path[0], [52.0905, 5.1128])
    })
})

describe("realtime", () => {
    it("applies delays and cancellations from a GTFS-realtime feed", async () => {
        const planned = await board(CS_CENTRUM, HEIDELBERGLAAN)
        const [delayed, cancelled] = planned.departures.filter((d) => d.line === "22")
        if (!delayed || !cancelled) throw new Error("expected two tram departures in the fixture")

        const { transit_realtime: rt } = GtfsRealtimeBindings
        const bytes = rt.FeedMessage.encode(
            rt.FeedMessage.create({
                header: {
                    gtfsRealtimeVersion: "2.0",
                    timestamp: Math.floor(AFTERNOON.getTime() / 1000),
                },
                entity: [
                    {
                        id: "1",
                        tripUpdate: {
                            trip: { tripId: delayed.tripId, startDate: "20261112" },
                            // Line 22 leaves CS at stop_sequence 1; the delay must carry to Heidelberglaan (3).
                            stopTimeUpdate: [{ stopSequence: 1, departure: { delay: 240 } }],
                        },
                    },
                    {
                        id: "2",
                        tripUpdate: {
                            trip: {
                                tripId: cancelled.tripId,
                                startDate: "20261112",
                                scheduleRelationship:
                                    rt.TripDescriptor.ScheduleRelationship.CANCELED,
                            },
                        },
                    },
                ],
            }),
        ).finish()

        const snapshot = decodeTripUpdates(bytes)
        const live = await board(CS_CENTRUM, HEIDELBERGLAAN, AFTERNOON, {
            snapshot: async () => snapshot,
        })
        assert.strictEqual(live.realtime, "live")

        const delayedNow = live.departures.find((d) => d.tripId === delayed.tripId)
        assert.strictEqual(delayedNow?.expectedDeparture, delayed.plannedDeparture + 240)
        assert.strictEqual(delayedNow?.expectedArrival, delayed.plannedArrival + 240)

        const cancelledNow = live.departures.find((d) => d.tripId === cancelled.tripId)
        assert.strictEqual(cancelledNow?.cancelled, true)
        assert.strictEqual(cancelledNow?.firstToArrive, false)
    })

    it("falls back to the timetable when the feed is down", async () => {
        const result = await board(CS_CENTRUM, HEIDELBERGLAAN, AFTERNOON, {
            snapshot: async () => null,
        })
        assert.strictEqual(result.realtime, "unavailable")
        assert.ok(result.departures.length > 0)
    })
})
