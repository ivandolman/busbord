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

    it("drops a short dead end past a junction when its lines go on along the road", () => {
        // Line 1 runs along the road, then ends 45 m up a side street off its middle.
        const up = (meters: number): LatLon => [52 + meters / 111_320, 5.005]
        const side = [...road(0).filter(([, lon]) => lon <= 5.005), up(15), up(30), up(45)]
        const corridors = buildCorridors([
            { index: 0, paths: [road(0)] },
            { index: 1, paths: [road(0), side] },
        ])
        assert.ok(corridors.every((corridor) => corridor.path.every(([lat]) => lat < 52.0002)))

        // A line found only up that side street keeps it.
        const own = buildCorridors([
            { index: 0, paths: [road(0)] },
            { index: 2, paths: [[up(0), up(15), up(30), up(45)]] },
        ])
        assert.ok(own.some((corridor) => corridor.lines.includes(2)))
    })

    it("drops rungs where a line between two carriageways snaps to the far one", () => {
        // Carriageways 27 m apart: too far to snap together. Line 1 runs along the southern one,
        // but every fourth point lies 16 m north, nearer the northern one.
        const between: LatLon[] = Array.from({ length: 41 }, (_, i) => [
            52 + (i % 4 === 2 ? 16 : 0) / 111_320,
            5 + i * 0.00025,
        ])
        const corridors = buildCorridors([
            { index: 0, paths: [road(0), road(27, true)] },
            { index: 1, paths: [between] },
        ])
        const across = corridors.filter((corridor) => {
            const lats = corridor.path.map(([lat]) => (lat - 52) * 111_320)
            return Math.max(...lats) - Math.min(...lats) > 10
        })
        assert.deepStrictEqual(across, [])
    })

    it("drops rungs of a line that runs along both carriageways", () => {
        // Line 0 runs both ways, one per carriageway; one way it strays towards the other one.
        const between: LatLon[] = Array.from({ length: 41 }, (_, i) => [
            52 + (i % 4 === 2 ? 16 : 0) / 111_320,
            5 + i * 0.00025,
        ])
        const corridors = buildCorridors([
            { index: 1, paths: [road(0), road(27, true)] },
            { index: 0, paths: [road(27, true), between] },
        ])
        const across = corridors.filter((corridor) => {
            const lats = corridor.path.map(([lat]) => (lat - 52) * 111_320)
            return Math.max(...lats) - Math.min(...lats) > 10
        })
        assert.deepStrictEqual(across, [])
    })

    it("keeps a turning loop at the end of a line whole", () => {
        // Out along one carriageway, back along the other, 27 m apart.
        const out = road(0).filter(([, lon]) => lon <= 5.005)
        const back = road(27, true).filter(([, lon]) => lon <= 5.005)
        const corridors = buildCorridors([{ index: 0, paths: [[...out, ...back]] }])
        const east = Math.max(
            ...corridors.flatMap((corridor) => corridor.path.map(([, lon]) => lon)),
        )
        assert.ok(east > 5.0045)
    })

    it("keeps a short spur where a line starts or ends", () => {
        const up = (meters: number): LatLon => [52 + meters / 111_320, 5.005]
        const corridors = buildCorridors([
            { index: 0, paths: [road(0)] },
            { index: 1, paths: [[up(0), up(15), up(30)]] },
        ])
        assert.ok(corridors.some((corridor) => corridor.lines.includes(1)))
    })
})
