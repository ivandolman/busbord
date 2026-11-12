// Unit tests for merging line paths into shared corridors

import assert from "node:assert"
import { describe, it } from "node:test"

import { buildCorridors } from "@/features/network/corridors"
import type { LatLon } from "@/features/roads/router"

// --- HELPERS ---

/** A straight east-west road ~700 m long, `north` metres north of latitude 52. */
function road(north: number, reverse = false): LatLon[] {
    const lat = 52 + north / 111_320
    const path: LatLon[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => [lat, 5 + i * 0.001])
    return reverse ? path.reverse() : path
}

// --- TESTS ---

describe("buildCorridors", () => {
    it("draws both directions of a line on a dual carriageway as one corridor", () => {
        const corridors = buildCorridors([{ index: 0, paths: [road(0), road(12, true)] }])
        assert.strictEqual(corridors.length, 1)
        assert.deepStrictEqual(corridors[0]?.lines, [0])
    })

    it("puts lines along the same road in one corridor, in the given order", () => {
        const corridors = buildCorridors([
            { index: 7, paths: [road(0)] },
            { index: 3, paths: [road(5, true)] },
        ])
        assert.strictEqual(corridors.length, 1)
        assert.deepStrictEqual(corridors[0]?.lines, [7, 3])
    })

    it("keeps lines on parallel streets apart", () => {
        const corridors = buildCorridors([
            { index: 0, paths: [road(0)] },
            { index: 1, paths: [road(60)] },
        ])
        assert.strictEqual(corridors.length, 2)
    })

    it("splits a corridor where a line turns off", () => {
        const branch: LatLon[] = [
            [52, 5.005],
            [52.003, 5.005],
            [52.006, 5.005],
        ]
        const corridors = buildCorridors([
            { index: 0, paths: [road(0)] },
            { index: 1, paths: [road(0).slice(0, 6), branch] },
        ])
        const shared = corridors.filter((corridor) => corridor.lines.length === 2)
        assert.strictEqual(shared.length, 1)
        assert.ok(corridors.some((c) => c.lines.length === 1 && c.lines[0] === 1))
    })
})
