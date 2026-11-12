import { closeSync, createWriteStream, existsSync, mkdirSync, openSync, renameSync, rmSync, statSync, utimesSync } from "node:fs";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { parseArgs } from "node:util";
import { config, parseBoundingBox } from "../src/lib/config";
import { importGtfs } from "../src/lib/gtfs/importer";
import { readRoadNetwork } from "../src/lib/roads/network";
import { RoadRouter } from "../src/lib/roads/router";

const { values } = parseArgs({
  options: {
    file: { type: "string" },
    "keep-zip": { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});

if (values.help) {
  console.log(`Usage: pnpm gtfs:import [--file <gtfs.zip>] [--keep-zip]

Downloads the GTFS feed from GTFS_URL (or reads --file) and builds ${config.dbPath},
keeping only stops inside GTFS_BBOX.`);
  process.exit(0);
}

async function download(url: string, target: string): Promise<void> {
  if (new URL(url).protocol !== "https:") throw new Error("GTFS_URL must use https");
  mkdirSync(dirname(target), { recursive: true });
  const partial = `${target}.part`;
  console.log(`Downloading ${url} …`);
  const response = await fetch(url, { headers: { "User-Agent": config.userAgent } });
  if (!response.ok || !response.body) throw new Error(`Download failed: HTTP ${response.status}`);
  try {
    await pipeline(Readable.fromWeb(response.body as import("node:stream/web").ReadableStream), createWriteStream(partial));
    renameSync(partial, target);
  } catch (error) {
    rmSync(partial, { force: true });
    throw error;
  }
  console.log(`  ${(statSync(target).size / 1e6).toFixed(0)} MB`);
}

/**
 * One import at a time (the container starts one on boot, a scheduled task may start another).
 * A running import touches its lock every minute; a lock left untouched for longer belongs to
 * an import that was killed (for example with its container).
 */
const lockPath = `${config.dbPath}.lock`;
const STALE_LOCK_MS = 10 * 60_000;
mkdirSync(dirname(lockPath), { recursive: true });
try {
  closeSync(openSync(lockPath, "wx"));
} catch {
  if (Date.now() - statSync(lockPath).mtimeMs < STALE_LOCK_MS) {
    console.log(`Another import is running (${lockPath}); not starting a second one.`);
    process.exit(0);
  }
  console.log(`Removing a stale lock (${lockPath}).`);
}
const heartbeat = setInterval(() => {
  const now = new Date();
  try {
    utimesSync(lockPath, now, now);
  } catch {
    // Removed by hand: carry on.
  }
}, 60_000);
heartbeat.unref();
const releaseLock = () => rmSync(lockPath, { force: true });
process.on("exit", releaseLock);
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => process.exit(1));

const downloaded = values.file === undefined;
const zipPath = values.file ?? "data/gtfs-nl.zip";
if (downloaded) await download(config.gtfsUrl, zipPath);

const started = Date.now();
let roads: RoadRouter | undefined;
if (existsSync(config.roadsPath)) {
  console.log(`Loading road network from ${config.roadsPath}…`);
  roads = new RoadRouter(readRoadNetwork(config.roadsPath));
} else {
  console.log(`No ${config.roadsPath}: lines follow the feed's shapes only. Run "pnpm roads:import" to route them along the street.`);
}
const summary = await importGtfs({
  roads,
  zipPath,
  dbPath: config.dbPath,
  bbox: parseBoundingBox(process.env.GTFS_BBOX),
  source: downloaded ? config.gtfsUrl : zipPath,
  log: console.log,
});
console.log(`Done in ${((Date.now() - started) / 1000).toFixed(0)} s:`, summary);

if (downloaded && !values["keep-zip"]) rmSync(zipPath, { force: true });
