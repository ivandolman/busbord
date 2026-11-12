// GET /api/board: departures from an origin to a destination, with walks, live times and alerts

import { NextResponse, type NextRequest } from "next/server"

import { BoardQuerySchema } from "@/features/board/board.schema"
import { boardService } from "@/features/board/board.service"
import { handleRouteError, parseQuery } from "@/lib/http"

// --- CONSTANTS ---

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// --- HANDLER ---

export async function GET(request: NextRequest): Promise<NextResponse> {
    const query = parseQuery(
        BoardQuerySchema,
        request.nextUrl.searchParams,
        "Kies een vertrek- en een bestemmingshalte.",
    )
    if (query.error) return query.error

    try {
        const board = await boardService.getBoard(query.data)
        return NextResponse.json(board, { headers: { "Cache-Control": "no-store" } })
    } catch (error) {
        return handleRouteError(error)
    }
}
