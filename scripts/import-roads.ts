// CLI: downloads OpenStreetMap extracts and writes the road network file

import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs"
import { basename, join } from "node:path"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import type { ReadableStream } from "node:stream/web"
import { parseArgs } from "node:util"

import { extractRoadNetwork, writeRoadNetwork } from "@/features/roads/road-network"
import { config, parseBoundingBox } from "@/lib/config"

// --- CONSTANTS ---

const OSM_DIRECTORY = "data/osm"

// --- HELPERS ---

async function download(url: string, target: string): Promise<void> {
    if (new URL(url).protocol !== "https:") throw new Error("OSM_EXTRACTS must use https")
    const partial = `${target}.part`
    console.log(`Downloading ${url} …`)
    const response = await fetch(url, { headers: { "User-Agent": config.userAgent } })
    if (!response.ok || !response.body) throw new Error(`Download failed: HTTP ${response.status}`)
    try {
        await pipeline(
            Readable.fromWeb(response.body as ReadableStream),
            createWriteStream(partial),
        )
        renameSync(partial, target)
    } catch (error) {
        rmSync(partial, { force: true })
        throw error
    }
    console.log(`  ${(statSync(target).size / 1e6).toFixed(0)} MB`)
}

// --- SCRIPT ---

const { values } = parseArgs({
    options: {
        "skip-download": { type: "boolean", default: false },
        "keep-osm": { type: "boolean", default: false },
        help: { type: "boolean", default: false },
    },
})

if (values.help) {
    console.log(`Usage: pnpm roads:import [--skip-download] [--keep-osm]

Downloads the OpenStreetMap extracts in OSM_EXTRACTS, keeps the roads, bus lanes and tram
tracks inside GTFS_BBOX and writes ${config.roadsPath}. Run "pnpm gtfs:import" afterwards: it
then draws every line along the street. Roads change slowly; re-running a few times a year is plenty.`)
    process.exit(0)
}

mkdirSync(OSM_DIRECTORY, { recursive: true })
const files = config.osmExtracts.map((url) => join(OSM_DIRECTORY, basename(new URL(url).pathname)))

for (const [i, url] of config.osmExtracts.entries()) {
    const file = files[i]
    if (file === undefined || (values["skip-download"] && existsSync(file))) continue
    await download(url, file)
}

const started = Date.now()
console.log("Extracting roads and tram tracks…")
const network = extractRoadNetwork(files, parseBoundingBox(config.gtfsBbox), console.log)
const temp = `${config.roadsPath}.writing`
writeRoadNetwork(temp, network)
renameSync(temp, config.roadsPath)
console.log(
    `Done in ${((Date.now() - started) / 1000).toFixed(0)} s: ${config.roadsPath}, ${(statSync(config.roadsPath).size / 1e6).toFixed(0)} MB`,
)

if (!values["keep-osm"]) for (const file of files) rmSync(file, { force: true })
