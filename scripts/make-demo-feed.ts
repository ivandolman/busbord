import { config, parseBoundingBox } from "../src/lib/config";
import { writeDemoFeed } from "../src/lib/gtfs/demo-feed";
import { importGtfs } from "../src/lib/gtfs/importer";
import { localServiceDate, shiftServiceDate } from "../src/lib/time";

const zipPath = "data/demo-gtfs.zip";
// Start yesterday so trips that run past midnight are present right after seeding.
const startDate = shiftServiceDate(localServiceDate(Date.now()), -1);

await writeDemoFeed(zipPath, startDate);
const summary = await importGtfs({
  zipPath,
  dbPath: config.dbPath,
  bbox: parseBoundingBox(process.env.GTFS_BBOX),
  source: "demo (fictional timetable)",
  log: console.log,
});
console.log(`Demo database ready at ${config.dbPath}:`, summary);
console.log("This timetable is invented. Run `pnpm gtfs:import` for the real one.");
