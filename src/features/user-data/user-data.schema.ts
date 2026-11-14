// Zod schemas for the traveller's settings, as stored and as sent by the client

import { z } from "zod"

// --- CONSTANTS ---

export const MAX_WALK_TIE_MINUTES = 15
export const MIN_MAX_WALK_MINUTES = 2
export const MAX_MAX_WALK_MINUTES = 25
export const MIN_WALK_KMH = 3
export const MAX_WALK_KMH = 7

// --- SCHEMAS ---

/** Whole minutes in range, given as a number or as text (a query parameter, a stored value). */
const wholeMinutes = (min: number, max: number) =>
    z.preprocess(
        (value) => (typeof value === "string" && value.trim() !== "" ? Number(value) : value),
        z.int().min(min).max(max),
    )

export const WalkTieMinutesSchema = wholeMinutes(0, MAX_WALK_TIE_MINUTES)

/** Walking speed in km/h, in half steps, as a number or as text. */
export const WalkKmhSchema = z.preprocess(
    (value) => (typeof value === "string" && value.trim() !== "" ? Number(value) : value),
    z.number().min(MIN_WALK_KMH).max(MAX_WALK_KMH).multipleOf(0.5),
)
export const MaxWalkMinutesSchema = wholeMinutes(MIN_MAX_WALK_MINUTES, MAX_MAX_WALK_MINUTES)

/** Map background: a quiet grey map, or the detailed OpenStreetMap one. */
export const MapStyleSchema = z.enum(["calm", "detailed"])

export type MapStyle = z.infer<typeof MapStyleSchema>

/** What the traveller can tune. Stored next to the saved routes. */
export const SettingsSchema = z.object({
    /** Prefer the stops with less walking while the trip takes at most this many minutes longer. */
    walkTieMinutes: WalkTieMinutesSchema,
    mapStyle: MapStyleSchema,
    /** The longest walk to (or from) a stop that still counts. */
    maxWalkMinutes: MaxWalkMinutesSchema,
    /** How fast the traveller walks; every walking time on the board follows it. */
    walkKmh: WalkKmhSchema,
})

export type Settings = z.infer<typeof SettingsSchema>

/** A settings change: missing settings are left out, so a client can change one at a time. */
export const SettingsUpdateSchema = SettingsSchema.partial()
