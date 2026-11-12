// Downloads the GTFS feed politely (ETag, retries on 429) and tracks what the database was built from

import {
    createWriteStream,
    existsSync,
    mkdirSync,
    readFileSync,
    renameSync,
    rmSync,
    statSync,
    writeFileSync,
} from "node:fs"
import { dirname } from "node:path"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import type { ReadableStream } from "node:stream/web"

import { FeedStateSchema, type FeedState } from "./feed-state.schema"

/**
 * Careful downloading of the GTFS feed. ovapi is a free service that limits downloads per
 * address, so the import asks "has it changed?" first (ETag) and waits when it is told to
 * slow down (HTTP 429) instead of giving up.
 */

// --- CONSTANTS ---

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const MAX_ATTEMPTS = 5
/** ovapi sends 429 without Retry-After and its limit lasts hours, so retrying within minutes only keeps it active. */
const RATE_LIMIT_DELAYS_MS = [30 * MINUTE, 2 * HOUR, 6 * HOUR, 12 * HOUR]
const MAX_RATE_LIMIT_WAIT_MS = 12 * HOUR
const MAX_ERROR_WAIT_MS = HOUR

// --- INTERFACES ---

export type DownloadResult = { status: "unchanged" } | { status: "downloaded"; etag: string | null }

export interface DownloadOptions {
    userAgent: string
    /** ETag of the feed behind the current database; the server answers 304 when it still matches. */
    etag?: string | null
    log?: (message: string) => void
    fetch?: typeof fetch
    sleep?: (ms: number) => Promise<void>
}

// --- HELPERS ---

function isRetryable(status: number): boolean {
    return status === 429 || status >= 500
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function save(body: ReadableStream, target: string): Promise<void> {
    mkdirSync(dirname(target), { recursive: true })
    const partial = `${target}.part`
    try {
        await pipeline(Readable.fromWeb(body), createWriteStream(partial))
        renameSync(partial, target)
    } catch (error) {
        rmSync(partial, { force: true })
        throw error
    }
}

// --- SERVICE ---

/** Retry-After as seconds or as an HTTP date; null when absent or unreadable. */
export function parseRetryAfter(header: string | null, now = Date.now()): number | null {
    if (!header) return null
    const value = header.trim()
    if (/^\d+$/.test(value)) return Number(value) * 1000
    const date = Date.parse(value)
    return Number.isNaN(date) ? null : Math.max(0, date - now)
}

/**
 * Wait before retry number `attempt` (1 = first retry): the server's hint, else on HTTP 429
 * 30 min, 2, 6, 12 h and on other errors 1, 4, 16, 60 min.
 */
export function retryDelayMs(
    attempt: number,
    retryAfterMs: number | null,
    rateLimited: boolean,
): number {
    if (rateLimited) {
        const fallback =
            RATE_LIMIT_DELAYS_MS[Math.min(attempt, RATE_LIMIT_DELAYS_MS.length) - 1] ??
            MAX_RATE_LIMIT_WAIT_MS
        return Math.min(retryAfterMs ?? fallback, MAX_RATE_LIMIT_WAIT_MS)
    }
    return Math.min(retryAfterMs ?? MINUTE * 4 ** (attempt - 1), MAX_ERROR_WAIT_MS)
}

export async function downloadFeed(
    url: string,
    target: string,
    options: DownloadOptions,
): Promise<DownloadResult> {
    if (new URL(url).protocol !== "https:") throw new Error("GTFS_URL must use https")
    const { userAgent, etag, log = console.log, fetch: fetchFn = fetch, sleep = wait } = options
    const headers: Record<string, string> = { "User-Agent": userAgent }
    if (etag) headers["If-None-Match"] = etag

    for (let attempt = 1; ; attempt++) {
        log(`Downloading ${url} …`)
        let response: Response | null = null
        let problem: string
        try {
            response = await fetchFn(url, { headers })
            problem = `HTTP ${response.status}`
        } catch (error) {
            problem = error instanceof Error ? error.message : String(error)
        }

        if (response?.status === 304) {
            log("  Feed unchanged since the last import.")
            return { status: "unchanged" }
        }
        if (response?.ok && response.body) {
            await save(response.body as ReadableStream, target)
            log(`  ${(statSync(target).size / 1e6).toFixed(0)} MB`)
            return { status: "downloaded", etag: response.headers.get("etag") }
        }

        const retryable = response === null || isRetryable(response.status)
        if (!retryable || attempt >= MAX_ATTEMPTS) throw new Error(`Download failed: ${problem}`)
        const delay = retryDelayMs(
            attempt,
            parseRetryAfter(response?.headers.get("retry-after") ?? null),
            response?.status === 429,
        )
        await response?.body?.cancel()
        const minutes = Math.ceil(delay / MINUTE)
        const waitText = minutes < 120 ? `${minutes} min` : `${(minutes / 60).toFixed(0)} h`
        log(
            `  ${problem}; trying again in ${waitText} (attempt ${attempt + 1} of ${MAX_ATTEMPTS}).`,
        )
        await sleep(delay)
    }
}

export function readFeedState(path: string): FeedState | null {
    if (!existsSync(path)) return null
    try {
        const parsed = FeedStateSchema.safeParse(JSON.parse(readFileSync(path, "utf8")))
        return parsed.success ? parsed.data : null
    } catch {
        return null
    }
}

export function writeFeedState(path: string, state: FeedState): void {
    writeFileSync(path, JSON.stringify(state))
}
