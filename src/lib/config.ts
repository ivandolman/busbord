export interface BoundingBox {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}

const DEFAULT_BBOX: BoundingBox = { minLat: 51.9, minLon: 4.75, maxLat: 52.32, maxLon: 5.65 };

export function parseBoundingBox(raw: string | undefined): BoundingBox {
  if (!raw) return DEFAULT_BBOX;
  const parts = raw.split(",").map((part) => Number(part.trim()));
  const [minLat, minLon, maxLat, maxLon] = parts;
  if (
    parts.length !== 4 ||
    minLat === undefined ||
    minLon === undefined ||
    maxLat === undefined ||
    maxLon === undefined ||
    parts.some((value) => !Number.isFinite(value)) ||
    minLat >= maxLat ||
    minLon >= maxLon
  ) {
    throw new Error(`Invalid GTFS_BBOX "${raw}", expected minLat,minLon,maxLat,maxLon`);
  }
  return { minLat, minLon, maxLat, maxLon };
}

export const config = {
  timeZone: "Europe/Amsterdam",
  gtfsUrl: process.env.GTFS_URL ?? "https://gtfs.ovapi.nl/nl/gtfs-nl.zip",
  dbPath: process.env.GTFS_DB_PATH ?? "data/gtfs.sqlite",
  /** Saved routes and settings. Separate from the timetable, which every import replaces. */
  userDbPath: process.env.USER_DB_PATH ?? "data/user.sqlite",
  /** Road network built by "pnpm roads:import"; optional, used by the GTFS import to draw lines. */
  roadsPath: process.env.ROADS_PATH ?? "data/roads.bin",
  /** OpenStreetMap extracts that together cover GTFS_BBOX (default: Utrecht and its neighbours). */
  osmExtracts: (
    process.env.OSM_EXTRACTS ??
    ["utrecht", "zuid-holland", "noord-holland", "gelderland", "flevoland"]
      .map((province) => `https://download.geofabrik.de/europe/netherlands/${province}-latest.osm.pbf`)
      .join(",")
  )
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean),
  realtimeEnabled: (process.env.GTFS_RT_ENABLED ?? "true") !== "false",
  realtimeUrl: process.env.GTFS_RT_URL ?? "https://gtfs.ovapi.nl/nl/tripUpdates.pb",
  /** Service alerts (diversions, closed stops); off together with realtime. */
  alertsUrl: process.env.GTFS_ALERTS_URL ?? "https://gtfs.ovapi.nl/nl/alerts.pb",
  alertsTtlMs: 2 * 60_000,
  userAgent: process.env.OVAPI_USER_AGENT ?? "bestemmingsbord-prototype",
  /** The data licence forbids keeping realtime data for more than 30 minutes; we keep it far shorter. */
  realtimeTtlMs: 30_000,
  board: {
    horizonSeconds: 90 * 60,
    maxDepartures: 20,
    destinationWalkMeters: 150,
    /** Areas with the same name this close together are one stop to a traveller (bus and tram side). */
    sameStopMeters: 200,
    /** Stops used for a point picked on the map, without and with "stops within walking distance". */
    pointMeters: 400,
    /** The longest walk to a stop unless the traveller sets another (setting "Max lopen"). */
    defaultMaxWalkMinutes: 12,
  },
} as const;
