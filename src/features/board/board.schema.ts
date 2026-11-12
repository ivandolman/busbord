// Zod schemas for the board endpoints' query strings, with the input types derived from them

import { z } from "zod"

import {
    AreaIdSchema,
    DefaultOffFlagSchema,
    DefaultOnFlagSchema,
    PlaceIdSchema,
    PointIdSchema,
} from "@/lib/schemas"

// --- CONSTANTS ---

/** About what fits on screen with labels; more is refused rather than slowly answered. */
const MAX_AREAS = 120

const MAX_QUERY_LENGTH = 60

// --- SCHEMAS ---

/** `maxWalk` (minutes) and `tie` (minutes) stay raw: the user's stored settings fill them in. */
const SettingOverrideSchema = z.string().optional()

export const BoardQuerySchema = z
    .object({
        from: PlaceIdSchema,
        to: PlaceIdSchema,
        walk: DefaultOnFlagSchema,
        trains: DefaultOffFlagSchema,
        tie: SettingOverrideSchema,
        maxWalk: SettingOverrideSchema,
    })
    .refine((query) => query.from !== query.to, {
        message: "Vertrek en bestemming zijn dezelfde halte.",
    })

export const StopBoardQuerySchema = z.object({
    stop: PlaceIdSchema,
    to: PlaceIdSchema.optional(),
    from: PlaceIdSchema.optional(),
    walk: DefaultOnFlagSchema,
    maxWalk: SettingOverrideSchema,
})

/** `areas` is a comma-separated list; `to` comes first so its error wins when both are wrong. */
export const NextDeparturesQuerySchema = z.object({
    to: PlaceIdSchema,
    areas: z
        .string()
        .optional()
        .transform((value) => [...new Set((value ?? "").split(",").filter(Boolean))])
        .pipe(z.array(AreaIdSchema).min(1).max(MAX_AREAS)),
    walk: DefaultOnFlagSchema,
    maxWalk: SettingOverrideSchema,
})

export const PlaceQuerySchema = z.object({ id: PlaceIdSchema })

export const StopSearchQuerySchema = z.object({
    q: z
        .string()
        .optional()
        .transform((value) => value?.trim() ?? "")
        .pipe(z.string().max(MAX_QUERY_LENGTH)),
})

export const WalkAreaQuerySchema = z.object({
    id: PlaceIdSchema,
    walk: DefaultOnFlagSchema,
    role: z
        .string()
        .optional()
        .transform((value): "from" | "to" => (value === "to" ? "to" : "from")),
    maxWalk: SettingOverrideSchema,
})

export const WalkRouteQuerySchema = z.object({ from: PointIdSchema, to: PointIdSchema })

// --- INTERFACES ---

export type BoardQuery = z.infer<typeof BoardQuerySchema>
export type StopBoardQuery = z.infer<typeof StopBoardQuerySchema>
export type NextDeparturesQuery = z.infer<typeof NextDeparturesQuerySchema>
export type WalkAreaQuery = z.infer<typeof WalkAreaQuerySchema>
