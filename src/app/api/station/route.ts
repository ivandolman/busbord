// GET /api/station: the train station near a stop area or map point, with its platforms

import { NextResponse, type NextRequest } from "next/server"

import { PlaceQuerySchema } from "@/features/board/board.schema"
import { boardService } from "@/features/board/board.service"
import { handleRouteError, parseQuery } from "@/lib/http"

// --- CONSTANTS ---

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// --- HANDLER ---

export function GET(request: NextRequest): NextResponse {
    const query = parseQuery(PlaceQuerySchema, request.nextUrl.searchParams, "Onbekende plek.")
    if (query.error) return query.error

    try {
        const station = boardService.getStation(query.data.id)
        return NextResponse.json(
            { station },
            { headers: { "Cache-Control": "private, max-age=3600" } },
        )
    } catch (error) {
        return handleRouteError(error)
    }
}
