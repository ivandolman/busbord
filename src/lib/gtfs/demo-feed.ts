import { createWriteStream, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import yazl from "yazl";
import { shiftServiceDate } from "../time";

/**
 * A small, FICTIONAL timetable shaped like the Utrecht network. Stop names are real, but
 * routes, platforms and times are invented so the app and the tests can run without the
 * national feed. Never present this data as real travel information.
 */

interface DemoStop {
  id: string;
  name: string;
  lat: number;
  lon: number;
  parent: string;
  platform: string;
}

interface DemoLine {
  line: string;
  /** GTFS route_type: 0 = tram, 3 = bus. */
  type: 0 | 3;
  headwayMinutes: number;
  offsetMinutes: number;
  /** Platform id and minutes from the first stop. */
  pattern: [stopId: string, minutes: number][];
}

const STATIONS: [id: string, name: string, lat: number, lon: number][] = [
  ["stoparea:cs-centrum", "Utrecht, CS Centrumzijde", 52.0905, 5.1128],
  ["stoparea:cs-jaarbeurs", "Utrecht, CS Jaarbeurszijde", 52.0883, 5.107],
  ["stoparea:schouwburg", "Utrecht, Stadsschouwburg", 52.0936, 5.1247],
  ["stoparea:rijnsweerd", "Utrecht, Rijnsweerd", 52.0928, 5.1512],
  ["stoparea:galgenwaard", "Utrecht, Stadion Galgenwaard", 52.0787, 5.1447],
  ["stoparea:heidelberglaan", "Utrecht, Heidelberglaan", 52.0853, 5.1727],
  ["stoparea:umc", "Utrecht, UMC Utrecht", 52.0862, 5.1802],
  ["stoparea:pr-usp", "Utrecht, P+R Science Park", 52.0895, 5.1865],
  ["stoparea:de-bilt", "De Bilt, Dorp", 52.1097, 5.1789],
  ["stoparea:bilthoven", "Bilthoven, Station", 52.1296, 5.2052],
  ["stoparea:zeist", "Zeist, Busstation", 52.0891, 5.2343],
  ["stoparea:vleuterweide", "Utrecht, Vleuterweide", 52.0939, 5.0098],
  ["stoparea:nieuwegein", "Nieuwegein, City", 52.0293, 5.0859],
];

const PLATFORMS: [id: string, parent: string, platform: string][] = [
  ["cs-centrum-a1", "stoparea:cs-centrum", "A1"],
  ["cs-centrum-b2", "stoparea:cs-centrum", "B2"],
  ["cs-centrum-c", "stoparea:cs-centrum", "C"],
  ["cs-jaarbeurs-d4", "stoparea:cs-jaarbeurs", "D4"],
  ["cs-jaarbeurs-t", "stoparea:cs-jaarbeurs", "T"],
  ["schouwburg", "stoparea:schouwburg", ""],
  ["rijnsweerd", "stoparea:rijnsweerd", ""],
  ["galgenwaard", "stoparea:galgenwaard", ""],
  ["heidelberglaan-bus", "stoparea:heidelberglaan", ""],
  ["heidelberglaan-tram", "stoparea:heidelberglaan", ""],
  ["umc-bus", "stoparea:umc", ""],
  ["umc-tram", "stoparea:umc", ""],
  ["pr-usp", "stoparea:pr-usp", ""],
  ["de-bilt", "stoparea:de-bilt", ""],
  ["bilthoven", "stoparea:bilthoven", ""],
  ["zeist", "stoparea:zeist", ""],
  ["vleuterweide", "stoparea:vleuterweide", ""],
  ["nieuwegein-bus", "stoparea:nieuwegein", ""],
  ["nieuwegein-tram", "stoparea:nieuwegein", ""],
];

const LINES: DemoLine[] = [
  {
    line: "22",
    type: 0,
    headwayMinutes: 10,
    offsetMinutes: 2,
    pattern: [["cs-centrum-c", 0], ["galgenwaard", 7], ["heidelberglaan-tram", 12], ["umc-tram", 14], ["pr-usp", 17]],
  },
  {
    line: "20",
    type: 0,
    headwayMinutes: 10,
    offsetMinutes: 0,
    pattern: [
      ["nieuwegein-tram", 0],
      ["cs-jaarbeurs-t", 14],
      ["cs-centrum-c", 17],
      ["galgenwaard", 24],
      ["heidelberglaan-tram", 29],
      ["umc-tram", 31],
      ["pr-usp", 34],
    ],
  },
  {
    // Deliberately slow between CS and Science Park so trams overtake it.
    line: "28",
    type: 3,
    headwayMinutes: 8,
    offsetMinutes: 1,
    pattern: [
      ["vleuterweide", 0],
      ["cs-jaarbeurs-d4", 19],
      ["cs-centrum-b2", 23],
      ["schouwburg", 29],
      ["rijnsweerd", 37],
      ["heidelberglaan-bus", 46],
      ["umc-bus", 49],
    ],
  },
  {
    line: "18",
    type: 3,
    headwayMinutes: 15,
    offsetMinutes: 5,
    pattern: [["cs-centrum-b2", 0], ["schouwburg", 6], ["rijnsweerd", 13]],
  },
  {
    line: "77",
    type: 3,
    headwayMinutes: 10,
    offsetMinutes: 3,
    pattern: [
      ["nieuwegein-bus", 0],
      ["cs-jaarbeurs-d4", 18],
      ["cs-centrum-a1", 22],
      ["schouwburg", 28],
      ["de-bilt", 39],
      ["bilthoven", 47],
    ],
  },
  {
    line: "73",
    type: 3,
    headwayMinutes: 8,
    offsetMinutes: 4,
    pattern: [["cs-jaarbeurs-d4", 0], ["cs-centrum-a1", 4], ["schouwburg", 10], ["de-bilt", 22], ["zeist", 36]],
  },
];

const FIRST_DEPARTURE_MINUTES = 5 * 60 + 30;
/** Past midnight on purpose: GTFS keeps counting (24:30:00, 25:10:00) within one service day. */
const LAST_DEPARTURE_MINUTES = 25 * 60;
const SERVICE_ID = "demo-daily";

const formatTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:00`;

const csv = (rows: (string | number)[][]) =>
  rows.map((row) => row.map((value) => (/[",\n]/.test(String(value)) ? `"${String(value).replaceAll('"', '""')}"` : value)).join(",")).join("\n") + "\n";

export function buildDemoFeed(startDate: string, days = 14): Record<string, string> {
  const stationById = new Map(STATIONS.map((station) => [station[0], station]));
  const stops: DemoStop[] = PLATFORMS.map(([id, parent, platform]) => {
    const station = stationById.get(parent);
    if (!station) throw new Error(`Unknown demo station ${parent}`);
    return { id, name: station[1], lat: station[2], lon: station[3], parent, platform };
  });
  const stopName = new Map(stops.map((stop) => [stop.id, stop.name]));

  const stopRows: (string | number)[][] = [
    ["stop_id", "stop_name", "stop_lat", "stop_lon", "location_type", "parent_station", "platform_code"],
    ...STATIONS.map(([id, name, lat, lon]) => [id, name, lat, lon, 1, "", ""]),
    ...stops.map((stop) => [stop.id, stop.name, stop.lat, stop.lon, 0, stop.parent, stop.platform]),
  ];

  const routeRows: (string | number)[][] = [["route_id", "agency_id", "route_short_name", "route_long_name", "route_type"]];
  const tripRows: (string | number)[][] = [["route_id", "service_id", "trip_id", "trip_headsign", "direction_id"]];
  const stopTimeRows: (string | number)[][] = [
    ["trip_id", "stop_sequence", "stop_id", "arrival_time", "departure_time", "pickup_type", "drop_off_type"],
  ];

  for (const line of LINES) {
    const routeId = `demo-route-${line.line}`;
    const first = line.pattern[0];
    const last = line.pattern[line.pattern.length - 1];
    if (!first || !last) continue;
    routeRows.push([routeId, "DEMO", line.line, `${stopName.get(first[0])} - ${stopName.get(last[0])}`, line.type]);

    const duration = last[1];
    const directions = [
      line.pattern,
      [...line.pattern].reverse().map(([stopId, minutes]): [string, number] => [stopId, duration - minutes]),
    ];
    directions.forEach((pattern, direction) => {
      const terminus = pattern[pattern.length - 1];
      let tripNumber = 0;
      for (
        let start = FIRST_DEPARTURE_MINUTES + line.offsetMinutes;
        start <= LAST_DEPARTURE_MINUTES;
        start += line.headwayMinutes
      ) {
        const tripId = `demo-${line.line}-${direction}-${tripNumber++}`;
        tripRows.push([routeId, SERVICE_ID, tripId, stopName.get(terminus?.[0] ?? "") ?? "", direction]);
        pattern.forEach(([stopId, minutes], index) => {
          const time = formatTime(start + minutes);
          const isLast = index === pattern.length - 1;
          stopTimeRows.push([tripId, index + 1, stopId, time, time, isLast ? 1 : 0, index === 0 ? 1 : 0]);
        });
      }
    });
  }

  const calendarRows: (string | number)[][] = [["service_id", "date", "exception_type"]];
  for (let day = 0; day < days; day++) calendarRows.push([SERVICE_ID, shiftServiceDate(startDate, day), 1]);

  return {
    "agency.txt": csv([
      ["agency_id", "agency_name", "agency_url", "agency_timezone"],
      ["DEMO", "Demo (fictional timetable)", "https://example.org", "Europe/Amsterdam"],
    ]),
    "stops.txt": csv(stopRows),
    "routes.txt": csv(routeRows),
    "trips.txt": csv(tripRows),
    "stop_times.txt": csv(stopTimeRows),
    "calendar_dates.txt": csv(calendarRows),
  };
}

export function writeDemoFeed(zipPath: string, startDate: string, days = 14): Promise<void> {
  mkdirSync(dirname(zipPath), { recursive: true });
  const zip = new yazl.ZipFile();
  for (const [name, content] of Object.entries(buildDemoFeed(startDate, days))) {
    zip.addBuffer(Buffer.from(content, "utf8"), name);
  }
  zip.end();
  return new Promise((resolve, reject) => {
    zip.outputStream.pipe(createWriteStream(zipPath)).on("close", resolve).on("error", reject);
  });
}
