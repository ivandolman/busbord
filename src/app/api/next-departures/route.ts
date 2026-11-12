// GET /api/next-departures: per stop area on the map, the next ride of each line towards `to`

import { NextResponse, type NextRequest } from "next/server"

import { NextDeparturesQuerySchema } from "@/features/board/board.schema"
import { boardService } from "@/features/board/board.service"
import { handleRouteError, parseQuery } from "@/lib/http"

// --- CONSTANTS ---

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// --- HANDLER ---

/** `?areas=a,b,c&to=…&walk=&maxWalk=` */
export async function GET(request: NextRequest): Promise<NextResponse> {
    const query = parseQuery(NextDeparturesQuerySchema, request.nextUrl.searchParams, (issue) =>
        issue.path?.[0] === "to" ? "Kies een bestemming." : "Onbekende haltes.",
    )
    if (query.error) return query.error

    try {
        const result = await boardService.getNextDepartures(query.data)
        return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } })
    } catch (error) {
        return handleRouteError(error)
    }
}
