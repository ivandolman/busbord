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

    it("draws a road that parts around an island as one strand", () => {
        // The way back swings 40 m north for ~200 m, as around a stop island, and rejoins.
        const north = 40 / 111_320
        const back = road(0, true).map(([lat, lon]): LatLon =>
            lon > 5.0035 && lon < 5.0065 ? [lat + north, lon] : [lat, lon],
        )
        const corridors = buildCorridors([{ index: 0, paths: [road(0), back] }])
        const points = corridors.flatMap((corridor) => corridor.path)
        // Within a few metres of the road (node positions average the points snapped to them).
        assert.ok(points.every(([lat]) => Math.abs(lat - 52) * 111_320 < 10))
    })

    it("rounds a sharp corner but keeps the ends in place", () => {
        const corner: LatLon[] = [
            [52, 5],
            [52, 5.004],
            [52.003, 5.004],
        ]
        const [corridor] = buildCorridors([{ index: 0, paths: [corner] }])
        const path = corridor?.path ?? []
        assert.ok(path.length > 3)
        assert.ok(!path.some(([lat, lon]) => lat === 52 && lon === 5.004))
        const meters = (a: LatLon | undefined, b: LatLon) =>
            a ? Math.hypot((a[0] - b[0]) * 111_320, (a[1] - b[1]) * 68_500) : Infinity
        const [first, last] = [path[0], path[path.length - 1]]
        const nearStart = (p: LatLon | undefined) => meters(p, [52, 5]) < 15
        const nearEnd = (p: LatLon | undefined) => meters(p, [52.003, 5.004]) < 15
        assert.ok((nearStart(first) && nearEnd(last)) || (nearStart(last) && nearEnd(first)))
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
