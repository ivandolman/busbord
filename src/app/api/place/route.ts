// GET /api/place: display name for a stop area, address or map point, for selections restored from the URL

import { NextResponse, type NextRequest } from "next/server"

import { PlaceQuerySchema } from "@/features/board/board.schema"
import { boardService } from "@/features/board/board.service"
import { handleRouteError, parseQuery } from "@/lib/http"

// --- CONSTANTS ---

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// --- HANDLER ---

export async function GET(request: NextRequest): Promise<NextResponse> {
    const query = parseQuery(PlaceQuerySchema, request.nextUrl.searchParams, "Onbekende plek.")
    if (query.error) return query.error

    try {
        const place = await boardService.getPlace(query.data.id)
        return NextResponse.json(place, { headers: { "Cache-Control": "private, max-age=3600" } })
    } catch (error) {
        return handleRouteError(error)
    }
}
