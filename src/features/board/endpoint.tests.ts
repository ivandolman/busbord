// Unit tests for turning an origin or destination into the platforms that count

import assert from "node:assert"
import { describe, it } from "node:test"

import type { TimetableRepository } from "@/features/board/board.repository"
import { resolveEndpoint } from "@/features/board/endpoint"
import type { Walker } from "@/features/roads/walking"

// --- HELPERS ---

/** Two platforms ~110 and ~220 m east of the point 52,5. */
const repository = {
    nearestArea: () => ({
        id: "a",
        name: "Utrecht, Centraal",
        lat: 52,
        lon: 5.0016,
        departures: 1,
    }),
    stopsNear: () =>
        new Map([
            ["s1", 110],
            ["s2", 220],
        ]),
    stopPositions: () =>
        new Map([
            ["s1", [52, 5.0016]],
            ["s2", [52, 5.0032]],
        ]),
} as unknown as TimetableRepository

const walkerReaching = (distances: (number | null)[]): Walker => ({
    distances: () => distances,
    area: () => null,
    route: () => null,
})

// --- TESTS ---

describe("resolveEndpoint", () => {
    it("walks to the platforms along the paths when the walker reaches them", () => {
        const endpoint = resolveEndpoint(repository, "@52.00000,5.00000", {
            walking: true,
            role: "from",
            maxWalkMeters: 1000,
            walker: walkerReaching([150, null]),
        })
        assert.deepStrictEqual([...endpoint.walkMeters], [["s1", 150]])
    })

    it("estimates the walks when the walker reaches no platform at all", () => {
        // An unmapped station platform: every stop near, none on foot.
        const endpoint = resolveEndpoint(repository, "@52.00000,5.00000", {
            walking: true,
            role: "from",
            maxWalkMeters: 1000,
            walker: walkerReaching([null, null]),
        })
        assert.deepStrictEqual([...endpoint.walkMeters.keys()], ["s1", "s2"])
        assert.ok((endpoint.walkMeters.get("s1") ?? 0) > 110)
    })
})
