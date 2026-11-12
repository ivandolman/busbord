// CLI: writes the fictional demo feed and imports it as the timetable database

import { writeDemoFeed } from "@/features/gtfs/demo-feed"
import { importGtfs } from "@/features/gtfs/importer"
import { config, parseBoundingBox } from "@/lib/config"
import { localServiceDate, shiftServiceDate } from "@/lib/time"

// --- CONSTANTS ---

const ZIP_PATH = "data/demo-gtfs.zip"

// --- SCRIPT ---

// Start yesterday so trips that run past midnight are present right after seeding.
const startDate = shiftServiceDate(localServiceDate(Date.now()), -1)

await writeDemoFeed(ZIP_PATH, startDate)
const summary = await importGtfs({
    zipPath: ZIP_PATH,
    dbPath: config.dbPath,
    bbox: parseBoundingBox(config.gtfsBbox),
    source: "demo (fictional timetable)",
    log: console.log,
})
console.log(`Demo database ready at ${config.dbPath}:`, summary)
console.log("This timetable is invented. Run `pnpm gtfs:import` for the real one.")
