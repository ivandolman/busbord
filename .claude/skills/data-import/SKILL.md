---
name: data-import
description: Import or refresh the GTFS timetable, the OSM road network or the demo feed for busbord, locally or on the Coolify server. Use when data is missing, stale, the schema changed, or the user asks to (re)import.
---

# Data import

Never read files in `data/`; inspect the timetable with `sqlite3 data/gtfs.sqlite '<query>'`
and a `LIMIT`.

## Local

| Goal                          | Command                                              |
| ----------------------------- | ---------------------------------------------------- |
| Fictional demo timetable      | `pnpm gtfs:demo`                                     |
| Real timetable (ovapi)        | `pnpm gtfs:import` (skips an unchanged feed; `--force` rebuilds) |
| Real timetable from a zip     | `pnpm gtfs:import --file <path-to-zip>`              |
| Road network (walks, geometry)| `pnpm roads:import`, then re-run `gtfs:import` so line paths follow the roads |

Region and paths come from `.env` (`GTFS_BBOX`, `GTFS_DB_PATH`, `ROADS_PATH`, `OSM_EXTRACTS`;
see `src/lib/config.ts`). A new `SCHEMA_VERSION` in `features/gtfs/gtfs-tables.ts` needs a
re-import.

## Server (Coolify)

ovapi rate-limits the server IP (HTTP 429 for hours). Do not import from the server's network:

1. Download `gtfs-nl.zip` on the Mac.
2. `scp` it to the server, `docker cp` it into the container's `/app/data/`.
3. In the container: `node scripts/import-gtfs.mjs --file data/<zip>`.

The container's `/app/data` volume is persistent. Bundled scripts live in `dist/scripts/*.mjs`
(`pnpm build:scripts`). Ask before running anything on the server.
