// GET /api/departures: the next hour of departures from one stop, for the map's stop card

import { NextResponse, type NextRequest } from "next/server"

import { StopBoardQuerySchema } from "@/features/board/board.schema"
import { boardService } from "@/features/board/board.service"
import { handleRouteError, parseQuery } from "@/lib/http"

// --- CONSTANTS ---

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// --- HANDLER ---

/** `?stop=&to=&from=&walk=&maxWalk=&speed=`: `to` marks rides that reach it, `from` adds walks to the poles. */
export async function GET(request: NextRequest): Promise<NextResponse> {
    const query = parseQuery(StopBoardQuerySchema, request.nextUrl.searchParams, "Onbekende halte.")
    if (query.error) return query.error

    try {
        const board = await boardService.getStopBoard(query.data)
        return NextResponse.json(board, { headers: { "Cache-Control": "no-store" } })
    } catch (error) {
        return handleRouteError(error)
    }
}
