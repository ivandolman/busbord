// Unit tests for the board overview: the pick, what comes next and the line groups

import assert from "node:assert"
import { describe, it } from "node:test"

import type { Departure } from "@/features/board/board.types"
import { rankDepartures } from "@/features/board/build-board"
import { overview } from "@/features/board/group"

// --- HELPERS ---

const departure = (line: string, dep: number, arr: number, headsign: string): Departure => ({
    tripId: `${line}-${dep}`,
    line,
    mode: "bus",
    headsign,
    from: { stopId: "a", name: "A", platform: "", lat: 52, lon: 5, walkMeters: 0 },
    to: { stopId: "b", name: "B", platform: "", lat: 52.01, lon: 5, walkMeters: 0 },
    plannedDeparture: dep,
    plannedArrival: arr,
    expectedDeparture: dep,
    expectedArrival: arr,
    cancelled: false,
    walkToSeconds: 0,
    walkFromSeconds: 0,
    leaveAt: dep,
    doorArrival: arr,
    catchable: true,
    overtakenBy: null,
    firstToArrive: false,
})

// --- TESTS ---

describe("board overview", () => {
    it("picks the first useful departure and lists each line and direction once", () => {
        const ranked = rankDepartures([
            departure("28", 180, 1560, "Utrecht, Vleuterweide"),
            departure("20", 360, 1380, "Nieuwegein"),
            departure("22", 120, 1140, "Utrecht, P+R Science Park"),
            departure("22", 720, 1740, "Utrecht, P+R Science Park"),
            departure("28", 900, 2280, "Utrecht, Vleuterweide"),
        ])
        const result = overview(ranked, "Utrecht, CS Centrumzijde")
        assert.strictEqual(result.pick?.line, "22")
        assert.deepStrictEqual(
            result.then.map((d) => d.line),
            ["20", "22"],
        )
        assert.deepStrictEqual(
            result.groups.map((g) => `${g.line} ${g.direction}`),
            ["22 P+R Science Park", "20 Nieuwegein", "28 Vleuterweide"],
        )
        // The first 28 is beaten by tram 20, so the group's best is the later 28 and it comes last.
        assert.strictEqual(result.groups[2]?.best?.tripId, "28-900")
        assert.strictEqual(result.groups[0]?.departures.length, 2)
    })

    describe("less walking may arrive a little later", () => {
        // 12 walks 8 minutes and gets you there 1 minute sooner than 22, which walks 2 minutes.
        const walky = { ...departure("12", 600, 1800, "Zuid"), walkToSeconds: 480, leaveAt: 120 }
        const calm = {
            ...departure("22", 180, 1740, "Noord"),
            walkToSeconds: 120,
            leaveAt: 60,
            doorArrival: 1860,
        }

        it("picks the calmer bus within the margin", () => {
            const ranked = rankDepartures([walky, calm], 180)
            assert.strictEqual(ranked.find((d) => d.line === "22")?.overtakenBy, null)
            assert.strictEqual(overview(ranked, "Utrecht", 2, 180).pick?.line, "22")
        })

        it("picks the quickest without a margin", () => {
            const ranked = rankDepartures([walky, calm], 0)
            assert.strictEqual(ranked.find((d) => d.line === "22")?.overtakenBy, "12")
            assert.strictEqual(overview(ranked, "Utrecht", 2, 0).pick?.line, "12")
        })

        it("picks the quickest when the calmer bus is later than the margin", () => {
            const late = { ...calm, doorArrival: 2040 }
            const ranked = rankDepartures([walky, late], 180)
            assert.strictEqual(ranked.find((d) => d.line === "22")?.overtakenBy, "12")
            assert.strictEqual(overview(ranked, "Utrecht", 2, 180).pick?.line, "12")
        })
    })
})
