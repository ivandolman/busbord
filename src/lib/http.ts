// Route handler helpers: query parsing with Zod, JSON errors and mapping known failures

import { NextResponse } from "next/server"

import { z } from "zod"

import { WalkTooLongError } from "@/features/board/board.service"
import { UnknownAreaError } from "@/features/board/endpoint"
import { DatabaseMissingError } from "@/lib/db"

// --- INTERFACES ---

type QueryResult<T> = { data: T; error: null } | { data: null; error: NextResponse }

// --- HELPERS ---

export function jsonError(status: number, message: string): NextResponse {
    return NextResponse.json(
        { error: message },
        { status, headers: { "Cache-Control": "no-store" } },
    )
}

/**
 * Validates search parameters against a schema. An invalid query becomes a 400 with the first
 * issue's message: the schema's own message where it sets one, else `message` (a fixed text, or
 * one chosen per issue).
 */
export function parseQuery<T extends z.ZodType>(
    schema: T,
    params: URLSearchParams,
    message: string | ((issue: z.core.$ZodRawIssue) => string),
): QueryResult<z.output<T>> {
    const input = Object.fromEntries(
        [...new Set(params.keys())].map((key) => [key, params.get(key)]),
    )
    const result = schema.safeParse(input, {
        error: typeof message === "string" ? () => message : message,
    })
    if (result.success) return { data: result.data, error: null }
    return { data: null, error: jsonError(400, result.error.issues[0]?.message ?? "") }
}

/** Maps known failures to useful responses; anything else is logged and hidden from the client. */
export function handleRouteError(error: unknown): NextResponse {
    if (error instanceof UnknownAreaError) return jsonError(404, "Onbekende halte.")
    if (error instanceof WalkTooLongError) return jsonError(400, "Te ver om te lopen.")
    if (error instanceof DatabaseMissingError) {
        return jsonError(503, "De dienstregeling is nog niet geïmporteerd.")
    }
    console.error(error)
    return jsonError(500, "Er ging iets mis.")
}
