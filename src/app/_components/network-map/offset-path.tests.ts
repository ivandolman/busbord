// Unit tests for shifting a screen polyline sideways

import assert from "node:assert"
import { describe, it } from "node:test"

import { offsetPath } from "@/app/_components/network-map/offset-path"

describe("offsetPath", () => {
    it("moves a straight line sideways by the distance", () => {
        assert.deepStrictEqual(
            offsetPath(
                [
                    [0, 0],
                    [10, 0],
                ],
                2,
            ),
            [
                [0, 2],
                [10, 2],
            ],
        )
    })

    it("keeps the same gap around a right-angle bend", () => {
        const [, corner] = offsetPath(
            [
                [0, 0],
                [10, 0],
                [10, 10],
            ],
            -2,
        )
        // The mitred corner sits 2 px from both legs.
        assert.ok(corner)
        assert.ok(Math.abs(corner[0] - 12) < 1e-9 && Math.abs(corner[1] + 2) < 1e-9)
    })

    it("skips repeated points", () => {
        const shifted = offsetPath(
            [
                [0, 0],
                [0, 0],
                [0, 10],
            ],
            1,
        )
        assert.deepStrictEqual(shifted[0], [-1, 0])
        assert.deepStrictEqual(shifted[1], [-1, 0])
    })
})
