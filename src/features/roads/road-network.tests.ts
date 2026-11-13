// Unit tests for classifying OSM ways into road classes and one-way rules

import assert from "node:assert"
import { describe, it } from "node:test"

import { classifyWay, FOOT_CLASS, TRAM_CLASS } from "@/features/roads/road-network"

describe("classifyWay", () => {
    const tags = (entries: Record<string, string>) => new Map(Object.entries(entries))

    it("keeps bus lanes and tram tracks, keeps footpaths for walking, drops private roads", () => {
        assert.notStrictEqual(classifyWay(tags({ highway: "busway" })), null)
        assert.notStrictEqual(
            classifyWay(tags({ highway: "service", access: "no", bus: "designated" })),
            null,
        )
        assert.strictEqual(classifyWay(tags({ railway: "tram" }))?.roadClass, TRAM_CLASS)
        // Footpaths are kept for walking only (the bus graph leaves them out).
        assert.strictEqual(classifyWay(tags({ highway: "footway" }))?.roadClass, FOOT_CLASS)
        assert.strictEqual(classifyWay(tags({ highway: "footway", access: "private" })), null)
        assert.strictEqual(
            classifyWay(tags({ railway: "platform", area: "yes" }))?.roadClass,
            FOOT_CLASS,
        )
        assert.strictEqual(classifyWay(tags({ highway: "platform" }))?.roadClass, FOOT_CLASS)
        assert.strictEqual(classifyWay(tags({ railway: "platform", access: "no" })), null)
        assert.strictEqual(classifyWay(tags({ highway: "cycleway", foot: "no" })), null)
        assert.strictEqual(classifyWay(tags({ highway: "residential", access: "private" })), null)
        assert.strictEqual(
            classifyWay(tags({ highway: "service", service: "parking_aisle" })),
            null,
        )
    })

    it("reads one-way rules, including buses that may ignore them", () => {
        assert.strictEqual(classifyWay(tags({ highway: "primary", oneway: "yes" }))?.oneway, 1)
        assert.strictEqual(classifyWay(tags({ highway: "primary", oneway: "-1" }))?.oneway, -1)
        assert.strictEqual(
            classifyWay(tags({ highway: "primary", junction: "roundabout" }))?.oneway,
            1,
        )
        assert.strictEqual(
            classifyWay(tags({ highway: "primary", oneway: "yes", "oneway:bus": "no" }))?.oneway,
            0,
        )
    })
})
