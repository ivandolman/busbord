// Unit tests for the place search list: stops, platforms and addresses in one order

import assert from "node:assert"
import { describe, it } from "node:test"

import {
    looksLikeAddress,
    mergeSearchResults,
    type PlaceSuggestion,
} from "@/features/board/search-results"
import type { Address } from "@/features/geocode/geocode.schema"

// --- HELPERS ---

const stop = (name: string): PlaceSuggestion => ({ id: `area:${name}`, name, kind: "stop" })

const address = (name: string, lat = 52.09, lon = 5.12): Address => ({
    name,
    postcode: "3511AM",
    lat,
    lon,
})

// --- TESTS ---

describe("looksLikeAddress", () => {
    it("recognises a street with a house number", () => {
        assert.ok(looksLikeAddress("Oudegracht 10a utrecht"))
    })

    it("recognises a postcode", () => {
        assert.ok(looksLikeAddress("3511 AM"))
    })

    it("takes a stop name or a train platform for what it is", () => {
        assert.ok(!looksLikeAddress("Utrecht Centraal"))
        assert.ok(!looksLikeAddress("utrecht centraal spoor 5"))
    })
})

describe("mergeSearchResults", () => {
    it("lists stops before addresses for a name", () => {
        const kinds = mergeSearchResults(
            "neude",
            [stop("Neude")],
            [address("Neude 1, Utrecht")],
        ).map((place) => place.kind)
        assert.deepStrictEqual(kinds, ["stop", "address"])
    })

    it("lists addresses first when an address is typed", () => {
        const kinds = mergeSearchResults(
            "oudegracht 10",
            [stop("Oudegracht")],
            [address("Oudegracht 10, Utrecht")],
        ).map((place) => place.kind)
        assert.deepStrictEqual(kinds, ["address", "stop"])
    })

    it("keeps room for addresses below many stops", () => {
        const stops = Array.from({ length: 8 }, (_, i) => stop(`Halte ${i}`))
        const addresses = [1, 2, 3, 4].map((n) => address(`Straat ${n}`, 52 + n / 100))
        const merged = mergeSearchResults("halte", stops, addresses)
        assert.strictEqual(merged.length, 8)
        assert.strictEqual(merged.filter((place) => place.kind === "address").length, 3)
    })

    it("turns an address into a map point with its postcode", () => {
        assert.deepStrictEqual(mergeSearchResults("x", [], [address("Neude 1, Utrecht")]), [
            {
                id: "@52.09000,5.12000",
                name: "Neude 1, Utrecht",
                kind: "address",
                detail: "3511AM",
            },
        ])
    })

    it("drops a second address on the same point", () => {
        const merged = mergeSearchResults("x", [], [address("Neude 1"), address("Neude 1A")])
        assert.strictEqual(merged.length, 1)
    })
})
