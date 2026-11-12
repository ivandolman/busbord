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
    it("backs off 1, 4, 16, 60 min on errors and caps the server's hint at an hour", () => {
        assert.deepStrictEqual(
            [1, 2, 3, 4].map((attempt) => retryDelayMs(attempt, null, false) / 60_000),
            [1, 4, 16, 60],
        )
        assert.strictEqual(retryDelayMs(1, 30_000, false), 30_000)
        assert.strictEqual(retryDelayMs(1, 5 * 3_600_000, false), 3_600_000)
    })

    it("backs off 30 min, 2, 6, 12 h on HTTP 429 and caps the server's hint at 12 h", () => {
        assert.deepStrictEqual(
            [1, 2, 3, 4].map((attempt) => retryDelayMs(attempt, null, true) / 60_000),
            [30, 120, 360, 720],
        )
        assert.strictEqual(retryDelayMs(1, 30_000, true), 30_000)
        assert.strictEqual(retryDelayMs(1, 24 * 3_600_000, true), 12 * 3_600_000)
    })
})
