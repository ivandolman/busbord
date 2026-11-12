// Shared Zod schemas for values that travel in URLs: stop area ids, map points and query flags

import { z } from "zod"

// --- CONSTANTS ---

const AREA_ID_PATTERN = /^[\w:.\-|]{1,80}$/

/** "@lat,lon"; points keep five decimals (about a metre), but up to seven are accepted. */
const POINT_ID_PATTERN = /^@(-?\d{1,2}(?:\.\d{1,7})?),(-?\d{1,3}(?:\.\d{1,7})?)$/

// --- SCHEMAS ---

export const AreaIdSchema = z.string().regex(AREA_ID_PATTERN)

export const PointSchema = z.object({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
})

/** A map point id ("@lat,lon"), parsed into its coordinates. */
export const PointIdSchema = z
    .string()
    .regex(POINT_ID_PATTERN)
    .transform((id) => {
        const match = POINT_ID_PATTERN.exec(id)
        return { lat: Number(match?.[1]), lon: Number(match?.[2]) }
    })
    .pipe(PointSchema)

/** A board endpoint: a stop area id or a map point id, kept as the id string. */
export const PlaceIdSchema = z
    .string()
    .refine((id) => AreaIdSchema.safeParse(id).success || PointIdSchema.safeParse(id).success)

/** A query flag that is on unless explicitly "0" (`walk`). */
export const DefaultOnFlagSchema = z
    .string()
    .optional()
    .transform((value) => value !== "0")

/** A query flag that is off unless explicitly "1" (`trains`). */
export const DefaultOffFlagSchema = z
    .string()
    .optional()
    .transform((value) => value === "1")
