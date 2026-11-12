// Unit tests for path simplification and shape clipping

import assert from "node:assert"
import { describe, it } from "node:test"

import { clipShape, simplifyPath } from "@/features/network/patterns"

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
})
