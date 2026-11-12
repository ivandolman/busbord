// App configuration from environment variables, validated with Zod

import { z } from "zod"

// --- CONSTANTS ---

const DEFAULT_BBOX: BoundingBox = { minLat: 51.9, minLon: 4.6, maxLat: 52.32, maxLon: 5.65 }

const DEFAULT_OSM_EXTRACTS = ["utrecht", "zuid-holland", "noord-holland", "gelderland", "flevoland"]
    .map(
        (province) => `https://download.geofabrik.de/europe/netherlands/${province}-latest.osm.pbf`,
    )
    .join(",")

// --- SCHEMAS ---

/** Empty strings count as set (no fallback to the default), as `??` did before. */
const EnvSchema = z.object({
    GTFS_URL: z.string().default("https://gtfs.ovapi.nl/nl/gtfs-nl.zip"),
    GTFS_DB_PATH: z.string().default("data/gtfs.sqlite"),
    USER_DB_PATH: z.string().default("data/user.sqlite"),
    ROADS_PATH: z.string().default("data/roads.bin"),
    /** Parsed on demand with parseBoundingBox: only the import scripts need it. */
    GTFS_BBOX: z.string().optional(),
    OSM_EXTRACTS: z
        .string()
        .default(DEFAULT_OSM_EXTRACTS)
        .transform((value) =>
            value
                .split(",")
                .map((url) => url.trim())
                .filter(Boolean),
        ),
    GTFS_RT_ENABLED: z
        .string()
        .default("true")
        .transform((value) => value !== "false"),
    GTFS_RT_URL: z.string().default("https://gtfs.ovapi.nl/nl/tripUpdates.pb"),
    GTFS_ALERTS_URL: z.string().default("https://gtfs.ovapi.nl/nl/alerts.pb"),
    OVAPI_USER_AGENT: z.string().default("bestemmingsbord-prototype"),
})

const BoundingBoxSchema = z
    .string()
    .transform((raw) => raw.split(",").map((part) => Number(part.trim())))
    .pipe(z.tuple([z.number(), z.number(), z.number(), z.number()]))
    .transform(([minLat, minLon, maxLat, maxLon]) => ({ minLat, minLon, maxLat, maxLon }))
    .refine((box) => box.minLat < box.maxLat && box.minLon < box.maxLon)

export type BoundingBox = z.infer<typeof BoundingBoxSchema>

// --- SERVICE ---

export function parseBoundingBox(raw: string | undefined): BoundingBox {
    if (!raw) return DEFAULT_BBOX
    const parsed = BoundingBoxSchema.safeParse(raw)
    if (!parsed.success)
        throw new Error(`Invalid GTFS_BBOX "${raw}", expected minLat,minLon,maxLat,maxLon`)
    return parsed.data
}

const env = EnvSchema.parse(process.env)

export const config = {
    timeZone: "Europe/Amsterdam",
    gtfsUrl: env.GTFS_URL,
    dbPath: env.GTFS_DB_PATH,
    /** Saved routes and settings. Separate from the timetable, which every import replaces. */
    userDbPath: env.USER_DB_PATH,
    /** Road network built by "pnpm roads:import"; optional, used by the GTFS import to draw lines. */
    roadsPath: env.ROADS_PATH,
    /** Region to import, raw "minLat,minLon,maxLat,maxLon"; see parseBoundingBox. */
    gtfsBbox: env.GTFS_BBOX,
    /** OpenStreetMap extracts that together cover GTFS_BBOX (default: Utrecht and its neighbours). */
    osmExtracts: env.OSM_EXTRACTS,
    realtimeEnabled: env.GTFS_RT_ENABLED,
    realtimeUrl: env.GTFS_RT_URL,
    /** Service alerts (diversions, closed stops); off together with realtime. */
    alertsUrl: env.GTFS_ALERTS_URL,
    alertsTtlMs: 2 * 60_000,
    userAgent: env.OVAPI_USER_AGENT,
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
} as const
