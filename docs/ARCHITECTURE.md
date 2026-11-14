# Architecture and code map

Current state of the app, so an agent (or person) knows where to look without scanning the
repo. **Keep this file up to date:** a commit that adds, removes, moves or renames a file, an
API route, an env var or a data file updates the matching line here in the same commit.

Behaviour in depth (ranking rules, walking radii, map drawing) is in `README.md` § "How it
works"; grep it rather than reading it whole.

## Stack

Next.js 16 (App Router, `src/proxy.ts` instead of middleware), React 19, TypeScript, Tailwind 4,
Zod 4, Leaflet. SQLite through `node:sqlite` (`DatabaseSync`), no ORM. pnpm. Tests with
`node --test` + `tsx`. Deployed as a Docker image on Coolify; push to `main` deploys.

## Data flow

```
GTFS zip (ovapi) ──scripts/import-gtfs.ts──► data/gtfs.sqlite   (read-only at runtime, src/lib/db.ts)
OSM PBF extracts ──scripts/import-roads.ts─► data/roads.bin     (walking + line geometry)
GTFS-realtime    ──fetched per request, cached──► delays, cancellations, alerts
PDOK Locatieserver ──fetched per search, cached──► addresses (place search, naming map points)
browser ──/api/routes, /api/settings──► data/user.sqlite        (saved routes + settings)

page.tsx → BoardApp (client) → hooks (src/hooks) → fetch /api/* → route.ts
        → feature service (src/features/*/*.service.ts) → repository / pure logic → SQLite
```

Layering: component → hook → API route → service → repository. Services are factories
(`createBoardService`, `createNetworkService`, `createUserDataService`) with a default instance,
so tests inject fakes.

## Where to look, by task

| Task                                       | Start in                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Which departures show, ranking, "Pak deze" | `features/board/build-board.ts`, `group.ts`, `board.service.ts`                             |
| SQL queries on the timetable               | `features/board/board.repository.ts`                                                        |
| Origin/destination → platforms, map points | `features/board/endpoint.ts`, `lib/place.ts`                                                |
| Start from a train platform ("spoor")      | `network-map/platform-picker.tsx`, `hooks/use-train-station.ts`, `board.repository.ts`      |
| Transfers (one change)                     | `features/board/transfers.ts`                                                               |
| Realtime delays / alerts                   | `features/board/realtime.ts`, `alerts.ts`                                                   |
| Walking routes and areas                   | `features/roads/walking.ts`, `router.ts`, `area-chords.ts`                                  |
| Lines drawn along streets                  | `features/roads/line-path.ts`, `features/network/patterns.ts`                               |
| Shared corridors / side-by-side lines      | `features/network/corridors.ts`, `app/_components/network-map/bundles.ts`, `offset-path.ts` |
| What the map highlights for a selection    | `features/network/reachable.ts`, `segments.ts`, `network-map/line-focus.ts`                 |
| Night lines shown only while running       | `features/network/night-lines.ts`, `network-map/night-filter.ts`, `use-night-lines.ts`      |
| Map rendering, layers, stop dots, labels   | `app/_components/network-map/use-network-layers.ts`, `stop-dots.ts`, `stop-labels.ts`       |
| Stop card / stop sheet on the map          | `network-map/stop-card.tsx`, `stop-sheet.tsx`, `use-stop-departures.ts`                     |
| Board UI                                   | `app/_components/board-view/*`, `board-panel.tsx`                                           |
| Bottom sheet / side panel behaviour        | `components/ui/sheet.tsx`, `hooks/use-sheet-drag.ts`, `use-sheet-metrics.ts`                |
| Search, stop picker, URL state             | `search-panel.tsx`, `stop-picker.tsx`, `hooks/use-route-params.ts`                          |
| Address search, stop/address list order    | `features/geocode/geocode.service.ts`, `board/search-results.ts`, `place-option.tsx`        |
| Saved routes, regular trips                | `features/saved-routes/*`, `app/_components/saved-routes/*`, `hooks/use-scheduled-route.ts` |
| Settings                                   | `features/user-data/*`, `app/_components/settings/*`, `hooks/use-settings.ts`               |
| GTFS import, DB schema                     | `features/gtfs/importer.ts`, `gtfs-tables.ts`, `download.ts`                                |
| Login / session                            | `lib/auth.ts`, `src/proxy.ts`, `app/api/login`, `components/app/session-guard.tsx`          |
| Offline, "Vertrek nu" notifications        | `public/sw.js`, `components/app/service-worker.tsx`, `hooks/use-leave-alert.ts`             |
| Env config (incl. `GEOCODE_URL`)           | `lib/config.ts` (Zod), `.env.example`                                                       |
| Colours, type, tokens, dark mode           | `styles/theme/*.css`, `lib/theme.ts`, `hooks/use-theme.ts`                                  |

(Paths without `src/` are under `src/`.)

## API routes (`src/app/api/*/route.ts`)

All `runtime = "nodejs"`, `dynamic = "force-dynamic"`. Query strings are parsed with Zod via
`parseQuery` (`lib/http.ts`); schemas live in `features/*/*.schema.ts`. Client-side responses are
validated with `network-map/network-map.schema.ts` + `fetch-parsed.ts`.

| Route                            | Purpose                                                     | Service                               |
| -------------------------------- | ----------------------------------------------------------- | ------------------------------------- |
| `GET /api/board`                 | departures origin → destination, walks, realtime, alerts    | `boardService.getBoard`               |
| `GET /api/departures`            | next hour from one stop (stop card)                         | `boardService.getStopBoard`           |
| `GET /api/next-departures`       | per stop area, next ride per line towards `to` (map labels) | `boardService.getNextDepartures`      |
| `GET /api/stops`                 | stops, "… spoor 5" platforms and addresses, typed by `kind` | `boardService.searchStops`            |
| `GET /api/place`                 | display name for an area id or `@lat,lon` (address nearby)  | `boardService.getPlace`               |
| `GET /api/station`               | train station near a place, with its platforms              | `boardService.getStation`             |
| `GET /api/walk-area`             | area within walking distance                                | `boardService.getWalkArea`            |
| `GET /api/walk-route`            | walking route between two points                            | `boardService.getWalkRoute`           |
| `GET /api/network`               | every line and stop for the map (ETag)                      | `networkService.getNetworkJson`       |
| `GET /api/reachable`             | lines/stops highlighted for the selection                   | `networkService.getReachable`         |
| `GET /api/night-lines`           | night lines under way now or leaving within the hour        | `networkService.getRunningNightLines` |
| `GET/POST/DELETE /api/routes`    | saved routes                                                | `user-data.service.ts`                |
| `GET/PUT /api/settings`          | settings                                                    | `user-data.service.ts`                |
| `POST /api/login`, `/api/logout` | shared-password session                                     | `lib/auth.ts`                         |
| `GET /api/health`                | liveness + timetable present                                | —                                     |

## Directory map

```
scripts/                 CLIs: import-gtfs, import-roads, make-demo-feed (bundled to dist/scripts/*.mjs for Docker)
src/proxy.ts             session check on every request
src/app/
  page.tsx, layout.tsx   home route (BoardApp), root layout
  login/page.tsx         password form
  manifest.ts            PWA manifest, saved routes as shortcuts
  icon.svg, apple-icon.png  app icon (SVG for browsers, 180px PNG for the iOS home screen)
  api/*/route.ts         see table above
  _components/           app UI (client): board-app, board-panel, search-panel, search-bar,
                         stop-picker, place-option, trip-view, trip-step, map-controls, desktop-header, …
    board-view/          board: pick-card, group-row, departure-row, transfer-list, alert-list
    network-map/         Leaflet map; use-*.ts hooks each own one layer (walk areas, walk legs,
                         stop labels, place markers, highlight, flight); pure helpers *.ts
    saved-routes/        save button/form, list chips, schedule fields
    settings/            settings panel and rows
src/components/ui/       design primitives: sheet, button, icon, input, select, switch, …
src/components/app/      app-wide helpers: service-worker, session-guard, logout-row
src/hooks/               client state: use-board, use-network, use-settings, use-saved-routes,
                         use-route-params (URL), use-sheet-*, use-locate, use-theme, …
src/features/
  board/                 board domain: repository (SQL), service, build-board (pure), group,
                         endpoint, transfers, realtime, alerts, format, departure-text, stop-name,
                         search-results (place search order)
  network/               map network: patterns, corridors, segments, reachable, night-lines, service
  geocode/               PDOK Locatieserver client: address search and address at a point
  roads/                 OSM: pbf reader, road-network (binary file), router, walking, line-path,
                         area-chords (straight walks across squares)
  gtfs/                  csv, zip, download, importer, gtfs-tables (DDL), demo-feed
  saved-routes/          schema + list/schedule logic (shared server/browser)
  user-data/             user.sqlite service + settings schema
src/lib/                 config, db, auth, http, geo, time, place, schemas, theme, utils, seo/
src/styles/              globals.css, map.css, theme/{colors,typography,effects}.css
public/                  icons/*.svg, map-styles/*.png (previews), sw.js
```

## Data files (`data/`, gitignored; never read them)

| File          | Made by                          | Notes                                            |
| ------------- | -------------------------------- | ------------------------------------------------ |
| `gtfs.sqlite` | `pnpm gtfs:import` / `gtfs:demo` | ~170 MB; swapped atomically, `lib/db.ts` reopens |
| `roads.bin`   | `pnpm roads:import`              | ~35 MB; optional (falls back to straight lines)  |
| `osm/`        | `pnpm roads:import`              | downloaded PBF extracts                          |
| `user.sqlite` | app at runtime                   | saved routes + settings; import never touches it |

## Tests

Unit tests sit next to their source as `*.tests.ts` (`pnpm test`); `*.integration.tests.ts`
run against the demo feed (`pnpm test:integration`). Covered: board (alerts, build-board,
endpoint, group, stop-name, search-results, integration), geocode, gtfs (csv, download), network (corridors, patterns),
roads (area-chords, line-path, road-network, router), saved-routes, user-data, lib (auth, place, time),
network-map/offset-path, network night lines, train station / platform places.
