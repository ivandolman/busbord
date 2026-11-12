// Unit tests for locating stops along a line's shape and slicing a ride out of it

import assert from "node:assert"
import { describe, it } from "node:test"

import { locateStops, locateStopsOnPath, slicePath } from "@/features/roads/line-path"
import type { LatLon } from "@/features/roads/router"

// --- HELPERS ---

/** Passes when `actual` is within half a unit of the given decimal digit of `expected`. */
function assertCloseTo(actual: number | undefined, expected: number, digits: number) {
    assert.ok(
        typeof actual === "number" && Math.abs(actual - expected) < 10 ** -digits / 2,
        `expected ${actual} to be close to ${expected}`,
    )
}

// --- TESTS ---

describe("locateStops", () => {
    it("matches the right pass of a line that returns to where it started", () => {
        // Out east and back west along the same street: the last stop is the start again.
        const shape: LatLon[] = [0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1, 0].map((step) => [
            52,
            5 + step * 0.002,
        ])
        const at = locateStops(shape, [
            [52, 5],
            [52, 5.012],
            [52, 5],
        ])
        assert.deepStrictEqual(at, [0, 6, 12])
    })
})

describe("locateStopsOnPath", () => {
    it("cuts a ride exactly at its stops, also in the middle of a long straight segment", () => {
        // One straight street of ~1.4 km with no vertices between its ends, like a simplified path.
        const path: LatLon[] = [
            [52, 5],
            [52, 5.02],
        ]
        const stops: LatLon[] = [
            [52.0001, 5.005],
            [52.0001, 5.015],
        ]
        const [from, to] = locateStopsOnPath(path, stops)
        if (!from || !to) throw new Error("stops not located")
        const ride = slicePath(path, from, to)
        assert.strictEqual(ride.length, 2)
        assertCloseTo(ride[0]?.[1], 5.005, 6)
        assertCloseTo(ride[1]?.[1], 5.015, 6)
    })
})
