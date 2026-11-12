// Zod schemas for saved routes, lenient enough for old, hand-edited or half-written storage

import { z } from "zod"

import { isPlaceId } from "@/lib/place"

// --- CONSTANTS ---

export const MAX_ROUTE_NAME_LENGTH = 60
const MAX_ROUTE_ID_LENGTH = 40
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

// --- SCHEMAS ---

/**
 * An endpoint: a stop area or a point picked on the map, exactly as in the URL, so a saved route
 * opens the same board.
 */
export const SavedPlaceSchema = z.object({
    id: z.string().refine((id) => isPlaceId(id)),
    name: z
        .string()
        .catch("")
        .transform((name) => name.slice(0, MAX_ROUTE_NAME_LENGTH)),
})

export type SavedPlace = z.infer<typeof SavedPlaceSchema>

/**
 * When a route is a regular trip (to work in the morning, home in the afternoon). Opening the app
 * without a route inside this window opens it straight away. Times are local "HH:MM"; an end
 * before the start runs past midnight.
 */
export const RouteScheduleSchema = z
    .object({
        /** 0 = Sunday … 6 = Saturday, as Date.getDay(). Invalid days are dropped, not rejected. */
        days: z
            .array(z.unknown())
            .transform((days) =>
                [
                    ...new Set(
                        days.filter(
                            (day): day is number =>
                                typeof day === "number" &&
                                Number.isInteger(day) &&
                                day >= 0 &&
                                day <= 6,
                        ),
                    ),
                ].sort(),
            )
            .refine((days) => days.length > 0),
        start: z.string().regex(TIME_PATTERN),
        end: z.string().regex(TIME_PATTERN),
    })
    .refine((schedule) => schedule.start !== schedule.end)

export type RouteSchedule = z.infer<typeof RouteScheduleSchema>

/** A route with an unreadable schedule is kept without one; `walk` is on unless explicitly off. */
export const SavedRouteSchema = z.object({
    id: z.string().transform((id) => id.slice(0, MAX_ROUTE_ID_LENGTH)),
    name: z.string().transform((name) => name.slice(0, MAX_ROUTE_NAME_LENGTH)),
    from: SavedPlaceSchema,
    to: SavedPlaceSchema,
    walk: z
        .unknown()
        .optional()
        .transform((walk) => walk !== false),
    savedAt: z.number().catch(0),
    schedule: RouteScheduleSchema.nullable().catch(null),
})

export type SavedRoute = z.infer<typeof SavedRouteSchema>
