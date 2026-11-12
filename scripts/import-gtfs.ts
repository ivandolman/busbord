// CLI: downloads the GTFS feed (when changed) and rebuilds the timetable database

import { closeSync, existsSync, mkdirSync, openSync, rmSync, statSync, utimesSync } from "node:fs"
import { dirname } from "node:path"
import { parseArgs } from "node:util"

import { downloadFeed, readFeedState, writeFeedState } from "@/features/gtfs/download"
import { SCHEMA_VERSION } from "@/features/gtfs/gtfs-tables"
import { importGtfs } from "@/features/gtfs/importer"
import { readRoadNetwork } from "@/features/roads/road-network"
import { RoadRouter } from "@/features/roads/router"
import { config, parseBoundingBox } from "@/lib/config"

// --- CONSTANTS ---

const STALE_LOCK_MS = 10 * 60_000
const DEFAULT_ZIP_PATH = "data/gtfs-nl.zip"

// --- SCRIPT ---

const { values } = parseArgs({
    options: {
        file: { type: "string" },
        "keep-zip": { type: "boolean", default: false },
        force: { type: "boolean", default: false },
        help: { type: "boolean", default: false },
    },
})

if (values.help) {
    console.log(`Usage: pnpm gtfs:import [--file <gtfs.zip>] [--keep-zip] [--force]

Downloads the GTFS feed from GTFS_URL (or reads --file) and builds ${config.dbPath},
keeping only stops inside GTFS_BBOX. Skips the download and import when the feed, the region
and the road network are unchanged since the last import; --force imports anyway.`)
    process.exit(0)
}

/**
 * One import at a time (the container starts one on boot, a scheduled task may start another).
 * A running import touches its lock every minute; a lock left untouched for longer belongs to
 * an import that was killed (for example with its container).
 */
const lockPath = `${config.dbPath}.lock`
mkdirSync(dirname(lockPath), { recursive: true })
try {
    closeSync(openSync(lockPath, "wx"))
} catch {
    if (Date.now() - statSync(lockPath).mtimeMs < STALE_LOCK_MS) {
        console.log(`Another import is running (${lockPath}); not starting a second one.`)
        process.exit(0)
    }
    console.log(`Removing a stale lock (${lockPath}).`)
}
const heartbeat = setInterval(() => {
    const now = new Date()
    try {
        utimesSync(lockPath, now, now)
    } catch {
        // Removed by hand: carry on.
    }
}, 60_000)
heartbeat.unref()
const releaseLock = () => rmSync(lockPath, { force: true })
process.on("exit", releaseLock)
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => process.exit(1))

const downloaded = values.file === undefined
const zipPath = values.file ?? DEFAULT_ZIP_PATH
const statePath = `${config.dbPath}.feed.json`
// Everything besides the feed that shapes the database: an unchanged feed alone is no reason to skip.
const inputs = JSON.stringify({
    schema: SCHEMA_VERSION,
    bbox: config.gtfsBbox ?? "",
    roads: existsSync(config.roadsPath) ? statSync(config.roadsPath).mtimeMs : null,
})
let etag: string | null = null
if (downloaded) {
    const previous = values.force || !existsSync(config.dbPath) ? null : readFeedState(statePath)
    const result = await downloadFeed(config.gtfsUrl, zipPath, {
        userAgent: config.userAgent,
        etag: previous?.inputs === inputs ? previous.etag : null,
    })
    if (result.status === "unchanged") {
        console.log("Nothing to import; the current timetable stays.")
        process.exit(0)
    }
    etag = result.etag
}

const started = Date.now()
let roads: RoadRouter | undefined
if (existsSync(config.roadsPath)) {
    console.log(`Loading road network from ${config.roadsPath}…`)
    roads = new RoadRouter(readRoadNetwork(config.roadsPath))
} else {
    console.log(
        `No ${config.roadsPath}: lines follow the feed's shapes only. Run "pnpm roads:import" to route them along the street.`,
    )
}
const summary = await importGtfs({
    roads,
    zipPath,
    dbPath: config.dbPath,
    bbox: parseBoundingBox(config.gtfsBbox),
    source: downloaded ? config.gtfsUrl : zipPath,
    log: console.log,
})
if (etag) writeFeedState(statePath, { etag, inputs })
else rmSync(statePath, { force: true })
console.log(`Done in ${((Date.now() - started) / 1000).toFixed(0)} s:`, summary)

if (downloaded && !values["keep-zip"]) rmSync(zipPath, { force: true })
