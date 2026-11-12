// GET /api/walk-route: the walking route between two map points along streets and footpaths

import { NextResponse, type NextRequest } from "next/server"

import { WalkRouteQuerySchema } from "@/features/board/board.schema"
import { boardService } from "@/features/board/board.service"
import { handleRouteError, parseQuery } from "@/lib/http"

// --- CONSTANTS ---

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// --- HANDLER ---

/** `?from=@lat,lon&to=@lat,lon`; `path` is null when there is no walking route to draw. */
export function GET(request: NextRequest): NextResponse {
    const query = parseQuery(
        WalkRouteQuerySchema,
        request.nextUrl.searchParams,
        "Ongeldige punten.",
    )
    if (query.error) return query.error

    try {
        const route = boardService.getWalkRoute(query.data.from, query.data.to)
        return NextResponse.json(route, { headers: { "Cache-Control": "private, max-age=3600" } })
    } catch (error) {
        return handleRouteError(error)
    }
}
