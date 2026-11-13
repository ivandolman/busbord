// Unit tests for map point ids and platform places

import assert from "node:assert"
import { describe, it } from "node:test"

import { parsePlatformQuery, parsePointId, platformPlace, pointId } from "@/lib/place"

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

describe("platform places", () => {
    it("names a platform after its station and starts at the platform", () => {
        assert.deepStrictEqual(
            platformPlace({ name: "Utrecht Centraal" }, { code: "5", lat: 52.0893, lon: 5.1101 }),
            { id: "@52.08930,5.11010", name: "Utrecht Centraal, spoor 5" },
        )
    })

    it("reads a platform from a typed search", () => {
        assert.deepStrictEqual(parsePlatformQuery("utrecht centraal spoor 5"), {
            station: "utrecht centraal",
            code: "5",
        })
        assert.deepStrictEqual(parsePlatformQuery("Amersfoort Spoor 4B "), {
            station: "Amersfoort",
            code: "4b",
        })
        assert.deepStrictEqual(parsePlatformQuery("utrecht cs spoor5"), {
            station: "utrecht cs",
            code: "5",
        })
        assert.strictEqual(parsePlatformQuery("spoor 5"), null)
        assert.strictEqual(parsePlatformQuery("utrecht centraal"), null)
        assert.strictEqual(parsePlatformQuery("Spoorstraat"), null)
    })
})
