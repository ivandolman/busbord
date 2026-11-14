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

    it("keeps squares and pedestrian areas as areas to cross", () => {
        assert.deepStrictEqual(classifyWay(tags({ highway: "pedestrian", area: "yes" })), {
            roadClass: FOOT_CLASS,
            oneway: 0,
            area: true,
        })
        assert.strictEqual(
            classifyWay(tags({ highway: "footway", area: "yes", access: "no" })),
            null,
        )
        // A road drawn as an area is still left out.
        assert.strictEqual(classifyWay(tags({ highway: "residential", area: "yes" })), null)
    })

    it("keeps a footpath that is closed to traffic but open to walkers", () => {
        assert.strictEqual(
            classifyWay(tags({ highway: "path", access: "no", foot: "designated" }))?.roadClass,
            FOOT_CLASS,
        )
        assert.strictEqual(
            classifyWay(tags({ highway: "track", access: "agricultural" }))?.roadClass,
            FOOT_CLASS,
        )
    })

    it("keeps roads closed to walkers for buses only", () => {
        assert.strictEqual(classifyWay(tags({ highway: "primary", foot: "no" }))?.noFoot, true)
        assert.strictEqual(
            classifyWay(tags({ highway: "primary", motorroad: "yes" }))?.noFoot,
            true,
        )
        assert.strictEqual(classifyWay(tags({ highway: "busway" }))?.noFoot, true)
        assert.strictEqual(
            classifyWay(tags({ highway: "service", access: "no", bus: "designated" }))?.noFoot,
            true,
        )
        assert.strictEqual(classifyWay(tags({ highway: "busway", foot: "yes" }))?.noFoot, undefined)
        assert.strictEqual(classifyWay(tags({ highway: "residential" }))?.noFoot, undefined)
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
