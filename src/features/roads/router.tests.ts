// Unit tests for the road router: driving, tram tracks, walking distances and walking areas

import assert from "node:assert"
import { describe, it } from "node:test"

import {
    EDGE_CLASSES,
    FOOT_CLASS,
    TRAM_CLASS,
    type RoadNetwork,
} from "@/features/roads/road-network"
import { RoadRouter, type LatLon } from "@/features/roads/router"

// --- CONSTANTS ---

const RESIDENTIAL = EDGE_CLASSES.findIndex(([name]) => name === "residential")

// --- HELPERS ---

/**
 * A 3x2 ladder, ~110 m between rungs:
 *   0 - 1 - 2      top street (two-way)
 *   |   |   |
 *   3 - 4 - 5      bottom street, one-way 5 → 3 (westbound only)
 * plus a tram track 6 - 7 alongside.
 */
function ladder(): RoadNetwork {
    const lat = [52.002, 52.002, 52.002, 52.001, 52.001, 52.001, 52.0005, 52.0005]
    const lon = [5.0, 5.0016, 5.0032, 5.0, 5.0016, 5.0032, 5.0, 5.0032]
    const edges: [number, number, number, number][] = [
        [0, 1, RESIDENTIAL, 0],
        [1, 2, RESIDENTIAL, 0],
        [0, 3, RESIDENTIAL, 0],
        [1, 4, RESIDENTIAL, 0],
        [2, 5, RESIDENTIAL, 0],
        [5, 4, RESIDENTIAL, 1],
        [4, 3, RESIDENTIAL, 1],
        [6, 7, TRAM_CLASS, 0],
    ]
    return {
        lat: Float64Array.from(lat),
        lon: Float64Array.from(lon),
        edgeFrom: Uint32Array.from(edges.map((edge) => edge[0])),
        edgeTo: Uint32Array.from(edges.map((edge) => edge[1])),
        edgeClass: Uint8Array.from(edges.map((edge) => edge[2])),
        edgeOneway: Uint8Array.from(edges.map((edge) => edge[3])),
    }
}

const passesThrough = (path: LatLon[], lat: number, lon: number) =>
    path.some(([y, x]) => Math.abs(y - lat) < 1e-7 && Math.abs(x - lon) < 1e-7)

// --- TESTS ---

describe("road router", () => {
    const router = new RoadRouter(ladder())

    it("drives along the one-way street only in its direction", () => {
        const westbound = router.route("road", [52.001, 5.003], [52.001, 5.0002])
        assert.notStrictEqual(westbound, null)
        assert.strictEqual(
            westbound?.every(([y]) => y <= 52.0010001),
            true,
        )

        // Eastbound on the bottom street is not allowed, so the route climbs to the top street.
        const eastbound = router.route("road", [52.001, 5.0002], [52.001, 5.003])
        assert.notStrictEqual(eastbound, null)
        assert.strictEqual(passesThrough(eastbound ?? [], 52.002, 5.0016), true)
    })

    it("follows a hint when two roads are equally short", () => {
        const viaTop = router.route(
            "road",
            [52.0015, 5.0],
            [52.0015, 5.0032],
            [
                [52.0015, 5.0],
                [52.002, 5.0],
                [52.002, 5.0032],
                [52.0015, 5.0032],
            ],
        )
        assert.strictEqual(passesThrough(viaTop ?? [], 52.002, 5.0016), true)
    })

    it("keeps trams on the tracks and buses off them", () => {
        assert.notStrictEqual(router.route("tram", [52.0005, 5.0001], [52.0005, 5.003]), null)
        assert.strictEqual(router.route("tram", [52.002, 5.0], [52.002, 5.0032]), null)
    })

    it("gives up on points far from any road", () => {
        assert.strictEqual(router.route("road", [52.05, 5.0], [52.002, 5.0032]), null)
    })

    it("walks both ways along one-way streets, never along tram tracks, and takes footpaths", () => {
        // Bottom street is one-way westbound for traffic; on foot it is the direct way east.
        const [east] = router.walkDistances([52.001, 5.0], [[52.001, 5.0032]], 2000)
        assert.ok(typeof east === "number" && east > 210, `expected ${east} > 210`)
        assert.ok(east < 230, `expected ${east} < 230`)
        // The far end of the tram track is only reachable by tram.
        const tramEnd = router.walkDistances([52.002, 5.0], [[52.0005, 5.0032]], 2000)[0]
        assert.ok(typeof tramEnd === "number" && tramEnd > 55 + 220, `expected ${tramEnd} > 275`)
        // Beyond the limit: no answer.
        assert.strictEqual(router.walkDistances([52.001, 5.0], [[52.002, 5.0032]], 100)[0], null)

        const withPath = ladder()
        const footpath: RoadNetwork = {
            ...withPath,
            edgeFrom: Uint32Array.from([...withPath.edgeFrom, 3]),
            edgeTo: Uint32Array.from([...withPath.edgeTo, 2]),
            edgeClass: Uint8Array.from([...withPath.edgeClass, FOOT_CLASS]),
            edgeOneway: Uint8Array.from([...withPath.edgeOneway, 0]),
        }
        const walking = new RoadRouter(footpath)
        // The diagonal path (3 → 2) is shorter than round the block…
        const diagonal = walking.walkDistances([52.001, 5.0], [[52.002, 5.0032]], 2000)[0]
        assert.ok(typeof diagonal === "number" && diagonal < 250, `expected ${diagonal} < 250`)
        // The walking area reaches along the streets, but not beyond the budget.
        const area = router.walkArea([52.001, 5.0], 150)
        assert.ok(area && area.length >= 3, `expected at least 3 points, got ${area?.length}`)
        const furthest = Math.max(
            ...(area ?? []).map(([y, x]) =>
                Math.hypot((y - 52.001) * 111_320, (x - 5.0) * 111_320 * 0.6157),
            ),
        )
        assert.ok(furthest > 100, `expected ${furthest} > 100`)
        assert.ok(furthest <= 151, `expected ${furthest} <= 151`)
        assert.strictEqual(router.walkArea([52.05, 5.0], 150), null)
        // …but buses never use it.
        const drive = walking.route("road", [52.001, 5.0], [52.002, 5.0032])
        assert.strictEqual(passesThrough(drive ?? [], 52.002, 5.0), true)
    })

    it("starts a walk on the connected paths, not on an island in the map data", () => {
        // A loose path (8 - 9), like a station platform drawn without its stairs, 22 m north of
        // the bottom street. A point on it would otherwise reach nothing at all.
        const base = ladder()
        const island: RoadNetwork = {
            lat: Float64Array.from([...base.lat, 52.0012, 52.0012]),
            lon: Float64Array.from([...base.lon, 5.0008, 5.001]),
            edgeFrom: Uint32Array.from([...base.edgeFrom, 8]),
            edgeTo: Uint32Array.from([...base.edgeTo, 9]),
            edgeClass: Uint8Array.from([...base.edgeClass, FOOT_CLASS]),
            edgeOneway: Uint8Array.from([...base.edgeOneway, 0]),
        }
        const [walk] = new RoadRouter(island).walkDistances(
            [52.0012, 5.0009],
            [[52.002, 5.0016]],
            2000,
        )
        assert.ok(
            typeof walk === "number" && walk < 250,
            `expected a walk under 250 m, got ${walk}`,
        )
    })
})
