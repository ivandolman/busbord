// Unit tests for the GTFS CSV line parser

import assert from "node:assert"
import { describe, it } from "node:test"

import { parseCsvLine } from "@/features/gtfs/csv"

describe("parseCsvLine", () => {
    it("splits plain and quoted fields", () => {
        assert.deepStrictEqual(parseCsvLine("a,b,,d"), ["a", "b", "", "d"])
        assert.deepStrictEqual(parseCsvLine('1,"Utrecht, CS Centrumzijde","say ""hi""",'), [
            "1",
            "Utrecht, CS Centrumzijde",
            'say "hi"',
            "",
        ])
    })
})
