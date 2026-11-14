// GET /api/reachable: the lines and stops the map highlights for the current origin and destination

import { NextResponse, type NextRequest } from "next/server"

import { ReachableQuerySchema } from "@/features/network/network.schema"
import { networkService } from "@/features/network/network.service"
import { handleRouteError, parseQuery } from "@/lib/http"

// --- CONSTANTS ---

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// --- HANDLER ---

/** `?from=&to=&walk=&maxWalk=&tie=&speed=`, at least one of `from` and `to`. */
export function GET(request: NextRequest): NextResponse {
    const query = parseQuery(
        ReachableQuerySchema,
        request.nextUrl.searchParams,
        "Kies een vertrekpunt of bestemming.",
    )
    if (query.error) return query.error

    try {
        const reachable = networkService.getReachable(query.data)
        return NextResponse.json(reachable, {
            headers: { "Cache-Control": "private, max-age=300" },
        })
    } catch (error) {
        return handleRouteError(error)
    }
}
