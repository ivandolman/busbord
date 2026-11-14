// GET /api/walk-area: the area within walking distance of an origin or destination

import { NextResponse, type NextRequest } from "next/server"

import { WalkAreaQuerySchema } from "@/features/board/board.schema"
import { boardService } from "@/features/board/board.service"
import { handleRouteError, parseQuery } from "@/lib/http"

// --- CONSTANTS ---

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// --- HANDLER ---

/**
 * `?id=&walk=&role=from|to&maxWalk=&speed=`. `polygon` is null without a road network (or off it); the
 * map then draws a circle of `radiusMeters` as the crow flies.
 */
export function GET(request: NextRequest): NextResponse {
    const query = parseQuery(WalkAreaQuerySchema, request.nextUrl.searchParams, "Onbekende plek.")
    if (query.error) return query.error

    try {
        const area = boardService.getWalkArea(query.data)
        return NextResponse.json(area, { headers: { "Cache-Control": "private, max-age=3600" } })
    } catch (error) {
        return handleRouteError(error)
    }
}
