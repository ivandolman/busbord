// Unit tests for GTFS time parsing and service-day arithmetic

import assert from "node:assert"
import { describe, it } from "node:test"

import { localServiceDate, parseGtfsTime, serviceDayStart, shiftServiceDate } from "@/lib/time"

describe("time", () => {
    it("parses GTFS times past midnight", () => {
        assert.strictEqual(parseGtfsTime("25:10:00"), 90_600)
        assert.strictEqual(parseGtfsTime(""), null)
    })

    it("anchors the service day to local noon minus twelve hours", () => {
        // Ordinary winter day: local midnight, 23:00 UTC the evening before.
        assert.strictEqual(serviceDayStart("20261112"), Date.UTC(2026, 10, 11, 23) / 1000)
        // Clocks go back on 25 October 2026, so the anchor sits an hour after local midnight.
        assert.strictEqual(serviceDayStart("20261025"), Date.UTC(2026, 9, 24, 23) / 1000)
    })

    it("derives and shifts local dates", () => {
        assert.strictEqual(localServiceDate(Date.UTC(2026, 10, 12, 23, 30)), "20261113")
        assert.strictEqual(shiftServiceDate("20270101", -1), "20261231")
    })
})
