// GET /api/stops: stop search by name for the stop picker

import { NextResponse, type NextRequest } from "next/server"

import { StopSearchQuerySchema } from "@/features/board/board.schema"
import { boardService } from "@/features/board/board.service"
import { handleRouteError, parseQuery } from "@/lib/http"

// --- CONSTANTS ---

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Shorter queries match too much to be useful; they get an empty, uncached answer. */
const MIN_QUERY_LENGTH = 2

// --- HANDLER ---

export function GET(request: NextRequest): NextResponse {
    const query = parseQuery(
        StopSearchQuerySchema,
        request.nextUrl.searchParams,
        "Zoekterm is te lang.",
    )
    if (query.error) return query.error
    if (query.data.q.length < MIN_QUERY_LENGTH) return NextResponse.json({ stops: [] })

    try {
        const stops = boardService.searchStops(query.data.q)
        return NextResponse.json({ stops }, { headers: { "Cache-Control": "private, max-age=60" } })
    } catch (error) {
        return handleRouteError(error)
    }
}
