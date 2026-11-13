// Zod schemas for the JSON the network map fetches from the API

import { z } from "zod"

import type { NextDepartures, StopBoard } from "@/features/board/board.types"

// --- SCHEMAS ---

const LatLonSchema = z.tuple([z.number(), z.number()])

const ModeSchema = z.enum(["tram", "bus", "metro", "train", "ferry", "other"])

/** What the current selection narrows the map to (see /api/reachable). */
export const ReachableSchema = z
    .object({
        direction: z.enum(["from", "to", "both"]),
        areas: z.array(z.string()),
        routes: z.array(z.string()),
        segments: z.array(z.object({ routeId: z.string(), path: z.array(LatLonSchema) })).nullish(),
        positions: z.record(z.string(), LatLonSchema).optional(),
        boardAreas: z.array(z.string()).nullish(),
    })
    .transform((body) => ({
        direction: body.direction,
        areas: new Set(body.areas),
        routes: new Set(body.routes),
        /** With origin and destination: only the stretch of each line you ride. */
        segments: body.segments ?? null,
        /** With origin and destination: where to draw a stop, between the platforms the rides use. */
        positions: new Map(Object.entries(body.positions ?? {})),
        /** Stop areas you can get on at (the origin's); null without an origin: anywhere. */
        boardAreas: body.boardAreas ? new Set(body.boardAreas) : null,
    }))

export type Reachable = z.output<typeof ReachableSchema>

/** See /api/walk-area. */
export const WalkAreaSchema = z.object({
    center: LatLonSchema,
    radiusMeters: z.number(),
    minutes: z.number(),
    polygon: z.array(LatLonSchema).nullable(),
})

/** See /api/walk-route: null when the server has no road network or no route. */
export const WalkRouteSchema = z.object({
    path: z.array(LatLonSchema).nullable(),
})

const StopPoleSchema = z.object({
    id: z.string(),
    label: z.string(),
    lat: z.number(),
    lon: z.number(),
    towards: z.string().nullable(),
    walkMeters: z.number().nullable(),
    walkSeconds: z.number().nullable(),
})

/** See /api/departures: one stop's own board. */
export const StopBoardSchema: z.ZodType<StopBoard> = z.object({
    stop: z.object({ id: z.string(), name: z.string() }),
    generatedAt: z.number(),
    realtime: z.enum(["live", "unavailable", "disabled"]),
    destination: z.object({ id: z.string(), name: z.string() }).nullable(),
    poles: z.array(StopPoleSchema),
    departures: z.array(
        z.object({
            tripId: z.string(),
            line: z.string(),
            mode: ModeSchema,
            headsign: z.string(),
            platform: z.string(),
            plannedDeparture: z.number(),
            expectedDeparture: z.number(),
            cancelled: z.boolean(),
            toDestination: z.boolean(),
            poleId: z.string(),
        }),
    ),
    station: z
        .object({
            areaId: z.string(),
            name: z.string(),
            platforms: z.array(z.object({ code: z.string(), lat: z.number(), lon: z.number() })),
        })
        .nullable(),
})

/** See /api/next-departures: the next ride per line towards the destination, per stop area. */
export const NextDeparturesSchema: z.ZodType<NextDepartures> = z.object({
    generatedAt: z.number(),
    areas: z.record(
        z.string(),
        z.array(z.object({ line: z.string(), mode: ModeSchema, expectedDeparture: z.number() })),
    ),
})

/** See /api/night-lines: route ids of the night lines you can still catch. */
export const NightLinesSchema = z
    .object({ routes: z.array(z.string()) })
    .transform((body) => new Set(body.routes))
