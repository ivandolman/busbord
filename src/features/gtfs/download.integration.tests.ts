// Integration tests for downloading the GTFS feed and storing its state, on temp files

import assert from "node:assert"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, it } from "node:test"

import { downloadFeed, readFeedState, writeFeedState } from "@/features/gtfs/download"

// --- CONSTANTS ---

const URL = "https://example.org/gtfs.zip"

// --- HELPERS ---

const dirs: string[] = []
const tempDir = () => {
    const dir = mkdtempSync(join(tmpdir(), "gtfs-download-"))
    dirs.push(dir)
    return dir
}
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })))

/** A fetch that answers with the given responses in turn and records the request headers. */
function fakeFetch(...responses: Array<() => Response>) {
    const calls: Record<string, string>[] = []
    const fn = (async (_url: string, init?: RequestInit) => {
        calls.push({ ...(init?.headers as Record<string, string>) })
        const next = responses.shift()
        if (!next) throw new Error("unexpected request")
        return next()
    }) as typeof fetch
    return { fn, calls }
}

// --- TESTS ---

describe("downloadFeed", () => {
    const options = { userAgent: "test", log: () => {}, sleep: async () => {} }

    it("sends the ETag and skips the download when the feed is unchanged", async () => {
        const { fn, calls } = fakeFetch(() => new Response(null, { status: 304 }))
        const result = await downloadFeed(URL, join(tempDir(), "feed.zip"), {
            ...options,
            etag: '"abc"',
            fetch: fn,
        })
        assert.deepStrictEqual(result, { status: "unchanged" })
        assert.strictEqual(calls[0]?.["If-None-Match"], '"abc"')
    })

    it("waits after a 429 and then downloads, returning the new ETag", async () => {
        const waits: number[] = []
        const target = join(tempDir(), "feed.zip")
        const { fn } = fakeFetch(
            () => new Response("slow down", { status: 429, headers: { "Retry-After": "90" } }),
            () => new Response("zipdata", { status: 200, headers: { ETag: '"new"' } }),
        )
        const result = await downloadFeed(URL, target, {
            ...options,
            fetch: fn,
            sleep: async (ms) => void waits.push(ms),
        })
        assert.deepStrictEqual(result, { status: "downloaded", etag: '"new"' })
        assert.deepStrictEqual(waits, [90_000])
        assert.strictEqual(readFileSync(target, "utf8"), "zipdata")
    })

    it("gives up after five attempts, and at once on errors that will not pass", async () => {
        const tooMany = fakeFetch(
            ...Array.from({ length: 5 }, () => () => new Response(null, { status: 429 })),
        )
        await assert.rejects(
            downloadFeed(URL, join(tempDir(), "a.zip"), { ...options, fetch: tooMany.fn }),
            /HTTP 429/,
        )
        assert.strictEqual(tooMany.calls.length, 5)

        const notFound = fakeFetch(() => new Response(null, { status: 404 }))
        await assert.rejects(
            downloadFeed(URL, join(tempDir(), "b.zip"), { ...options, fetch: notFound.fn }),
            /HTTP 404/,
        )
        assert.strictEqual(notFound.calls.length, 1)
    })
})

describe("feed state", () => {
    it("round-trips and ignores a damaged file", () => {
        const path = join(tempDir(), "gtfs.sqlite.feed.json")
        assert.strictEqual(readFeedState(path), null)
        writeFeedState(path, { etag: '"abc"', inputs: "{}" })
        assert.deepStrictEqual(readFeedState(path), { etag: '"abc"', inputs: "{}" })
        writeFileSync(path, "{not json")
        assert.strictEqual(readFeedState(path), null)
    })
})
