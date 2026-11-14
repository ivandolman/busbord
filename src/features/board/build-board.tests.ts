// Unit tests for ranking, summarising and choosing departures on a board

import assert from "node:assert"
import { describe, it } from "node:test"

import type { Departure } from "@/features/board/board.types"
import {
    minutesToWalkMeters,
    pickBestPairPerTrip,
    rankDepartures,
    secondsPerMeter,
    summarise,
    walkSeconds,
    worthwhileRides,
} from "@/features/board/build-board"

// --- HELPERS ---

const departure = (line: string, dep: number, arr: number, cancelled = false): Departure => ({
    tripId: `${line}-${dep}`,
    line,
    mode: "bus",
    headsign: "",
    from: { stopId: "a", name: "A", platform: "", lat: 52, lon: 5, walkMeters: 0 },
    to: { stopId: "b", name: "B", platform: "", lat: 52.01, lon: 5, walkMeters: 0 },
    plannedDeparture: dep,
    plannedArrival: arr,
    expectedDeparture: dep,
    expectedArrival: arr,
    cancelled,
    walkToSeconds: 0,
    walkFromSeconds: 0,
    leaveAt: dep,
    doorArrival: arr,
    catchable: true,
    overtakenBy: null,
    firstToArrive: false,
})

// --- TESTS ---

describe("rankDepartures", () => {
    it("counts the walk at both ends and skips buses you cannot walk to in time", () => {
        // 28 arrives first at its stop, but that stop is a 10-minute walk from where you want to be.
        const far = { ...departure("28", 120, 900), walkFromSeconds: 600, doorArrival: 1500 }
        const near = departure("20", 180, 1200)
        // 22 would be fastest, but it leaves before you can reach its stop.
        const missed = {
            ...departure("22", 60, 700),
            walkToSeconds: 300,
            leaveAt: -240,
            catchable: false,
        }
        const ranked = rankDepartures([far, near, missed])
        assert.strictEqual(ranked.find((d) => d.line === "28")?.overtakenBy, "20")
        assert.strictEqual(ranked.find((d) => d.line === "20")?.firstToArrive, true)
        assert.strictEqual(ranked.find((d) => d.line === "22")?.firstToArrive, false)
        // 800 m of walking at 5 km/h is 9.6 minutes, shown as 10.
        assert.strictEqual(walkSeconds(800), 600)
    })

    it("walks at the traveller's pace", () => {
        // 800 m at 4 km/h is 12 minutes, at 6 km/h 8 minutes.
        assert.strictEqual(walkSeconds(800, secondsPerMeter(4)), 720)
        assert.strictEqual(walkSeconds(800, secondsPerMeter(6)), 480)
        // A faster walker gets further in the same 12 minutes.
        assert.strictEqual(minutesToWalkMeters(12, secondsPerMeter(6)), 1200)
        assert.strictEqual(minutesToWalkMeters(12), 1000)
    })

    it("flags a departure that a later one beats to the destination", () => {
        const ranked = rankDepartures([
            departure("28", 180, 1560),
            departure("20", 360, 1380),
            departure("22", 120, 1140),
        ])
        assert.deepStrictEqual(
            ranked.map((d) => d.line),
            ["22", "28", "20"],
        )
        assert.deepStrictEqual(
            ranked.map((d) => d.overtakenBy),
            [null, "20", null],
        )
        assert.deepStrictEqual(
            ranked.map((d) => d.firstToArrive),
            [true, false, false],
        )
    })

    it("ignores cancelled trips when deciding who overtakes whom", () => {
        const ranked = rankDepartures([
            departure("28", 180, 1560),
            departure("20", 360, 1380, true),
        ])
        assert.strictEqual(ranked[0]?.overtakenBy, null)
        assert.strictEqual(ranked[0]?.firstToArrive, true)
        assert.strictEqual(ranked[1]?.firstToArrive, false)
    })
})

describe("summarise", () => {
    it("reports the typical gap between useful departures", () => {
        const ranked = rankDepartures(
            [0, 300, 600, 900, 1200].map((t) => departure("1", t, t + 600)),
        )
        assert.deepStrictEqual(summarise(ranked, 0), {
            lines: [{ line: "1", mode: "bus" }],
            headwayMinutes: 5,
        })
    })

    it("stays silent when there is too little to go on", () => {
        assert.strictEqual(
            summarise(rankDepartures([departure("1", 0, 600)]), 0).headwayMinutes,
            null,
        )
    })
})

describe("pickBestPairPerTrip", () => {
    const stop = (toStopId: string, arrival: number) => ({
        tripId: "55-1",
        routeId: "55",
        serviceDate: "20261112",
        line: "55",
        mode: "bus" as const,
        headsign: "",
        fromStopId: "a",
        fromSeq: 1,
        toStopId,
        toSeq: toStopId === "near" ? 3 : 2,
        plannedDeparture: 0,
        plannedArrival: arrival,
    })

    it("prefers less walking when door-to-door times are within two minutes", () => {
        // Wittevrouwenbrug: 355 m (~5:20 walk). Kleinesingel: 2 min later, 238 m (~3:34): 14 s slower.
        const walk = new Map([
            ["far", 355],
            ["near", 238],
        ])
        const [picked] = pickBestPairPerTrip([stop("far", 600), stop("near", 720)], new Map(), walk)
        assert.strictEqual(picked?.toStopId, "near")
    })

    it("still takes the quicker stop when the difference is two minutes or more", () => {
        const walk = new Map([
            ["far", 355],
            ["near", 238],
        ])
        const [picked] = pickBestPairPerTrip([stop("far", 600), stop("near", 840)], new Map(), walk)
        assert.strictEqual(picked?.toStopId, "far")
    })

    it("follows the chosen tie: 0 is always the quickest, a larger one walks less", () => {
        const walk = new Map([
            ["far", 355],
            ["near", 238],
        ])
        const candidates = [stop("far", 600), stop("near", 720)]
        assert.strictEqual(pickBestPairPerTrip(candidates, new Map(), walk, 0)[0]?.toStopId, "far")
        assert.strictEqual(
            pickBestPairPerTrip([stop("far", 600), stop("near", 840)], new Map(), walk, 5 * 60)[0]
                ?.toStopId,
            "near",
        )
    })
})

describe("worthwhileRides", () => {
    it("drops a ring line going the long way round but keeps reasonable alternatives", () => {
        const trip = (routeId: string, dep: number, minutes: number, toStopId = "b") => ({
            tripId: `${routeId}-${dep}`,
            routeId,
            serviceDate: "20261112",
            line: routeId,
            mode: "bus" as const,
            headsign: "",
            fromStopId: "a",
            fromSeq: 1,
            toStopId,
            toSeq: 2,
            plannedDeparture: dep,
            plannedArrival: dep + minutes * 60,
        })
        const kept = worthwhileRides(
            [
                trip("direct", 0, 7),
                trip("direct", 600, 8),
                trip("slower", 0, 14),
                trip("ring", 0, 31),
                // Getting off at a stop a 1,100 m walk away (13 minutes) makes this one too slow as well.
                trip("far", 0, 5, "c"),
            ],
            new Map(),
            new Map([["c", 1100]]),
        )
        assert.deepStrictEqual([...new Set(kept.map((t) => t.routeId))], ["direct", "slower"])
    })
})
