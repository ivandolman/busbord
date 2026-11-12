// Unit tests for map point ids

import assert from "node:assert"
import { describe, it } from "node:test"

import { parsePointId, pointId } from "@/lib/place"

describe("map points", () => {
    it("round-trips and rejects anything else", () => {
        assert.deepStrictEqual(parsePointId(pointId({ lat: 52.0853, lon: 5.1727 })), {
            lat: 52.0853,
            lon: 5.1727,
        })
        assert.strictEqual(parsePointId("@95,5"), null)
        assert.strictEqual(parsePointId("stoparea:1"), null)
        assert.strictEqual(parsePointId("@52.1,5.1;drop"), null)
    })
})
