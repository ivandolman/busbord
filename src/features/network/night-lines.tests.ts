// Unit tests for which night lines count as running

import assert from "node:assert"
import { describe, it } from "node:test"

import { isNightLine, runningNightLines, runningRoutes } from "@/features/network/night-lines"
import { serviceDayStart } from "@/lib/time"

describe("night lines", () => {
    it("recognises night line numbers", () => {
        assert.strictEqual(isNightLine("N2"), true)
        assert.strictEqual(isNightLine("n20"), true)
        assert.strictEqual(isNightLine("2"), false)
        assert.strictEqual(isNightLine("Nachtbus"), false)
    })

    it("keeps lines under way or leaving within the lead time", () => {
        const spans = [
            { routeId: "under-way", start: 900, end: 1100 },
            { routeId: "soon", start: 1500, end: 2000 },
            { routeId: "later", start: 5000, end: 6000 },
            { routeId: "done", start: 100, end: 900 },
        ]
        assert.deepStrictEqual(runningRoutes(spans, 1000, 600), ["soon", "under-way"])
    })

    it("counts yesterday's trips that run past midnight", () => {
        const days: string[] = []
        const repository = {
            nightTripSpans(date: string) {
                days.push(date)
                // 25:00 to 25:45 on the service day that started the evening before.
                return date === "20261113" ? [{ routeId: "N1", start: 90000, end: 92700 }] : []
            },
        }
        const oneAm = (serviceDayStart("20261114") + 3600 + 600) * 1000
        assert.deepStrictEqual(runningNightLines(repository, oneAm), ["N1"])
        assert.deepStrictEqual(days, ["20261113", "20261114"])
        const noon = (serviceDayStart("20261114") + 12 * 3600) * 1000
        assert.deepStrictEqual(runningNightLines(repository, noon), [])
    })
})
