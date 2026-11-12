// Unit tests for the GTFS download retry rules

import assert from "node:assert"
import { describe, it } from "node:test"

import { parseRetryAfter, retryDelayMs } from "@/features/gtfs/download"

describe("parseRetryAfter", () => {
    it("reads seconds and HTTP dates", () => {
        assert.strictEqual(parseRetryAfter("120"), 120_000)
        assert.strictEqual(
            parseRetryAfter("Thu, 12 Nov 2026 18:00:00 GMT", Date.parse("2026-11-12T17:59:00Z")),
            60_000,
        )
        assert.strictEqual(parseRetryAfter(null), null)
        assert.strictEqual(parseRetryAfter("soon"), null)
    })
})

describe("retryDelayMs", () => {
    it("backs off 1, 4, 16, 60 min and caps the server's hint at an hour", () => {
        assert.deepStrictEqual(
            [1, 2, 3, 4].map((attempt) => retryDelayMs(attempt, null) / 60_000),
            [1, 4, 16, 60],
        )
        assert.strictEqual(retryDelayMs(1, 30_000), 30_000)
        assert.strictEqual(retryDelayMs(1, 5 * 3_600_000), 3_600_000)
    })
})
