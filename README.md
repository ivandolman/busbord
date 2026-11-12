# Bestemmingsbord

A departure board that starts from the destination. Pick where you are and where you want to
go, and it lists every bus and tram that runs there directly, merged into one board, instead
of the single line a journey planner picks for you.

Prototype. Built for Utrecht (U-OV), but nothing in the code is Utrecht-specific: the region
is a bounding box.

## Quick start (fictional demo timetable)

```bash
pnpm install
pnpm gtfs:demo     # builds data/gtfs.sqlite from an invented timetable
pnpm dev           # http://localhost:3000
```

In development the app is open unless `AUTH_PASSWORD` is set; see "Login" below.

Try "Utrecht CS" to "Heidelberglaan" (three lines, the bus gets overtaken by trams) or to
"De Bilt" (lines 73 and 77). The demo timetable is invented: real stop names, made-up routes,
platforms and times. Set `GTFS_RT_ENABLED=false` in `.env` while using it, since the real
realtime feed knows nothing about demo trips.

## Real data

```bash
cp .env.example .env
pnpm gtfs:import                    # downloads the national GTFS feed, keeps the Utrecht region
pnpm gtfs:import --file feed.zip    # or import a file you already have
```

For lines on the map that follow the street exactly and for real walking distances, build
the road network once before importing (about 750 MB of OpenStreetMap extracts are
downloaded, reduced to a ~30 MB `data/roads.bin` and then deleted). A `roads.bin` from before
footpaths were included still works, but walks then only follow roads; re-run the command:

```bash
pnpm roads:import                   # Utrecht and neighbouring provinces, see OSM_EXTRACTS
pnpm gtfs:import                    # picks up data/roads.bin automatically
```

The national feed is a few hundred MB and `stop_times.txt` inside it is far larger; the
importer streams it and never unpacks to disk. Re-run it when the timetable changes (the feed
is refreshed regularly, and a new annual timetable starts each December). The database is
swapped in atomically, so the app can keep running during an import.

Requires Node.js 22.13 or newer (uses the built-in `node:sqlite`, so there is no native
module to compile; Node prints an "experimental" warning for it).

## Deploy (Coolify or Docker)

The repository has a `Dockerfile`: a small Node 22 image with the Next.js standalone server
and the import scripts bundled to plain JavaScript (`pnpm build:scripts`). Everything the app
writes (timetable, road network, saved routes) lives in `/app/data`, so that directory needs
a persistent volume; without one every redeploy loses the saved routes and imports again.

In Coolify:

1. **New resource → Public/Private Repository**, this repository, branch `main`,
   build pack **Dockerfile**. Port **3000**.
2. **Persistent storage**: add a volume with destination path `/app/data`.
3. **Environment variables**: `AUTH_PASSWORD` (required; without it the app answers 503) and
   preferably `AUTH_SECRET` (a long random string, e.g. `openssl rand -base64 48`). Other
   settings from `.env.example` are optional. `NODE_ENV`, `PORT` and `HOSTNAME` are set by
   the image.
4. **Domain**: set one with `https://`; Coolify's proxy then provides the certificate and sends
   `X-Forwarded-Proto`, so the session cookie is `Secure`.
5. **Deploy.** On the first start there is no timetable yet: the container imports the national
   feed in the background (download of a few hundred MB, then the import; the board says
   "De dienstregeling is nog niet geïmporteerd" until it is done). Follow it in the logs.
   Give the server enough memory and disk for that; the real import has not been measured yet.
   To try it out first, set `GTFS_IMPORT_ON_START=demo` (invented timetable,
   with `GTFS_RT_ENABLED=false`).
6. **Scheduled task** to keep the timetable current, e.g. daily at 04:30
   (`30 4 * * *`), command:

    ```
    node scripts/import-gtfs.mjs
    ```

    The new database is swapped in atomically while the app keeps running. Only one import runs
    at a time (`data/gtfs.sqlite.lock`); a second one exits straight away. ovapi limits downloads
    per address, so the import is frugal: it sends the ETag of the last imported feed and stops
    when the feed is unchanged (and the region and road network too); `--force` imports anyway.
    On HTTP 429 it waits (the server's `Retry-After`, else 30 min, 2, 6, 12 h: ovapi's limit
    lasts hours) and on a server error 1, 4, 16, 60 min, then tries again, up to 5 attempts.

7. Optional, for lines along the street and real walking distances: run once from the
   container's terminal (downloads ~750 MB, temporarily needs that much disk plus memory for
   the road graph), then import again:

    ```
    node scripts/import-roads.mjs && node scripts/import-gtfs.mjs
    ```

The container has a healthcheck on `/api/health` (public; it only says whether the server
runs and whether a timetable is present). Coolify's proxy sets `X-Forwarded-For`, which the
login limiter uses.

Plain Docker works the same way:

```bash
docker build -t bestemmingsbord .
docker run -d -p 3000:3000 -v bestemmingsbord-data:/app/data \
  -e AUTH_PASSWORD=… -e AUTH_SECRET=… bestemmingsbord
```

## Layout

The map fills the screen. On a phone the board sits in a bottom sheet over it (drag or tap the
handle: lowest a strip at the bottom so almost the whole map shows, closed "Pak deze", half the line list, full everything) under a search bar
("Kleinesingel → CS Jaarbeurszijde", tap to change, arrows to swap). On a wide screen the
same content is a side panel left of the map. The sheet shows one panel at a time: the board,
"Van en naar" (stop search, my location, choose on the map, saved routes), "Kaart &
instellingen" (layers button on the map) and a ride step by step ("Looproute op kaart": walk,
board, get off, arrive, with the walks drawn on the map). A stop tapped on a phone opens in its
own sheet instead of a popup: it slides up while the board's sheet slides away, drags between the
same heights, and closes with the cross or by dragging it down past its lowest height
(`src/components/ui/sheet.tsx`, `src/app/_components/board-app.tsx`,
`src/app/_components/network-map/stop-sheet.tsx`). A sheet drags by its handle or, like on
iOS, anywhere in its content: down while the content is at its top, up while the sheet is not
fully open (`src/hooks/use-sheet-drag.ts`); a quick flick moves it one height further. The map
flies to an opened stop and back when it closes, and a pulsing ring marks the open stop. Map
buttons a sheet would cover fade out. Panels fade in when they change, changed waits and delays
roll in, and grey placeholder rows stand in while departures load. With "reduce motion" on in the
system, none of this moves.

The look follows the Figma design ("Concept B – uitgewerkt"): its colour variables and text
styles are Tailwind tokens in `src/app/globals.css` (`text-tekst`, `bg-oppervlak`, `text-body-s`,
`text-kop-xl`, …), its icons are `public/icons/*.svg` drawn by `src/components/Icon.tsx`, and
line badges use each line's own colour from the feed (`useNetwork.ts`). Dark mode follows the
system, or "Weergave" in the settings (per device, `src/lib/theme.ts`): the same tokens get dark
values in `globals.css`, and the base map, which has no dark version, is shown inverted.

## How it works

1. **Areas.** Platforms are grouped into the stop a traveller means ("Utrecht, CS
   Centrumzijde"), using `parent_station` where the feed has it and name plus proximity
   where it does not. Areas with the same name (spelling aside) within 200 m count as one stop (the
   feed often splits the bus and tram side). With "Ook haltes op loopafstand" on, platforms
   within 500 m of the origin and 150 m of the destination count too, which is what joins
   both sides of Utrecht Centraal. The chosen stop always wins: a trip that calls at it is
   shown from (or to) it, never from a nearby platform further down the line.
   An endpoint can also be a point on the map (`@lat,lon` in the URL): then every platform
   within 400 m (800 m with walking on) counts, and per trip the pair with the shortest
   walk + ride + walk wins. Pairs within a few minutes of that count as equally quick (the
   walking estimate is rough); of those, the one with the least walking wins. The margin is a
   setting ("Minder lopen mag … langer duren", default 2 min, 0 = always the quickest).
2. **Stop pairs.** A trip is a match when it calls at an origin platform and, later in the
   same trip, at a destination platform (`src/lib/board/repository.ts`). That is one indexed
   self-join on `stop_times`; no line list is maintained anywhere.
3. **Ranking.** Departures are listed in departure order. Walking counts: each departure
   carries the walk to its stop and from the stop where you get off, at 5 km/h. With
   `data/roads.bin` present that is the real walking route over streets, footpaths and
   pedestrian areas (both ways along one-way streets, never along motorways or tram tracks,
   `src/lib/roads/walking.ts`); without it, the straight line plus a quarter. The same walk
   decides which stops count: a stop near the origin (or near a point on the map) counts when
   you can walk there within the "Maximaal lopen" setting (default 12 minutes, about 1 km),
   so a stop across the water no longer counts just because it looks close. A stop chosen as
   destination only adds stops across the street (~190 m). The map shades the walkable area,
   blue around the origin and red around the destination (`/api/walk-area`; circles without
   a road network). "Looproute op kaart" on a departure draws the walks to and from its stops
   along the streets (`/api/walk-route`). The arrival shown is at the place you asked for, and a bus
   you cannot walk to in time is greyed out. One you set off for no later than another yet
   arrive after it is marked "Ingehaald door …", so "take the first one that is not greyed out"
   is always right (`src/lib/board/build-board.ts`).
   The board shows this as one "Pak deze" card (the departure that gets you there first; on a
   tie the one you can leave for later) with the next fallbacks, and below it every line and
   direction once with its next times; lines that are always beaten fold away
   (`src/lib/board/group.ts`).
4. **Map.** The importer stores each route's distinct stopping patterns with their geometry
   (`line_patterns`). The feed's `shapes.txt` is not reliable on its own: diversions and some
   routes are straight lines from stop to stop. With `data/roads.bin` present, every hop
   between two stops is routed over OpenStreetMap roads, bus lanes and tram tracks (one-way
   streets respected, buses allowed where `oneway:bus=no`), with the feed's shape as a guide
   so the route picks the street the bus really takes (`src/lib/roads/`). A hop falls back to
   the feed's shape when a stop is not near any road or routing gives an implausible detour.
   Without `roads.bin` the feed's shapes are used as they are. A database imported before that table existed still works: the patterns
   are then computed on first use (~3 s) and drawn stop to stop. The map only shows lines
   that are useful for the selection (today, without changing): with only an origin the
   lines leaving it, with only a destination the lines arriving there, with both only the
   stretch of each line you ride, from where you board to where you get off (picked per trip
   as on the board, `src/lib/network/segments.ts`). Clicking a line lists every line on that stretch;
   clicking a stop shows its next hour of departures, every line, with the ones that reach
   the chosen destination marked. A stop has several poles (one per side of the street, often
   listed twice in the feed): each gets a letter (the feed's platform code when there is one),
   the direction its buses go next, and with an origin the walk there; the letters also appear
   on the map, and every departure says which pole it leaves from. Poles are grouped into
   directions (where the buses go next), one tab each; with a destination chosen the popup
   opens on the direction most rides there leave from, showing every bus on that side.
   Stop areas with the same name close together are one dot on the map, also when operators
   spell the name differently ("Kleinesingel", "Kleine Singel"; `src/lib/stop-name.ts`); the
   board and stop search treat them as one stop the same way.
   Stop dots grow with the zoom level. From zoom 15 a stop gets its line numbers top right of
   the dot, wherever that does not overlap another label (busiest stops first); with a search
   or a route only the lines in focus are listed. With a destination chosen, the labels at the
   stops where you can get on (inside the blue area; anywhere without an origin) list only the
   lines that go there, each with the wait next to its badge ("[74] 1 min", realtime included,
   `/api/next-departures`, refreshed every 30 s and after moving the map).
   On touch screens a tap within 20 px of a stop opens it (from zoom 14). The background is
   the quiet grey PDOK/Kadaster map by default, or standard OpenStreetMap (chosen in "Kaart &
   instellingen"; a stored setting).
5. **Saved routes and settings.** "Route bewaren" keeps the current pair of places (stops or
   map points) under a name in a separate SQLite file, `data/user.sqlite` (`USER_DB_PATH`),
   through `/api/routes`; the walking margin is stored there too (`/api/settings`). The
   timetable import never touches that file. Routes an earlier version kept in the browser's
   localStorage move to the server on the first visit. Input is validated on write and read
   (`src/lib/user-data.ts`). There is one list for everyone who can reach the app. A route can be a regular trip with days
   and a time window ("ma–vr 07:30–09:00"): opening the app without a route inside that
   window opens it straight away. The app has a web manifest, so it can be added to a phone's
   home screen.
6. **Realtime.** GTFS-realtime trip updates are overlaid: delays shift the times,
   cancelled trips stay visible but struck through. If the feed is down the board falls
   back to the timetable and says so. Service alerts (`GTFS_ALERTS_URL`, fetched at most every
   2 minutes) about the board's lines or its stops show above the board
   (`src/lib/board/alerts.ts`).
7. **Transfers.** When no direct ride helps, the board offers trips with one change
   (`src/lib/board/transfers.ts`): stops where a line from the origin meets a line to the
   destination (or same-named stops across the street), with 2 minutes to change plus the
   walk, keeping only journeys nothing beats on both leaving later and arriving earlier.
8. **Phone app.** A service worker (`public/sw.js`, production builds only) keeps the app and
   the latest answers: offline the board shows the last copy, without buses that have left,
   and says from when it is. "Melding als je moet vertrekken" (per device, in the settings)
   warns two minutes before you must leave for a regular trip, while the app is open or in
   the background; there is no server push, so a closed app sends nothing. The manifest lists
   the saved routes as home-screen shortcuts (long press on the app icon).

```
scripts/            import-gtfs.ts, import-roads.ts, make-demo-feed.ts
Dockerfile          production image; docker-entrypoint.sh imports the timetable on first start
src/lib/gtfs/       streaming CSV + zip reader, importer, schema, demo feed
src/lib/board/      repository (SQL), build-board (pure logic), realtime, service
src/lib/network/    line patterns and shapes for the map
src/lib/roads/      OSM PBF reader, road network, router (lines along the street)
src/app/api/        /api/stops?q=   /api/board?from=&to=&walk=&tie=&trains=
                    /api/network    /api/reachable?from=&to=&walk=&tie=   /api/place?id=
                    /api/departures?stop=&to=&walk=
                    /api/next-departures?areas=a,b&to=&walk=   /api/walk-area?id=&walk=&role=
                    /api/walk-route?from=@lat,lon&to=@lat,lon
                    (walking settings travel as &tie=&maxWalk=, else the stored ones)
                    /api/routes (GET, POST, DELETE ?id=)   /api/settings (GET, PUT)
                    /api/login (POST form)   /api/logout (POST)   /api/health
src/proxy.ts        login check on every request (src/lib/auth.ts)
src/components/     StopPicker, BoardView, BoardApp, NetworkMap (Leaflet)
src/**/*.tests.ts   unit tests next to their source (`pnpm test`); `*.integration.tests.ts`
                    run on the demo feed and temp files (`pnpm test:integration`)
```

## What is and is not verified

Verified: `pnpm test` and `pnpm test:integration` (67 tests), `pnpm typecheck`, `pnpm build`,
and a headless-browser run of the page, all against the demo feed.

Not verified at first, because the environment this was built in could not reach gtfs.ovapi.nl:

- The import of the real national feed (column names follow the GTFS spec; duration and
  database size are unmeasured).
- Verified since: realtime `trip_id`s match the static feed (on 12 November 2026, 2,168 of
  12,393 trips in the realtime feed ran in the region; departures with a prediction show it).
- Whether real stop areas group the way the walking radii assume.

## Limits

- At most one change, and only when there is no useful direct ride.
- Trains are stored but hidden unless `trains=1` is passed to `/api/board`.
- Walks start at the centre of a stop area or the picked point. Station passages and other
  indoor routes are only as good as their mapping in OpenStreetMap; a stop more than 120 m
  from any mapped path cannot be walked to and does not count.

## Security and licence notes

- All SQL is parameterised; request input is validated and never interpolated into SQL.
- **Login.** With `AUTH_PASSWORD` set, every page and API call needs a login (`src/proxy.ts`,
  `src/lib/auth.ts`); only `/login`, its form handler and static files are public. There is one
  shared password and no accounts, matching the one list of saved routes. A login sets an
  HttpOnly, SameSite=Lax session cookie (`Secure` over HTTPS, also behind a proxy that sends
  `X-Forwarded-Proto`), signed with HMAC-SHA256 (`AUTH_SECRET`, or the password when that is
  not set), valid 30 days and renewed while in use. Unauthenticated API calls get 401; pages
  redirect to `/login` and come back afterwards (only to a path on this site). "Uitloggen" in
  "Kaart & instellingen" ends the session on that device and clears its offline copies.
  Production builds without `AUTH_PASSWORD` answer 503, unless `AUTH_DISABLED=true` (for a
  reverse proxy that authenticates already). The web manifest stays public so phones can
  install the app, but lists saved routes as shortcuts only with a valid session.
- Failed logins are limited in memory (5 per client per 15 minutes, 50 in total). The client
  is taken from `X-Forwarded-For`, which only a reverse proxy should set, so limit
  `/api/login` there as well. Other endpoints have **no rate limiting**; add it at the reverse
  proxy before exposing the app publicly.
- Saved routes may contain a home address as a map point; everyone with the password can read,
  change and delete them. Serve the app over HTTPS when it is reachable from outside your
  network, or the password and cookie travel in the clear.
- The map loads its background tiles in the visitor's browser from service.pdok.nl (the
  Dutch government's open base map; Netherlands only) or, when chosen, tile.openstreetmap.org.
  That is fine for light use; read the OSM tile usage policy (or switch to your own tile
  source in `NetworkMap.tsx`) before going public.
- Outbound requests go only to `GTFS_URL` / `GTFS_RT_URL` / `GTFS_ALERTS_URL` from the
  environment, never to a URL taken from a request.
- Road data © OpenStreetMap contributors (ODbL), via Geofabrik extracts. Keep the map's
  attribution visible.
- The timetable is open data (CC0). OVapi's terms for realtime data forbid storing it for
  more than 30 minutes; this app keeps one in-memory copy for 30 seconds and never writes it
  to disk. Keep it that way, and read the provider's current terms before going public.
- `OVAPI_USER_AGENT` is sent to the provider. Do not put a personal e-mail address in it in
  a public repository.
