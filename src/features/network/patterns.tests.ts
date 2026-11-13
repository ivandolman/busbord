// Unit tests for path simplification and shape clipping

import assert from "node:assert"
import { describe, it } from "node:test"

import { clipShape, cutDetours, simplifyPath } from "@/features/network/patterns"

describe("shapes", () => {
    it("drops points on a straight line and cuts a shape to the stops we keep", () => {
        const straight: [number, number][] = [
            [52, 5],
            [52.001, 5],
            [52.002, 5],
            [52.003, 5.002],
        ]
        assert.deepStrictEqual(simplifyPath(straight, 5), [
            [52, 5],
            [52.002, 5],
            [52.003, 5.002],
        ])
        const shape: [number, number][] = [
            [51.9, 5],
            [52, 5],
            [52.1, 5],
            [52.2, 5],
        ]
        assert.deepStrictEqual(clipShape(shape, [52.001, 5], [52.099, 5]), [
            [52, 5],
            [52.1, 5],
        ])
    })

    it("cuts a loop around a block but keeps corners and stops", () => {
        // Westplein, Utrecht: routing circled a block instead of turning (line 500).
        const loop: [number, number][] = [
            [52.08955, 5.10521],
            [52.08944, 5.10501],
            [52.08944, 5.10447],
            [52.08958, 5.1043],
            [52.09022, 5.10444],
            [52.08939, 5.10345],
            [52.08928, 5.10326],
            [52.08859, 5.1013],
        ]
        const cut = cutDetours(loop, [])
        assert.ok(!cut.some(([lat]) => lat > 52.09), "the loop north is gone")
        assert.deepStrictEqual(cut[0], loop[0])
        assert.deepStrictEqual(cut.at(-1), loop.at(-1))

        const corner: [number, number][] = [
            [52, 5],
            [52.001, 5],
            [52.001, 5.0015],
            [52.001, 5.003],
        ]
        assert.deepStrictEqual(cutDetours(corner, []), corner)

        assert.deepStrictEqual(cutDetours(loop, [[52.09025, 5.10446]]), loop)
    })
})
