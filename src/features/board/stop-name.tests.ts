// Unit tests for the stop name comparison key

import assert from "node:assert"
import { describe, it } from "node:test"

import { stopNameKey } from "@/features/board/stop-name"

describe("stopNameKey", () => {
    it("treats different spellings of one stop as the same name", () => {
        assert.strictEqual(
            stopNameKey("Utrecht, Kleinesingel"),
            stopNameKey("Utrecht, Kleine Singel"),
        )
        assert.strictEqual(stopNameKey("Utrecht, Café-Plein"), stopNameKey("utrecht cafe plein"))
        assert.notStrictEqual(
            stopNameKey("Utrecht, Janskerkhof"),
            stopNameKey("Utrecht, Stadsschouwburg"),
        )
    })
})
